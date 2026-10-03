import { ModelProvider } from '../client/ModelProvider.js';
import { GenericModelClient } from '../client/GenericModelClient.js';
import { fallbackMockProvider } from '../client/ScientificMockProvider.js';
import { ProfileManager, globalProfileManager } from '../config/ProfileManager.js';
import { ExecutionProfileManager, globalExecutionProfileManager } from '../config/ExecutionProfileManager.js';
import { SessionManager, globalSessionManager } from '../core/SessionManager.js';
import { EventBus, globalEventBus } from '../core/EventBus.js';
import { EventType, RuntimeEvent } from '../types/events.js';
import { EvidenceTracker } from '../research-loop/EvidenceTracker.js';
import { globalCritiqueEngine } from '../research-loop/CritiqueEngine.js';
import {
  ResearchTeamDefinition,
  ResearchTeamMember,
  AgentDefinition,
  TeamRun,
  TeamTask,
  AgentRun,
  ScientificHandoff,
  ScientificFinding,
  TeamQualityGateResult,
  TeamQualityGateVerdict,
  TeamRunReport,
  StructuredRunError,
} from './types.js';
import { TeamProfileManager, globalTeamProfileManager } from './TeamProfileManager.js';
import { TeamAgentRegistry, globalTeamAgentRegistry } from './TeamRegistry.js';
import { TeamRunStore, TeamRunRecord, globalTeamRunStore } from './TeamRunStore.js';
import { validatePlanSubmission } from './TeamPlanner.js';
import { computeReadyTasks, isTaskGraphSettled, hasDeadlockedTasks } from './TeamScheduler.js';
import { runLeaderPlanning, runMemberTask, runReviewTask, runSynthesis } from './ApiAgentRunner.js';
import { EvidenceLedger, getGlobalEvidenceLedger } from '../epistemic/EvidenceLedger.js';
import { commitRunEvidence } from '../epistemic/LedgerBridge.js';

/** Run statuses that mean "this run will not progress any further on its own". */
const SETTLED_RUN_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const QUALITY_GATE_SEVERITY: Record<TeamQualityGateVerdict, number> = {
  passed: 0,
  revision_required: 1,
  blocked_by_missing_evidence: 2,
  failed_integrity_check: 3,
};

function worseGateVerdict(a: TeamQualityGateResult, b: TeamQualityGateResult): TeamQualityGateResult {
  return QUALITY_GATE_SEVERITY[b.verdict] > QUALITY_GATE_SEVERITY[a.verdict] ? b : a;
}

/**
 * Coordinates one Team Run end to end (design doc section 19 stage 2):
 * leader plans first, TeamPlanner validates the plan into a real task graph,
 * TeamScheduler dispatches only what's ready within budget, each member runs
 * a scoped ApiAgentRunner loop and must submit a structured handoff, and a
 * mandatory quality gate runs before anything can be marked completed.
 *
 * Deliberately API-only for now (design doc explicitly defers local-runtime
 * team members to a later phase, section 18/19 stage 4) -- see
 * resolveModelProviderForAgent below.
 *
 * Concurrency model: dispatches tasks in "waves" -- every ready task in a
 * wave runs concurrently (respecting maxConcurrency), the orchestrator waits
 * for the whole wave, then recomputes readiness. This is simpler and easier
 * to reason about/test than a fully event-driven scheduler that dispatches
 * the instant a slot frees up mid-wave; it still respects every scheduling
 * rule in section 6.3 (concurrency cap, one task per agent, dependencies,
 * budget), it just doesn't squeeze out the very last bit of overlap between
 * tasks that finish at different times within the same wave.
 */
export class TeamOrchestrator {
  private teamProfileManager: TeamProfileManager;
  private agentRegistry: TeamAgentRegistry;
  private runStore: TeamRunStore;
  private sessionManager: SessionManager;
  private eventBus: EventBus;
  private profileManager: ProfileManager;
  private executionProfileManager: ExecutionProfileManager;

  /** Runs currently active in this process (paused/cancelled flags + in-memory evidence ledger). */
  private active: Map<string, { record: TeamRunRecord; evidenceTracker: EvidenceTracker; paused: boolean; cancelled: boolean; dispatching: boolean }> = new Map();

