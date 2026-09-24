import { ModelProvider } from '../client/ModelProvider.js';
import { ModelMessage, ModelRequest } from '../types/model.js';
import { ToolRegistry, globalToolRegistry } from '../tools/ToolRegistry.js';
import { EvidenceTracker } from '../research-loop/EvidenceTracker.js';
import { AgentDefinition, ResearchTeamDefinition, ResearchTeamMember, ScientificFinding, TeamTask, ScientificHandoff, StructuredRunError } from './types.js';
import { RawPlanSubmission, buildPlanSubmitToolSpec } from './TeamPlanner.js';

/**
 * The scoped, single-task tool-calling loop a team member (or the leader,
 * or the reviewing critic) runs. Deliberately NOT the full
 * AutonomousResearchEngine/ResearchEngine loop -- design doc section 10:
 * "科研小队成员不能直接调用这个顶层入口，否则成员内部又会启动完整自主研究循环."
 * This is a lighter, standalone loop parallel to AgentLoop, but scoped by
 * AgentDefinition/team membership rather than the single-agent AgentRegistry,
 * and always ends by either a forced structured tool call (plan/handoff/
 * review) or a plain synthesis turn -- never free-running indefinitely.
 */

export const HANDOFF_SUBMIT_TOOL_NAME = 'team_task_submit_handoff';
export const REVIEW_SUBMIT_TOOL_NAME = 'team_review_submit';

export interface RawHandoffSubmission {
  summary: string;
  methods: string[];
  findings: { kind: ScientificFinding['kind']; statement: string; evidenceIds: string[]; confidence?: number }[];
  limitations: string[];
  unresolvedQuestions: string[];
  recommendedNextActions: string[];
  confidence: number;
}

export interface RawReviewSubmission {
  verdict: 'passed' | 'revision_required' | 'blocked_by_missing_evidence' | 'failed_integrity_check';
  issues: string[];
  recommendations: string[];
  summary: string;
}

function buildHandoffSubmitToolSpec(evidenceIds: string[]): { name: string; description: string; parameters: Record<string, any> } {
  return {
    name: HANDOFF_SUBMIT_TOOL_NAME,
    description:
      'Submit your completed work on this task as a structured handoff. This is the ONLY way to finish the task -- a plain-text answer is not accepted. Every finding must reference real evidence ids from your tool calls (the "Available evidence ids" list below), except for hypothesis-kind findings, which may have none. A tool/network/permission failure must be reported as an execution_error finding, never as a negative_result.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        methods: { type: 'array', items: { type: 'string' } },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['observation', 'inference', 'hypothesis', 'negative_result', 'execution_error'] },
              statement: { type: 'string' },
              evidenceIds: { type: 'array', items: { type: 'string', enum: evidenceIds.length > 0 ? evidenceIds : undefined } },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['kind', 'statement', 'evidenceIds'],
          },
        },
        limitations: { type: 'array', items: { type: 'string' } },
        unresolvedQuestions: { type: 'array', items: { type: 'string' } },
        recommendedNextActions: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Your overall confidence in this handoff.' },
      },
      required: ['summary', 'methods', 'findings', 'limitations', 'unresolvedQuestions', 'recommendedNextActions', 'confidence'],
    },
  };
}

function buildReviewSubmitToolSpec(): { name: string; description: string; parameters: Record<string, any> } {
  return {
    name: REVIEW_SUBMIT_TOOL_NAME,
    description:
      'Submit your independent review verdict for this team run. Check whether claims are backed by evidence, whether statistics/sample sizes/multiple comparisons are sound, whether citations actually support their conclusions, whether positive and negative evidence are presented fairly, and whether any tool/network/permission failure has been mislabeled as a negative scientific result.',
    parameters: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['passed', 'revision_required', 'blocked_by_missing_evidence', 'failed_integrity_check'] },
        issues: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' },
      },
      required: ['verdict', 'issues', 'recommendations', 'summary'],
    },
  };
}

interface ScopedLoopParams {
  agentDef: AgentDefinition;
  member?: ResearchTeamMember;
  systemPrompt: string;
  userPrompt: string;
  forcedTool: { name: string; description: string; parameters: Record<string, any> };
  modelProvider: ModelProvider;
  model: string;
  sessionId: string;
  turnIndexBase: number;
  maxTurns: number;
  toolRegistry: ToolRegistry;
  evidenceTracker: EvidenceTracker;
  allowDomainTools: boolean;
}

interface ScopedLoopResult {
  submission?: any;
  error?: StructuredRunError;
  turnsUsed: number;
}

