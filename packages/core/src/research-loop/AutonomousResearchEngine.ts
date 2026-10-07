import { ModelProvider } from '../client/ModelProvider.js';
import { ModelMessage, ModelRequest, ModelToolCall } from '../types/model.js';
import { SessionManager, globalSessionManager } from '../core/SessionManager.js';
import { EventBus, globalEventBus } from '../core/EventBus.js';
import { ToolRegistry, globalToolRegistry } from '../tools/ToolRegistry.js';
import { AgentRegistry, globalAgentRegistry } from '../agents/AgentRegistry.js';
import { EvidenceTracker } from './EvidenceTracker.js';
import { CritiqueEngine, globalCritiqueEngine } from './CritiqueEngine.js';
import { personaPromptBlock, resolveAgentPersona } from '../agents/agentPersona.js';
import { MemoryCompactor, globalMemoryCompactor } from './MemoryCompactor.js';
import { SkillRegistry, globalSkillRegistry } from '../skills/SkillRegistry.js';
import { EvidenceVerifier, globalEvidenceVerifier } from './EvidenceVerifier.js';
import { PlanTracker, globalPlanTracker } from './PlanTracker.js';
import { SubagentTreeEngine, globalSubagentTreeEngine } from './SubagentTreeEngine.js';
import { HypothesisNode } from './HypothesisTree.js';
import { HookRegistry, globalHookRegistry } from '../hooks/HookRegistry.js';
import { HookContext } from '../hooks/types.js';
import { RuntimeSession, Turn, ToolCall, ToolResult, Artifact, Citation, ToolCategory } from '../types/runtime.js';
import { getResearchProfile, buildPlanTasksForProfile } from './ResearchProfiles.js';
import { SubagentOrchestrator } from '../subagents/SubagentOrchestrator.js';
import { createDelegateResearchTool, DelegateResearchInput, DELEGATE_RESEARCH_TOOL_NAME } from '../subagents/tools/DelegateResearchTool.js';

export interface AutonomousResearchEngineOptions {
  maxTurns?: number;
  modelProvider: ModelProvider;
  sessionManager?: SessionManager;
  eventBus?: EventBus;
  toolRegistry?: ToolRegistry;
  agentRegistry?: AgentRegistry;
  critiqueEngine?: CritiqueEngine;
  memoryCompactor?: MemoryCompactor;
  skillRegistry?: SkillRegistry;
  evidenceVerifier?: EvidenceVerifier;
  planTracker?: PlanTracker;
  subagentTreeEngine?: SubagentTreeEngine;
  subagentOrchestrator?: SubagentOrchestrator;
  hookRegistry?: HookRegistry;
}

export class AutonomousResearchEngine {
  private maxTurns: number;
  private modelProvider: ModelProvider;
  private sessionManager: SessionManager;
  private eventBus: EventBus;
  private toolRegistry: ToolRegistry;
  private agentRegistry: AgentRegistry;
  private critiqueEngine: CritiqueEngine;
  private memoryCompactor: MemoryCompactor;
  private skillRegistry: SkillRegistry;
  private evidenceVerifier: EvidenceVerifier;
  private planTracker: PlanTracker;
  private subagentTreeEngine: SubagentTreeEngine;
  private subagentOrchestrator: SubagentOrchestrator;
  private hookRegistry: HookRegistry;
  private delegationContexts: Map<string, {
    userInquiry: string;
    evidenceTracker: EvidenceTracker;
    allowedToolCategories: Set<ToolCategory>;
    allowedToolNames: Set<string>;
  }> = new Map();