  /** Test/advanced-use injection point: bypasses ExecutionProfile/ModelProfile resolution entirely when set. */
  private evidenceLedger?: EvidenceLedger | null;
  private modelProviderOverride?: (team: ResearchTeamDefinition, member: ResearchTeamMember | undefined, agentDef: AgentDefinition | undefined) => { provider: ModelProvider; model: string };

  constructor(options?: {
    teamProfileManager?: TeamProfileManager;
    agentRegistry?: TeamAgentRegistry;
    runStore?: TeamRunStore;
    sessionManager?: SessionManager;
    eventBus?: EventBus;
    profileManager?: ProfileManager;
    executionProfileManager?: ExecutionProfileManager;
    modelProviderOverride?: (team: ResearchTeamDefinition, member: ResearchTeamMember | undefined, agentDef: AgentDefinition | undefined) => { provider: ModelProvider; model: string };
    /** Durable ledger the run's evidence is committed to; null turns committing off. */
    evidenceLedger?: EvidenceLedger | null;
  }) {
    this.teamProfileManager = options?.teamProfileManager || globalTeamProfileManager;
    this.agentRegistry = options?.agentRegistry || globalTeamAgentRegistry;
    this.runStore = options?.runStore || globalTeamRunStore;
    this.sessionManager = options?.sessionManager || globalSessionManager;
    this.eventBus = options?.eventBus || globalEventBus;
    this.profileManager = options?.profileManager || globalProfileManager;
    this.executionProfileManager = options?.executionProfileManager || globalExecutionProfileManager;
    this.modelProviderOverride = options?.modelProviderOverride;
    this.evidenceLedger = options?.evidenceLedger;
  }

  /**
   * Typed emit: `type` must be a real EventType and `payload` must match that
   * event's payload shape (it used to be `any`/`any`, which let a typo in an
   * event name or payload key reach the renderer silently -- the group-chat
   * UI now renders these events directly, so a wrong key is a missing chat
   * message rather than just a missing status field).
   */
  private emit<T extends EventType>(
    sessionId: string,
    type: T,
    payload: Extract<RuntimeEvent, { type: T }>['payload']
  ): void {
    this.eventBus.emit({ type, sessionId, timestamp: new Date().toISOString(), payload } as RuntimeEvent);
  }

  private resolveModelProviderForAgent(
    team: ResearchTeamDefinition,
    member: ResearchTeamMember | undefined,
    agentDef: AgentDefinition | undefined
  ): { provider: ModelProvider; model: string } {
    if (this.modelProviderOverride) return this.modelProviderOverride(team, member, agentDef);
    const candidateIds = [member?.executionProfileId, agentDef?.defaultExecutionProfileId, team.defaultExecutionProfileId].filter(
      (id): id is string => !!id
    );
    for (const id of candidateIds) {
      const execProfile = this.executionProfileManager.getProfile(id);
      if (execProfile?.mode === 'api' && execProfile.modelProfileId) {
        const modelProfile = this.profileManager.getProfile(execProfile.modelProfileId);
        if (modelProfile?.baseUrl && modelProfile.model) {
          return { provider: new GenericModelClient(modelProfile), model: modelProfile.model };
        }
      }
      // A local-runtime executionProfileId is not usable for a team member yet (Phase 2 is API-only);
      // fall through to the next priority rather than silently running against the wrong backend.
    }
    const activeModelProfile = this.profileManager.getActiveProfile();
    if (activeModelProfile?.baseUrl && activeModelProfile.model) {
      return { provider: new GenericModelClient(activeModelProfile), model: activeModelProfile.model };
    }
    return { provider: fallbackMockProvider, model: 'gpt-4o' };
  }

  public getRun(runId: string): TeamRunRecord | undefined {
    return this.active.get(runId)?.record || this.runStore.get(runId);
  }

  /**
   * Full run records (run + tasks + handoffs + conflicts) for a team, newest
   * first. The group-chat UI needs whole records, not index entries, to
   * rebuild its message history; without this it would have to call
   * getRun() once per run in the index.
   */
  public listRunRecords(teamId: string, workspaceId?: string, limit = 5): TeamRunRecord[] {
    return this.listRuns(teamId, workspaceId)
      .slice(0, Math.max(1, limit))
      .map((entry) => this.getRun(entry.id))
      .filter((record): record is TeamRunRecord => !!record);
  }