/** Intersects an agent's allowed tool categories with a member's optional capability overrides, then resolves to real tool definitions. */
function resolveScopedTools(agentDef: AgentDefinition, member: ResearchTeamMember | undefined, toolRegistry: ToolRegistry) {
  const categories = new Set(agentDef.allowedToolCategories);
  return toolRegistry.list().filter((tool) => {
    if (!categories.has(tool.category)) return false;
    if (member?.capabilityOverrides && member.capabilityOverrides.length > 0) {
      // capabilityOverrides narrow, never widen, an agent's own tool categories.
      return member.capabilityOverrides.includes(tool.category);
    }
    return true;
  });
}

async function runScopedLoop(params: ScopedLoopParams): Promise<ScopedLoopResult> {
  const { agentDef, member, systemPrompt, userPrompt, forcedTool, modelProvider, model, sessionId, turnIndexBase, maxTurns, toolRegistry, evidenceTracker, allowDomainTools } = params;

  const domainTools = allowDomainTools ? resolveScopedTools(agentDef, member, toolRegistry) : [];
  const messages: ModelMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let turnsUsed = 0;
  let lastResponseContent = '';
  // Without this the model can just keep answering in plain text and burn the
  // whole turn budget in silence -- 'required' when other (domain) tools are
  // also offered still lets it choose which tool, but it must call *something*;
  // when the forced tool is the only tool on offer (e.g. leader planning), we
  // pin it to that exact tool so the very first turn submits the plan.
  const toolChoice: ModelRequest['toolChoice'] = allowDomainTools ? 'required' : { name: forcedTool.name };
  while (turnsUsed < maxTurns) {
    turnsUsed++;
    const request: ModelRequest = {
      model,
      messages,
      tools: [
        ...domainTools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })),
        forcedTool,
      ],
      toolChoice,
    };

    let response;
    try {
      response = await modelProvider.generate(request);
    } catch (err: any) {
      return { error: { code: 'MODEL_REQUEST_FAILED', message: err?.message || String(err), cause: 'tool-failure' }, turnsUsed };
    }

    if (response.finishReason === 'tool_calls' && response.toolCalls && response.toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: response.content || '',
        toolCalls: response.toolCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })),
      });

      let submission: any;
      for (const call of response.toolCalls) {
        if (call.name === forcedTool.name) {
          submission = call.arguments;
          continue;
        }
        const result = await toolRegistry.execute(call.name, call.arguments, sessionId, agentDef.id, turnIndexBase + turnsUsed);
        if (result.success) {
          const queryStr = call.arguments?.query || call.arguments?.accessionOrGene || call.arguments?.compoundNameOrCID || JSON.stringify(call.arguments);
          try {
            evidenceTracker.record(
              call.name,
              result.execution?.category || 'databases',
              String(queryStr),
              result.execution?.resultSummary || 'Tool executed successfully',
              result.output,
              result.citations,
              result.artifacts,
              result.evidenceVerification
            );
          } catch {
            // Rejected evidence (EvidenceTracker throws on REJECTED verdict) -- treat like a tool failure below.
          }
          messages.push({
            role: 'tool',
            name: call.name,
            content: typeof result.output === 'string' ? result.output : JSON.stringify(result.output || result.error),
            toolCallId: call.id,
          });
        } else {
          messages.push({
            role: 'tool',
            name: call.name,
            content: `[Tool execution failed]: ${result.error || 'unknown error'}`,
            toolCallId: call.id,
          });
        }
      }

      if (submission !== undefined) {
        return { submission, turnsUsed };
      }
      continue;
    }

    // Model produced plain text instead of calling the required structured tool -- nudge and retry.
    lastResponseContent = response.content || '';
    messages.push({ role: 'assistant', content: lastResponseContent });
    messages.push({
      role: 'user',
      content: `You must call the "${forcedTool.name}" tool to finish -- a plain-text answer is not accepted. Please call it now.`,
    });
  }

  const lastReplySnippet = lastResponseContent ? ` Last model reply: "${lastResponseContent.slice(0, 300)}"` : ' The model never produced a tool call or reply text on its final turn.';
  return {
    error: {
      code: 'AGENT_TURN_BUDGET_EXHAUSTED',
      message: `Exhausted ${maxTurns} turns without a "${forcedTool.name}" submission.${lastReplySnippet}`,
      cause: 'tool-failure',
    },
    turnsUsed,
  };
}

export interface RunLeaderPlanningParams {
  team: ResearchTeamDefinition;
  leaderAgentDef: AgentDefinition;
  inquiry: string;
  modelProvider: ModelProvider;
  model: string;
  sessionId: string;
  maxTurns?: number;
}