  constructor(options: AutonomousResearchEngineOptions) {
    this.maxTurns = options.maxTurns || 16;
    this.modelProvider = options.modelProvider;
    this.sessionManager = options.sessionManager || globalSessionManager;
    this.eventBus = options.eventBus || globalEventBus;
    this.toolRegistry = options.toolRegistry || globalToolRegistry;
    this.agentRegistry = options.agentRegistry || globalAgentRegistry;
    this.critiqueEngine = options.critiqueEngine || globalCritiqueEngine;
    this.memoryCompactor = options.memoryCompactor || globalMemoryCompactor;
    this.skillRegistry = options.skillRegistry || globalSkillRegistry;
    this.evidenceVerifier = options.evidenceVerifier || globalEvidenceVerifier;
    this.planTracker = options.planTracker || globalPlanTracker;
    this.subagentTreeEngine = options.subagentTreeEngine || globalSubagentTreeEngine;
    this.subagentOrchestrator = options.subagentOrchestrator || new SubagentOrchestrator({ modelProvider: this.modelProvider, toolRegistry: this.toolRegistry, eventBus: this.eventBus, evidenceVerifier: this.evidenceVerifier, hookRegistry: options.hookRegistry || globalHookRegistry });
    this.subagentTreeEngine.setModelProvider(this.modelProvider);
    this.hookRegistry = options.hookRegistry || globalHookRegistry;
    this.toolRegistry.register(
      createDelegateResearchTool(this.subagentOrchestrator, (input: DelegateResearchInput, context) => {
        const active = this.delegationContexts.get(context.sessionId);
        if (!active) {
          throw new Error(`No active parent research context for session '${context.sessionId}'.`);
        }
        return {
          parentSessionId: context.sessionId,
          context: {
            originalInquiry: active.userInquiry,
            objective: input.tasks.map((task) => task.objective).join('; '),
            parentSummary: active.evidenceTracker.formatEvidenceContext(),
            relevantEvidence: active.evidenceTracker.list(),
          },
          parentEvidenceTracker: active.evidenceTracker,
          parentAllowedToolCategories: active.allowedToolCategories,
          parentAllowedToolNames: active.allowedToolNames,
        };
      })
    );
  }

  public setModelProvider(provider: ModelProvider): void {
    this.modelProvider = provider;
    this.subagentTreeEngine.setModelProvider(provider);
    this.subagentOrchestrator.setModelProvider(provider);
  }

  public getModelProvider(): ModelProvider {
    return this.modelProvider;
  }

  public getPlanTracker(): PlanTracker {
    return this.planTracker;
  }

  public getEvidenceVerifier(): EvidenceVerifier {
    return this.evidenceVerifier;
  }

  public getSubagentTreeEngine(): SubagentTreeEngine {
    return this.subagentTreeEngine;
  }

  public getHookRegistry(): HookRegistry {
    return this.hookRegistry;
  }

  /**
   * Run parallel subagents for multi-hypothesis inquiry
   */
  public async runHypothesisTree(
    parentSessionId: string,
    hypotheses: HypothesisNode[],
    parentEvidenceTracker: EvidenceTracker,
    maxConcurrency?: number
  ) {
    this.subagentTreeEngine.setModelProvider(this.modelProvider);
    return this.subagentTreeEngine.exploreHypothesesParallel(
      parentSessionId,
      hypotheses,
      parentEvidenceTracker,
      maxConcurrency
    );
  }