  /**
   * The run this team currently has in flight IN THIS PROCESS, if any.
   *
   * Deliberately scoped to `this.active` rather than the persisted index: a
   * run that was left mid-flight by a crash/quit has no dispatch loop behind
   * it any more, and treating its stale 'running' status as "in flight"
   * would lock the team out of ever starting another run.
   */
  public getActiveRunForTeam(teamId: string): TeamRunRecord | undefined {
    for (const state of this.active.values()) {
      if (state.record.run.teamId !== teamId) continue;
      if (SETTLED_RUN_STATUSES.has(state.record.run.status)) continue;
      return state.record;
    }
    return undefined;
  }

  public listRuns(teamId?: string, workspaceId?: string) {
    const runs = this.runStore.list(teamId);
    if (!workspaceId) return runs;
    // A run's own index entry has no workspaceId (it's a thin index over
    // sessionId) -- join through the session it created, same as the
    // Evidence Registry/Workspace Files scoping in the other views.
    return runs.filter((r) => {
      const session = this.sessionManager.getSession(r.sessionId);
      return (session?.workspaceId || 'proj-1') === workspaceId;
    });
  }

  /** Starts a new Team Run: creates the session + run record, then runs the leader's planning turn. */
  public async startRun(
    teamId: string,
    inquiry: string,
    sessionId?: string,
    workspaceId: string = 'proj-1',
    researchProfileId: string = 'general'
  ): Promise<TeamRunRecord> {
    const team = this.teamProfileManager.getTeam(teamId);
    if (!team) throw new Error(`No team found with id "${teamId}".`);
    if (team.archived) throw new Error(`Team "${team.name}" is archived.`);

    // One in-flight run per team. The team's concurrency/task budget is
    // enforced per run, so two concurrent runs would silently double the
    // limits the user set on the team (a team capped at 3 concurrent agents
    // would really be running 6).
    const inFlight = this.getActiveRunForTeam(team.id);
    if (inFlight) {
      throw new Error(
        `Team "${team.name}" already has a run in progress (${inFlight.run.id}, status: ${inFlight.run.status}). ` +
          'Cancel or finish it before starting another.'
      );
    }

    const leaderAgentDef = this.agentRegistry.get(team.leaderAgentId);
    if (!leaderAgentDef) throw new Error(`Team leader agent "${team.leaderAgentId}" is not a known agent.`);

    const runId = `teamrun-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // A team run's session is a workspace member just like any chat/research
    // session -- it shares that workspace's Evidence Registry and Workspace
    // Files rather than living in a system unto itself (see Workspace in
    // ../types/workspace.js).
    const session =
      (sessionId && this.sessionManager.getSession(sessionId)) ||
      this.sessionManager.createSession(
        `[Team] ${inquiry.slice(0, 60)}`,
        workspaceId,
        team.leaderAgentId,
        undefined,
        undefined,
        sessionId,
        'research',
        researchProfileId,
        // Tagged so the conversation list can keep team runs inside the
        // team's own thread instead of listing them next to the user's 1:1
        // chats.
        { origin: 'team', teamRunId: runId }
      );

    const now = new Date().toISOString();
    const run: TeamRun = {
      id: runId,
      teamId: team.id,
      teamVersion: team.version,
      sessionId: session.id,
      inquiry,
      status: 'planning',
      leaderAgentId: team.leaderAgentId,
      taskIds: [],
      sharedEvidenceIds: [],
      artifactIds: [],
      budget: { maxConcurrency: team.maxConcurrency, maxTasks: team.maxTasks, maxRevisionsPerTask: team.maxRevisionsPerTask },
      startedAt: now,
    };

    const record: TeamRunRecord = { run, tasks: [], agentRuns: [], handoffs: [], conflicts: [] };
    const evidenceTracker = new EvidenceTracker();
    this.active.set(runId, { record, evidenceTracker, paused: false, cancelled: false, dispatching: false });
    this.runStore.save(record);
    this.emit(session.id, 'team.run.started', { teamRunId: runId, teamId: team.id, leaderAgentId: team.leaderAgentId });
    this.emit(session.id, 'team.run.status', { teamRunId: runId, status: 'planning' });

    const { provider, model } = this.resolveModelProviderForAgent(team, undefined, leaderAgentDef);
    const planResult = await runLeaderPlanning({ team, leaderAgentDef, inquiry, modelProvider: provider, model, sessionId: session.id });

    if (planResult.error || !planResult.plan) {
      this.failRun(runId, planResult.error || { code: 'PLANNING_FAILED', message: 'The team leader did not produce a plan.' });
      return this.active.get(runId)!.record;
    }

    const validation = validatePlanSubmission(planResult.plan, team, runId, this.agentRegistry);
    if (!validation.valid || !validation.tasks) {
      this.failRun(runId, { code: 'PLAN_VALIDATION_FAILED', message: validation.errors.join(' ') });
      return this.active.get(runId)!.record;
    }

    record.tasks = validation.tasks;
    record.run.taskIds = validation.tasks.map((t) => t.id);
    record.run.status = team.planningMode === 'review-first' ? 'awaiting-plan-approval' : 'running';
    this.runStore.save(record);
    this.emit(session.id, 'team.plan.ready', { teamRunId: runId, taskIds: record.run.taskIds });
    this.emit(session.id, 'team.run.status', { teamRunId: runId, status: record.run.status });

    if (record.run.status === 'running') {
      void this.dispatchLoop(runId);
    }
    return record;
  }

  /** For planningMode 'review-first': the user has reviewed the leader's task graph and wants to proceed. */
  public async approvePlan(runId: string): Promise<TeamRunRecord> {
    const state = this.active.get(runId);
    if (!state) throw new Error(`Team run "${runId}" is not active.`);
    if (state.record.run.status !== 'awaiting-plan-approval') {
      throw new Error(`Team run "${runId}" is not awaiting plan approval (status: ${state.record.run.status}).`);
    }
    state.record.run.status = 'running';
    this.runStore.save(state.record);
    this.emit(state.record.run.sessionId, 'team.run.status', { teamRunId: runId, status: 'running' });
    void this.dispatchLoop(runId);
    return state.record;
  }

  public pauseRun(runId: string): boolean {
    const state = this.active.get(runId);
    if (!state) return false;
    state.paused = true;
    if (state.record.run.status === 'running') {
      state.record.run.status = 'awaiting-user';
      this.runStore.save(state.record);
      this.emit(state.record.run.sessionId, 'team.run.status', { teamRunId: runId, status: 'awaiting-user' });
    }
    return true;
  }

  public resumeRun(runId: string): boolean {
    const state = this.active.get(runId);
    if (!state) return false;
    state.paused = false;
    if (state.record.run.status === 'awaiting-user') {
      state.record.run.status = 'running';
      this.runStore.save(state.record);
      this.emit(state.record.run.sessionId, 'team.run.status', { teamRunId: runId, status: 'running' });
      void this.dispatchLoop(runId);
    }
    return true;
  }

  public cancelRun(runId: string): boolean {
    const state = this.active.get(runId);
    if (!state) return false;
    state.cancelled = true;
    state.record.tasks.forEach((t) => {
      if (t.status !== 'completed' && t.status !== 'failed') t.status = 'cancelled';
    });
    state.record.run.status = 'cancelled';
    state.record.run.completedAt = new Date().toISOString();
    this.runStore.save(state.record);
    this.emit(state.record.run.sessionId, 'team.run.completed', { teamRunId: runId, status: 'cancelled' });
    return true;
  }

  private failRun(runId: string, error: StructuredRunError): void {
    const state = this.active.get(runId);
    if (!state) return;
    state.record.run.status = 'failed';
    state.record.run.failure = error;
    state.record.run.completedAt = new Date().toISOString();
    this.runStore.save(state.record);
    this.emit(state.record.run.sessionId, 'team.run.completed', { teamRunId: runId, status: 'failed', error });
  }

  private async dispatchLoop(runId: string): Promise<void> {
    const state = this.active.get(runId);
    if (!state || state.dispatching) return;
    state.dispatching = true;
    try {
      const team = this.teamProfileManager.getTeam(state.record.run.teamId);
      if (!team) {
        this.failRun(runId, { code: 'TEAM_NOT_FOUND', message: 'The team this run belongs to no longer exists.' });
        return;
      }

      while (true) {
        if (state.cancelled) return;
        if (state.paused) return;

        const tasks = state.record.tasks;
        if (isTaskGraphSettled(tasks)) break;

        const deadlocked = hasDeadlockedTasks(tasks);
        if (deadlocked.length > 0) {
          deadlocked.forEach((t) => {
            t.status = 'cancelled';
            this.emit(state.record.run.sessionId, 'team.task.status', { teamRunId: runId, taskId: t.id, agentId: t.assignedAgentId, status: 'cancelled' });
          });
          this.runStore.save(state.record);
          continue;
        }

        const runningAgentRuns = state.record.agentRuns.filter((ar) => ar.status === 'running');
        const busyAgentIds = new Set(runningAgentRuns.map((ar) => ar.agentId));
        const ready = computeReadyTasks(tasks, busyAgentIds, runningAgentRuns.length, team.maxConcurrency);

        if (ready.length === 0) {
          if (runningAgentRuns.length === 0) {
            this.failRun(runId, { code: 'SCHEDULER_STUCK', message: 'No task is ready to run and none is in flight, but the task graph is not settled.' });
          }
          return;
        }

        await Promise.all(ready.map((task) => this.runOneTask(runId, team, task, state.evidenceTracker)));
        if (state.cancelled || state.paused) return;
      }

      await this.runReviewAndSynthesis(runId, team, state.evidenceTracker);
    } finally {
      state.dispatching = false;
    }
  }

  private async runOneTask(runId: string, team: ResearchTeamDefinition, task: TeamTask, evidenceTracker: EvidenceTracker): Promise<void> {
    const state = this.active.get(runId)!;
    const member = team.members.find((m) => m.agentId === task.assignedAgentId);
    const agentDef = this.agentRegistry.get(task.assignedAgentId);

    task.status = 'running';
    task.startedAt = new Date().toISOString();
    task.attempt += 1;
    const agentRun: AgentRun = {
      id: `agentrun-${task.id}-${task.attempt}`,
      teamRunId: runId,
      taskId: task.id,
      agentId: task.assignedAgentId,
      executionProfileId: member?.executionProfileId || agentDef?.defaultExecutionProfileId || team.defaultExecutionProfileId || 'active',
      status: 'running',
      startedAt: task.startedAt,
    };
    state.record.agentRuns.push(agentRun);
    this.runStore.save(state.record);
    this.emit(state.record.run.sessionId, 'team.task.status', { teamRunId: runId, taskId: task.id, agentId: task.assignedAgentId, status: 'running' });

    const settleFailed = (error: StructuredRunError) => {
      agentRun.status = 'failed';
      agentRun.completedAt = new Date().toISOString();
      agentRun.error = error;
      if (task.attempt <= team.maxRevisionsPerTask) {
        task.status = 'revision-requested';
      } else {
        task.status = 'failed';
        task.completedAt = new Date().toISOString();
      }
      this.runStore.save(state.record);
      this.emit(state.record.run.sessionId, 'team.task.status', { teamRunId: runId, taskId: task.id, agentId: task.assignedAgentId, status: task.status });
    };

    if (!member || !agentDef) {
      settleFailed({ code: 'AGENT_NOT_IN_ROSTER', message: `Agent "${task.assignedAgentId}" is not a member of this team.` });
      return;
    }

    const dependencyHandoffs = state.record.handoffs.filter((h) => task.dependencyTaskIds.includes(h.taskId));
    const { provider, model } = this.resolveModelProviderForAgent(team, member, agentDef);

    const result = await runMemberTask({
      team,
      member,
      agentDef,
      task,
      inquiry: state.record.run.inquiry,
      dependencyHandoffs,
      modelProvider: provider,
      model,
      sessionId: state.record.run.sessionId,
      evidenceTracker,
    });

    if (result.error || !result.raw) {
      settleFailed(result.error || { code: 'HANDOFF_MISSING', message: 'No handoff was produced.' });
      return;
    }

    const knownEvidenceIds = new Set(evidenceTracker.list().map((e) => e.id));
    const findings: ScientificFinding[] = (result.raw.findings || []).map((f) => ({
      id: `finding-${task.id}-${Math.random().toString(36).slice(2, 8)}`,
      kind: f.kind,
      statement: f.statement,
      evidenceIds: (f.evidenceIds || []).filter((id) => knownEvidenceIds.has(id)),
      confidence: f.confidence,
    }));

    // A non-hypothesis finding that cites no real evidence id is a scientific-integrity problem,
    // not a free pass -- request a revision instead of silently accepting an unsupported claim.
    const unsupported = findings.some((f) => f.kind !== 'hypothesis' && f.evidenceIds.length === 0);
    if (unsupported) {
      settleFailed({
        code: 'UNSUPPORTED_FINDING',
        message: 'At least one non-hypothesis finding cited no real evidence id from this task\'s tool calls.',
        cause: 'insufficient-evidence',
      });
      return;
    }

    const handoffEvidenceIds = Array.from(new Set(findings.flatMap((f) => f.evidenceIds)));
    const handoff: ScientificHandoff = {
      id: `handoff-${task.id}`,
      teamRunId: runId,
      taskId: task.id,
      agentRunId: agentRun.id,
      agentId: task.assignedAgentId,
      summary: result.raw.summary,
      methods: result.raw.methods || [],
      findings,
      evidenceIds: handoffEvidenceIds,
      artifactIds: [],
      limitations: result.raw.limitations || [],
      unresolvedQuestions: result.raw.unresolvedQuestions || [],
      recommendedNextActions: result.raw.recommendedNextActions || [],
      confidence: result.raw.confidence ?? 0.5,
      createdAt: new Date().toISOString(),
    };

    state.record.handoffs.push(handoff);
    state.record.run.sharedEvidenceIds = Array.from(new Set([...state.record.run.sharedEvidenceIds, ...handoffEvidenceIds]));
    task.evidenceIds = handoffEvidenceIds;
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    agentRun.status = 'completed';
    agentRun.completedAt = task.completedAt;

    this.runStore.save(state.record);
    this.emit(state.record.run.sessionId, 'team.task.status', { teamRunId: runId, taskId: task.id, agentId: task.assignedAgentId, status: 'completed' });
    this.emit(state.record.run.sessionId, 'team.handoff.submitted', { teamRunId: runId, taskId: task.id, handoffId: handoff.id, agentId: task.assignedAgentId });
  }

  private runDeterministicQualityGate(record: TeamRunRecord): TeamQualityGateResult {
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (record.handoffs.length === 0) {
      return {
        verdict: 'blocked_by_missing_evidence',
        issues: ['No task produced a handoff.'],
        recommendations: ['Investigate why every task failed before re-running.'],
        summary: 'Blocked: no member work was completed.',
      };
    }

    const executionErrorMisuse = record.handoffs.some((h) =>
      h.findings.some((f) => f.kind === 'negative_result' && /timeout|network|permission|unavailable|failed to|error/i.test(f.statement))
    );
    if (executionErrorMisuse) {
      issues.push('A negative_result finding reads like a tool/network/permission failure rather than a genuine scientific negative result.');
      recommendations.push('Re-label execution failures as execution_error findings, not negative_result.');
    }

    const unsupported = record.handoffs.some((h) => h.findings.some((f) => f.kind !== 'hypothesis' && f.evidenceIds.length === 0));
    if (unsupported) {
      issues.push('A non-hypothesis finding cites no evidence id.');
      recommendations.push('Attach real evidence ids to every observation/inference/negative_result finding.');
    }

    const verdict: TeamQualityGateVerdict = executionErrorMisuse ? 'failed_integrity_check' : issues.length > 0 ? 'revision_required' : 'passed';
    return {
      verdict,
      issues,
      recommendations,
      summary: verdict === 'passed' ? 'Deterministic integrity checks passed.' : `Deterministic integrity checks found ${issues.length} issue(s).`,
    };
  }

  private async runReviewAndSynthesis(runId: string, team: ResearchTeamDefinition, evidenceTracker: EvidenceTracker): Promise<void> {
    const state = this.active.get(runId)!;
    const record = state.record;

    if (record.handoffs.length === 0) {
      this.failRun(runId, { code: 'NO_COMPLETED_WORK', message: 'No task completed successfully; there is nothing to review or synthesize.', cause: 'no-evidence' });
      return;
    }

    // The members' lookups go to the ledger before review, so what the run
    // found is kept (and gated) even if the critic stops the synthesis.
    if (this.evidenceLedger !== null) {
      commitRunEvidence(evidenceTracker, {
        ledger: this.evidenceLedger ?? getGlobalEvidenceLedger(),
        sessionId: record.run.sessionId,
        workspaceId: this.sessionManager.getSession(record.run.sessionId)?.workspaceId,
        eventBus: this.eventBus,
        source: 'team-run',
      });
    }

    record.run.status = 'reviewing';
    this.runStore.save(record);
    this.emit(record.run.sessionId, 'team.run.status', { teamRunId: runId, status: 'reviewing' });

    let gate = this.runDeterministicQualityGate(record);

    const criticMember = team.members.find((m) => m.agentId === 'scientific-critic');
    const criticAgentDef = criticMember ? this.agentRegistry.get('scientific-critic') : undefined;
    if (criticMember && criticAgentDef) {
      const { provider, model } = this.resolveModelProviderForAgent(team, criticMember, criticAgentDef);
      const reviewResult = await runReviewTask({
        team,
        member: criticMember,
        agentDef: criticAgentDef,
        inquiry: record.run.inquiry,
        handoffs: record.handoffs,
        modelProvider: provider,
        model,
        sessionId: record.run.sessionId,
        evidenceTracker,
      });
      if (reviewResult.raw) {
        gate = worseGateVerdict(gate, {
          verdict: reviewResult.raw.verdict,
          issues: reviewResult.raw.issues,
          recommendations: reviewResult.raw.recommendations,
          summary: reviewResult.raw.summary,
        });
      }
      // A review-turn failure (e.g. turn budget exhausted) does not silently pass the gate --
      // the deterministic checks computed above still stand on their own.
    }

    record.run.qualityGate = gate;
    this.runStore.save(record);

    if (gate.verdict !== 'passed') {
      const causeByVerdict: Record<TeamQualityGateVerdict, StructuredRunError['cause']> = {
        passed: undefined,
        revision_required: 'insufficient-evidence',
        blocked_by_missing_evidence: 'no-evidence',
        failed_integrity_check: 'evidence-contradicted',
      } as any;
      this.failRun(runId, {
        code: 'QUALITY_GATE_NOT_PASSED',
        message: `Scientific Critic gate did not pass (${gate.verdict}): ${gate.summary}`,
        cause: causeByVerdict[gate.verdict],
      });
      return;
    }

    record.run.status = 'synthesizing';
    this.runStore.save(record);
    this.emit(record.run.sessionId, 'team.run.status', { teamRunId: runId, status: 'synthesizing' });

    const writerMember = team.members.find((m) => m.agentId === 'scientific-writer');
    const writerAgentDef = writerMember ? this.agentRegistry.get('scientific-writer') : undefined;
    const synthesisAgentDef = writerAgentDef || this.agentRegistry.get(team.leaderAgentId)!;
    const { provider, model } = this.resolveModelProviderForAgent(team, writerMember, synthesisAgentDef);

    const synthesisResult = await runSynthesis({
      agentDef: synthesisAgentDef,
      team,
      inquiry: record.run.inquiry,
      handoffs: record.handoffs,
      modelProvider: provider,
      model,
    });

    const narrative = 'narrative' in synthesisResult ? synthesisResult.narrative : `[Synthesis failed: ${synthesisResult.error.message}]`;

    const report: TeamRunReport = {
      inquiry: record.run.inquiry,
      methods: Array.from(new Set(record.handoffs.flatMap((h) => h.methods))),
      keyFindings: record.handoffs.flatMap((h) => h.findings),
      evidenceIds: record.run.sharedEvidenceIds,
      conflicts: record.conflicts,
      limitations: Array.from(new Set(record.handoffs.flatMap((h) => h.limitations))),
      failedOrIncompleteTaskIds: record.tasks.filter((t) => t.status !== 'completed').map((t) => t.id),
      reproducibilityNotes: record.handoffs.filter((h) => h.agentId === 'reproducibility-engineer').flatMap((h) => h.methods),
      narrative,
    };

    record.run.report = report;
    record.run.status = 'completed';
    record.run.completedAt = new Date().toISOString();
    this.runStore.save(record);

    this.sessionManager.addTurn(record.run.sessionId, {
      index: this.sessionManager.getSession(record.run.sessionId)?.turns.length || 0,
      userInput: record.run.inquiry,
      toolCalls: [],
      toolResults: [],
      agentResponse: narrative,
      status: 'completed',
      startedAt: record.run.startedAt,
      completedAt: record.run.completedAt,
    });
    this.sessionManager.updateSessionStatus(record.run.sessionId, 'completed');

    this.emit(record.run.sessionId, 'team.run.completed', { teamRunId: runId, status: 'completed' });
  }
}

export const globalTeamOrchestrator = new TeamOrchestrator();