/**
 * A member's effective system prompt for a team run.
 *
 * Three layers, innermost first: the agent's own read-only systemPrompt, the
 * account-wide standing instructions the user wrote on its member card
 * (AgentDefinition.userInstructions), and the brief for this particular team
 * (ResearchTeamMember.memberInstructions). Both instruction layers were
 * editable in the UI and persisted, and the runner read neither -- every
 * team task ran against the stock prompt, so a user who told a member
 * "always report 95% CIs" saw that honoured in a 1:1 conversation and
 * silently ignored by the same member on a team.
 *
 * Order matters: later layers are meant to qualify earlier ones, and the
 * agent's own prompt stays first because allowedToolCategories is enforced
 * against it.
 */
function memberSystemPrompt(
  agentDef: AgentDefinition,
  member: ResearchTeamMember | undefined,
  team: ResearchTeamDefinition,
  roleInThisRun: string
): string {
  const layers = [agentDef.systemPrompt];

  const standing = agentDef.userInstructions?.trim();
  if (standing) layers.push(`Standing instructions from the user (always apply):\n${standing}`);

  const brief = member?.memberInstructions?.trim();
  if (brief) layers.push(`Your brief on this team (applies to this team only):\n${brief}`);

  layers.push(`Team instructions: ${team.instructions || '(none)'}`);
  layers.push(roleInThisRun);
  return layers.join('\n\n');
}

export async function runLeaderPlanning(params: RunLeaderPlanningParams): Promise<{ plan?: RawPlanSubmission; error?: StructuredRunError }> {
  const { team, leaderAgentDef, inquiry, modelProvider, model, sessionId, maxTurns = 4 } = params;
  const roster = team.members
    .map((m) => `- ${m.agentId} (${m.role}${m.required ? '' : ', optional'})`)
    .join('\n');

  const leaderMember = team.members.find((m) => m.agentId === leaderAgentDef.id);
  const systemPrompt = memberSystemPrompt(
    leaderAgentDef,
    leaderMember,
    team,
    `Budget: at most ${team.maxTasks} tasks, at most ${team.maxConcurrency} running concurrently, at most ${team.maxRevisionsPerTask} revisions per task.`
  );
  const userPrompt = `Research inquiry: "${inquiry}"\n\nTeam roster (assign tasks only to these agent ids):\n${roster}\n\nPlan a task graph that answers this inquiry. Keep it as small as the inquiry actually needs. Call ${'team_plan_submit'} with your plan.`;

  const forcedTool = buildPlanSubmitToolSpec(team);
  // The leader does not run domain tools during planning -- it plans, it does not do specialist data work itself
  // (design doc 7.1: "队长在 team 模式下原则上不执行专业数据任务").
  const result = await runScopedLoop({
    agentDef: leaderAgentDef,
    systemPrompt,
    userPrompt,
    forcedTool,
    modelProvider,
    model,
    sessionId,
    turnIndexBase: 0,
    maxTurns,
    toolRegistry: globalToolRegistry,
    evidenceTracker: new EvidenceTracker(), // unused (no domain tools in this loop), kept for signature symmetry
    allowDomainTools: false,
  });

  if (result.error) return { error: result.error };
  return { plan: result.submission as RawPlanSubmission };
}

export interface RunMemberTaskParams {
  team: ResearchTeamDefinition;
  member: ResearchTeamMember;
  agentDef: AgentDefinition;
  task: TeamTask;
  inquiry: string;
  dependencyHandoffs: ScientificHandoff[];
  modelProvider: ModelProvider;
  model: string;
  sessionId: string;
  evidenceTracker: EvidenceTracker;
  maxTurns?: number;
}

export async function runMemberTask(
  params: RunMemberTaskParams
): Promise<{ raw?: RawHandoffSubmission; error?: StructuredRunError }> {
  const { team, member, agentDef, task, inquiry, dependencyHandoffs, modelProvider, model, sessionId, evidenceTracker, maxTurns = 6 } = params;

  const dependencyContext = dependencyHandoffs.length
    ? dependencyHandoffs
        .map((h) => `- From ${h.agentId}: ${h.summary}\n  Findings: ${h.findings.map((f) => `[${f.kind}] ${f.statement}`).join('; ') || '(none)'}`)
        .join('\n')
    : '(no dependency handoffs)';

  const systemPrompt = memberSystemPrompt(
    agentDef,
    member,
    team,
    'You are working on ONE task within a larger team research run. You only see what this task needs -- not the full team conversation.'
  );
  const userPrompt = `Original research inquiry (context only): "${inquiry}"\n\nYour task: ${task.title}\nObjective: ${task.objective}\nAcceptance criteria:\n${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}\n\nDependency handoffs:\n${dependencyContext}\n\nUse your tools to gather real evidence, then call "${HANDOFF_SUBMIT_TOOL_NAME}" with your structured handoff. Every finding except a hypothesis must cite a real evidence id from a tool call you actually made.`;

  const result = await runScopedLoop({
    agentDef,
    member,
    systemPrompt,
    userPrompt,
    forcedTool: buildHandoffSubmitToolSpec(evidenceTracker.list().map((e) => e.id)),
    modelProvider,
    model,
    sessionId,
    turnIndexBase: 0,
    maxTurns,
    toolRegistry: globalToolRegistry,
    evidenceTracker,
    allowDomainTools: true,
  });

  if (result.error) return { error: result.error };
  return { raw: result.submission as RawHandoffSubmission };
}