  public async run(
    session: RuntimeSession,
    userInquiry: string,
    onDelta?: (chunk: string) => void,
    /** Frontend UI language at the moment this turn was submitted -- only affects the
     *  display-facing plan checklist (formatPlanChecklist below), never the model-facing
     *  system prompt or tool calls, which stay English regardless. */
    language: 'en' | 'zh' = 'en'
  ): Promise<Turn> {
    const sessionId = session.id;
    const turnIndex = session.turns.length + 1;
    const evidenceTracker = new EvidenceTracker(this.evidenceVerifier, sessionId);
    this.subagentOrchestrator.setModel(session.activeModel || undefined);

    const hookContext: HookContext = {
      sessionId,
      turnIndex,
      agentId: session.activeAgent || 'research',
      event: 'SessionStart',
      timestamp: new Date().toISOString(),
    };

    // 0. Trigger SessionStart Hooks
    await this.hookRegistry.triggerSessionStart(hookContext, {
      session,
      userInquiry,
      skillRegistry: this.skillRegistry,
    });

    // 1. Initialize Explicit Research Plan & To-Do Tracker -- the plan
    // template (which five tasks exist, their titles/categories, and
    // which tool calls route onto each) comes from this session's
    // ResearchProfile (see ResearchProfiles.ts), fixed at session
    // creation. 'general' reproduces the original hardcoded template.
    const researchProfile = getResearchProfile(session.researchProfileId);
    let plan = this.planTracker.getPlan(sessionId);
    if (!plan) {
      plan = this.planTracker.createPlan(sessionId, userInquiry, buildPlanTasksForProfile(session.researchProfileId));
    }

    // Set initial session status
    this.sessionManager.updateSessionStatus(sessionId, 'thinking');

    // Tools this conversation's member is allowed to use. A session is held
    // with a specific member (general expert by default), and a member's
    // allowedToolCategories is part of what makes it that member -- handing
    // every session the full catalogue would make the choice cosmetic.
    const persona = resolveAgentPersona(session.activeAgent);
    const toolDefinitions = persona
      ? this.toolRegistry.list().filter((tool) => persona.allowedToolCategories.includes(tool.category))
      : this.toolRegistry.list();
    // Orchestration is a first-class capability, separate from domain tool
    // categories. It is offered to the Main Agent so the model can decide
    // whether delegation is worthwhile; the prompt below explicitly discourages
    // spawning agents for trivial one-tool questions.
    const delegationTool = this.toolRegistry.get(DELEGATE_RESEARCH_TOOL_NAME);
    if (delegationTool && !toolDefinitions.some((tool) => tool.name === delegationTool.name)) toolDefinitions.push(delegationTool);
    this.delegationContexts.set(sessionId, {
      userInquiry,
      evidenceTracker,
      allowedToolCategories: new Set<ToolCategory>((persona?.allowedToolCategories || this.toolRegistry.list().map((tool) => tool.category)) as ToolCategory[]),
      allowedToolNames: new Set(toolDefinitions.filter((tool) => tool.category !== 'orchestration').map((tool) => tool.name)),
    });

    // Match skills
    const skillInjectionPrompt = this.skillRegistry.formatPromptForInquiry(userInquiry);

    // Initial system prompt
    const baseSystemPrompt = `You are MedScience, an autonomous empirical research agent.

First, judge the user's message:
- If it is a greeting, small talk, thanks, or a simple clarifying/meta question that does NOT ask you to investigate, verify, or compute anything, just reply directly and briefly in plain conversation. Do NOT call any tools, do NOT claim to be "formulating a hypothesis" or "searching databases", and do NOT produce a multi-step research plan for it.
- Only when the message is an actual scientific/research inquiry that needs evidence, data, or computation, follow the full empirical research protocol below.

Guidelines for genuine research inquiries:
1. Always formulate hypotheses and retrieve data using official tools (UniProtKB, PDB, ChEMBL, PubChem, PubMed, openFDA, ClinicalTrials.gov, RxNorm, DailyMed).
2. Execute Python scripts locally for statistical computations, radiomics, or clinical NLP.
3. Every empirical finding is verified by the Evidence Verification Gate before adoption as [Evidence: EV-xxx].
4. Ground every conclusion in [Evidence: EV-xxx] tags. Never hallucinate unverified findings.
${researchProfile.systemPromptFocus ? `\n${researchProfile.systemPromptFocus}` : ''}${skillInjectionPrompt ? `\n${skillInjectionPrompt}` : ''}${personaPromptBlock(session.activeAgent)}`;
    const delegationPrompt = `
SubAgent delegation rules:
- Use ${DELEGATE_RESEARCH_TOOL_NAME} only when the inquiry benefits from independent, parallel or context-isolated work (competing hypotheses, broad literature exploration, independent verification, or separate data analysis).
- Do not delegate a simple one-tool lookup or a task whose value depends on one continuous context.
- A child never receives capabilities that you do not have. Review each structured handoff, its limitations, and any failed branch before synthesis.
- Delegation is bounded and may return partial results; never hide a failed or inconclusive branch.`;
    const baseSystemPromptWithDelegation = `${baseSystemPrompt}${delegationPrompt}`;

    let messages: ModelMessage[] = [
      { role: 'system', content: baseSystemPromptWithDelegation },
      { role: 'user', content: userInquiry },
    ];

    let currentTurn = 0;
    let accumulatedToolCalls: ToolCall[] = [];
    let accumulatedToolResults: ToolResult[] = [];
    let finalContent = '';
    let critiquePassed = false;
    let critiqueFeedback: string | null = null;
    let integrityFailure: string | null = null;

    // Start Task 1 in Plan
    this.planTracker.startTask(sessionId, 'task-1');

    while (currentTurn < this.maxTurns) {
      currentTurn++;

      // Check Mid-Run Steering
      const pendingGuidance = this.sessionManager.popSteering(sessionId);
      if (pendingGuidance) {
        messages.push({
          role: 'user',
          content: `[User Guidance / Steering Direction]: ${pendingGuidance}`,
        });

        this.eventBus.emit({
          type: 'agent.thinking',
          sessionId,
          timestamp: new Date().toISOString(),
          payload: {
            thought: `Incorporating mid-run user guidance into trajectory: "${pendingGuidance}"...`,
            phase: 'Steering Adaptation',
          },
        });
      }

      // Memory Compactor
      if (this.memoryCompactor.shouldCompact(messages)) {
        const { compactedMessages } = this.memoryCompactor.compact(messages, evidenceTracker, userInquiry);
        messages = compactedMessages;
        this.eventBus.emit({
          type: 'agent.thinking',
          sessionId,
          timestamp: new Date().toISOString(),
          payload: {
            thought: `Context threshold reached. Compressed working memory into lossless structured summary.`,
            phase: 'Memory Compaction',
          },
        });
      }

      // Critique Feedback Re-injection
      if (critiqueFeedback) {
        messages.push({
          role: 'user',
          content: critiqueFeedback,
        });
      }

      // Thinking event
      const phaseName = currentTurn === 1 ? 'Plan Formulation' : critiqueFeedback ? 'Refining & Re-searching' : 'Evidence Gathering & Analysis';
      this.eventBus.emit({
        type: 'agent.thinking',
        sessionId,
        timestamp: new Date().toISOString(),
        payload: {
          thought: `[Turn ${currentTurn}/${this.maxTurns}] ${phaseName} with ${evidenceTracker.count()} verified evidence records...`,
          phase: phaseName,
        },
      });

      // Assemble Model Request
      const modelRequest: ModelRequest = {
        model: session.activeModel || 'gpt-4o',
        messages,
        tools: toolDefinitions,
      };

      // Raw clinical content and secrets must be intercepted before an external
      // provider receives the request. Tool-time checks are already too late.
      const outboundHookRes = await this.hookRegistry.triggerPreToolUse(
        { ...hookContext, event: 'PreToolUse' },
        {
          toolName: 'model_provider_request',
          toolArguments: { messages: modelRequest.messages },
          isExternalApi: this.modelProvider.isExternal !== false,
        }
      );

      if (!outboundHookRes.proceed) {
        const blockedMessage = outboundHookRes.message || 'External model request blocked by privacy gate.';
        this.planTracker.failTask(sessionId, 'task-1', blockedMessage);
        const blockedTurn: Turn = {
          index: turnIndex,
          userInput: userInquiry,
          toolCalls: accumulatedToolCalls,
          toolResults: accumulatedToolResults,
          agentResponse: blockedMessage,
          status: 'cancelled',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        this.sessionManager.addTurn(sessionId, blockedTurn);
        this.sessionManager.updateSessionStatus(sessionId, 'cancelled');
        this.delegationContexts.delete(sessionId);
        return blockedTurn;
      }

      let response;
      if (onDelta) {
        response = await this.modelProvider.stream(modelRequest, onDelta);
      } else {
        response = await this.modelProvider.generate(modelRequest);
      }

      finalContent = response.content;

      // Handle Tool Calling Branch
      if (response.finishReason === 'tool_calls' && response.toolCalls && response.toolCalls.length > 0) {
        this.sessionManager.updateSessionStatus(sessionId, 'tool_calling');

        // 1. Append compliant assistant tool_calls initiation message to history
        messages.push({
          role: 'assistant',
          content: response.content || '',
          toolCalls: response.toolCalls.map((call) => ({
            id: call.id,
            name: call.name,
            arguments: call.arguments,
          })),
        });

        // 2. Execute each tool and append corresponding tool response message
        for (const call of response.toolCalls) {
          accumulatedToolCalls.push({
            id: call.id,
            name: call.name,
            arguments: call.arguments,
          });

          // Determine corresponding plan task -- data-driven from the active
          // plan's own tasks (set by the session's ResearchProfile) rather
          // than one engine-wide hardcoded if/else chain, so a different
          // profile can route the same tool call onto a different task.
          // Tasks with toolMatchers are checked first, in plan order (the
          // first match wins); a task's designated catch-all absorbs
          // everything else.
          const matchedTask = plan.tasks.find(
            (t) => t.toolMatchers && t.toolMatchers.length > 0 && t.toolMatchers.some((m) => call.name.includes(m))
          );
          const defaultTask = plan.tasks.find((t) => t.isDefaultTask);
          const activeTaskId = matchedTask?.id || defaultTask?.id || plan.tasks[0]?.id || 'task-2';
          this.planTracker.startTask(sessionId, activeTaskId);

          // Execute real tool
          const result = await this.toolRegistry.execute(
            call.name,
            call.arguments,
            sessionId,
            session.activeAgent,
            turnIndex
          );

          const toolResult: ToolResult = {
            callId: call.id,
            name: call.name,
            output: result.output,
            error: result.error,
            execution: result.execution,
          };
          accumulatedToolResults.push(toolResult);

          if (!result.success) {
            const failureMessage = result.error || result.execution?.resultSummary || 'Tool execution failed';
            this.planTracker.failTask(sessionId, activeTaskId, failureMessage);
            messages.push({
              role: 'tool',
              name: call.name,
              content: `[Tool Execution Failed]: ${failureMessage}`,
              toolCallId: call.id,
            });
            continue;
          }

          const queryStr =
            call.arguments?.query ||
            call.arguments?.accessionOrGene ||
            call.arguments?.targetOrCompound ||
            call.arguments?.compoundNameOrCID ||
            call.arguments?.pdbIdOrUniProt ||
            call.arguments?.scriptName ||
            JSON.stringify(call.arguments);

          const toolDefinition = this.toolRegistry.get(call.name);
          let evidenceId: string | undefined;
          let evidenceSummary = result.execution?.resultSummary || 'Tool executed successfully';
          if (toolDefinition?.producesEvidence !== false) {
            const recordedEv = evidenceTracker.record(
              call.name,
              result.execution?.category || 'databases',
              String(queryStr),
              evidenceSummary,
              result.output,
              result.citations,
              result.artifacts,
              result.evidenceVerification
            );
            evidenceId = recordedEv.id;
            evidenceSummary = recordedEv.summary;
            this.planTracker.completeTask(sessionId, activeTaskId, [recordedEv.id], recordedEv.summary);
          } else {
            // Control/orchestration results remain visible in tool/runtime
            // events but are not scientific observations in the Evidence
            // Ledger. Child evidence has already been adopted by the
            // delegation tool itself.
            this.planTracker.completeTask(sessionId, activeTaskId, [], evidenceSummary);
          }

          // Register artifacts & citations in session
          if (result.artifacts) {
            result.artifacts.forEach((art: Artifact) => this.sessionManager.addArtifact(sessionId, art));
          }
          if (result.citations) {
            result.citations.forEach((cit: Citation) => this.sessionManager.addCitation(sessionId, cit));
          }

          // Append tool result into model history for next turn
          const rawToolContent = typeof result.output === 'string' ? result.output : JSON.stringify(result.output || result.error);
          const toolContent = evidenceId
            ? `[Evidence recorded: ${evidenceId}]\n${rawToolContent}`
            : rawToolContent;
          messages.push({
            role: 'tool',
            name: call.name,
            content: toolContent,
            toolCallId: call.id,
          });
        }

        critiqueFeedback = null;
        continue;
      }

      // If model generated final draft: Run Critique Gate & Stop Hooks
      if (response.finishReason === 'stop' || !response.toolCalls || response.toolCalls.length === 0) {
        this.planTracker.startTask(sessionId, 'task-5');
        // A turn that never attempted any tool call (e.g. the model judged the
        // message to be a greeting / small talk per the system prompt above)
        // should not be forced through the evidence-coverage gate -- that gate
        // used to reject every such reply and push the model back into calling
        // tools for a plain "hello", turning every message into a full
        // multi-step research run regardless of what was actually asked.
        const critique = await this.critiqueEngine.evaluate(userInquiry, evidenceTracker, finalContent, {
          requireEvidence: accumulatedToolCalls.length > 0,
        });

        if (critique.passed) {
          const planTable = this.planTracker.formatPlanChecklist(sessionId, language);
          const evidenceTable = evidenceTracker.formatTraceabilityTable();
          const candidateFinalContent = `${finalContent}\n\n${planTable}\n\n${evidenceTable}`;

          // Trigger Stop Hooks (Evidence Completeness Check)
          const stopResult = await this.hookRegistry.triggerStop(
            { ...hookContext, event: 'Stop' },
            {
              session,
              turnIndex,
              userInquiry,
              finalContent: candidateFinalContent,
              evidenceTracker,
              planTracker: this.planTracker,
            }
          );

          if (stopResult.proceed && stopResult.verdict === 'PASSED') {
            critiquePassed = true;
            finalContent = candidateFinalContent;
            this.planTracker.completeTask(sessionId, 'task-5', [], 'Critique and evidence completeness gates passed');
            break;
          }

          const stopFailure = stopResult.message || 'Evidence completeness gate rejected the report';
          if (currentTurn < this.maxTurns) {
            critiqueFeedback = `[Evidence Completeness Feedback]: ${stopFailure}. Revise the report so every evidence anchor is valid and every warning is acknowledged.`;
            continue;
          }
          integrityFailure = stopFailure;
          this.planTracker.failTask(sessionId, 'task-5', integrityFailure);
        } else if (currentTurn < this.maxTurns) {
          critiqueFeedback = `[Critique Engine Feedback]: Your synthesis draft requires revision. Reasons: ${critique.issues.join('; ')}. Please call relevant tools to verify missing evidence or correct unverified claims before finishing.`;
        } else {
          integrityFailure = `Critique gate rejected the report: ${critique.issues.join('; ')}`;
          this.planTracker.failTask(sessionId, 'task-5', integrityFailure);
        }

        if (integrityFailure && currentTurn >= this.maxTurns) {
          finalContent = `${finalContent}\n\n[Integrity Gate Failed] ${integrityFailure}`;
          break;
        }
      }
    }

    if (!critiquePassed && !integrityFailure) {
      integrityFailure = 'Research loop exhausted its turn budget before producing a verified synthesis.';
      this.planTracker.failTask(sessionId, 'task-5', integrityFailure);
      finalContent = `${finalContent}\n\n[Integrity Gate Failed] ${integrityFailure}`;
    }

    const completedTurn: Turn = {
      index: turnIndex,
      userInput: userInquiry,
      toolCalls: accumulatedToolCalls,
      toolResults: accumulatedToolResults,
      agentResponse: finalContent,
      status: critiquePassed ? 'completed' : 'error',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    this.sessionManager.addTurn(sessionId, completedTurn);
    this.sessionManager.updateSessionStatus(sessionId, critiquePassed ? 'completed' : 'error');
    this.delegationContexts.delete(sessionId);

    return completedTurn;
  }
}