export interface RunReviewTaskParams {
  team: ResearchTeamDefinition;
  member: ResearchTeamMember;
  agentDef: AgentDefinition;
  inquiry: string;
  handoffs: ScientificHandoff[];
  modelProvider: ModelProvider;
  model: string;
  sessionId: string;
  evidenceTracker: EvidenceTracker;
  maxTurns?: number;
}

export async function runReviewTask(params: RunReviewTaskParams): Promise<{ raw?: RawReviewSubmission; error?: StructuredRunError }> {
  const { team, member, agentDef, inquiry, handoffs, modelProvider, model, sessionId, evidenceTracker, maxTurns = 4 } = params;

  const handoffContext = handoffs
    .map((h) => `- From ${h.agentId} (task ${h.taskId}): ${h.summary}\n  Findings: ${h.findings.map((f) => `[${f.kind}, evidence=${f.evidenceIds.join(',') || 'none'}] ${f.statement}`).join('; ')}\n  Limitations: ${h.limitations.join('; ') || '(none stated)'}`)
    .join('\n');

  const systemPrompt = memberSystemPrompt(
    agentDef,
    member,
    team,
    'You are the mandatory quality gate for this team run. By default you cannot modify the original results -- only raise issues, request more evidence, or request a revision.'
  );
  const userPrompt = `Original research inquiry: "${inquiry}"\n\nAll member handoffs so far:\n${handoffContext}\n\nReview this work. Check evidence support, statistical soundness, citation validity, fair presentation of positive/negative evidence, and whether any tool/network/permission failure was mislabeled as a negative result. Call "${REVIEW_SUBMIT_TOOL_NAME}" with your verdict.`;

  const result = await runScopedLoop({
    agentDef,
    member,
    systemPrompt,
    userPrompt,
    forcedTool: buildReviewSubmitToolSpec(),
    modelProvider,
    model,
    sessionId,
    turnIndexBase: 0,
    maxTurns,
    toolRegistry: globalToolRegistry,
    evidenceTracker,
    allowDomainTools: true,
  });

  if (result.error) return { error: result.error };
  return { raw: result.submission as RawReviewSubmission };
}

export interface RunSynthesisParams {
  agentDef: AgentDefinition;
  team: ResearchTeamDefinition;
  inquiry: string;
  handoffs: ScientificHandoff[];
  modelProvider: ModelProvider;
  model: string;
}

/** A single plain-text turn (no tools, no forced structured output) that writes the final narrative from already-collected, already-verified evidence. */
export async function runSynthesis(params: RunSynthesisParams): Promise<{ narrative: string } | { error: StructuredRunError }> {
  const { agentDef, team, inquiry, handoffs, modelProvider, model } = params;
  const handoffContext = handoffs
    .map((h) => `- From ${h.agentId}: ${h.summary}\n  Findings: ${h.findings.map((f) => `[${f.kind}] ${f.statement} (evidence: ${f.evidenceIds.join(', ') || 'none'})`).join('; ')}`)
    .join('\n');

  const request: ModelRequest = {
    model,
    messages: [
      {
        role: 'system',
        content: memberSystemPrompt(
          agentDef,
          team.members.find((m) => m.agentId === agentDef.id),
          team,
          'Write the final synthesized report for this team run. Only use findings and evidence already present below -- never introduce a new scientific conclusion.'
        ),
      },
      {
        role: 'user',
        content: `Research inquiry: "${inquiry}"\n\nAll verified member handoffs:\n${handoffContext}\n\nWrite a clear final narrative synthesizing these findings for the researcher who asked the question.`,
      },
    ],
    tools: [],
  };

  try {
    const response = await modelProvider.generate(request);
    return { narrative: response.content || '' };
  } catch (err: any) {
    return { error: { code: 'SYNTHESIS_FAILED', message: err?.message || String(err), cause: 'tool-failure' } };
  }
}
