import { globalProfileManager } from '../config/ProfileManager.js';
import { globalExecutionProfileManager } from '../config/ExecutionProfileManager.js';
import { globalExecutionRouter } from '../execution/ExecutionRouter.js';
import { globalRuntimeDetector } from '../execution/local/RuntimeDetector.js';
import { globalRuntimeUsageStore } from '../execution/local/RuntimeUsageStore.js';
import { discoverAllRuntimes, bindLocalRuntime } from '../execution/local/runtimeDiscovery.js';
import { globalSessionManager } from '../core/SessionManager.js';
import { globalWorkspaceManager } from '../core/WorkspaceManager.js';
import { globalToolRegistry } from '../tools/ToolRegistry.js';
import { globalSkillInstaller } from '../skills/SkillInstaller.js';
import { globalTeamProfileManager } from '../teams/TeamProfileManager.js';
import { globalTeamAgentRegistry } from '../teams/TeamRegistry.js';
import { globalTeamOrchestrator } from '../teams/TeamOrchestrator.js';
import { GenericModelClient } from '../client/GenericModelClient.js';
import { fallbackMockProvider } from '../client/ScientificMockProvider.js';
import { ModelProfile, ConnectionTestResult } from '../types/model.js';
import { ExecutionProfile, RuntimeApprovalDecision, LocalRuntimeKind } from '../execution/types.js';
import { ResearchTeamDefinition } from '../teams/types.js';
import { DEFAULT_AGENT_ID } from '../agents/agentPersona.js';
import { ALLOWED_TRANSITIONS, getGlobalEvidenceLedger, LedgerFilter, LedgerState } from '../epistemic/EvidenceLedger.js';
import { getGlobalRetractionIndex } from '../epistemic/RetractionIndex.js';
import { AdmissionGate, sweepRetractions } from '../epistemic/AdmissionGate.js';
import { calibrateFromFile, loadCalibration, loadDefaultClassifier } from '../epistemic/ConformalClassifier.js';
import { globalSubagentTreeEngine } from '../research-loop/SubagentTreeEngine.js';
import { globalEventBus } from '../core/EventBus.js';

/**
 * The single definition of MedScience's app API.
 *
 * Both hosts -- the Electron main process (ipcMain.handle per channel) and
 * the local web server (one /api/rpc endpoint) -- register exactly these
 * handlers, and the renderer builds its typed client from the same channel
 * names (see packages/desktop/src/runtime/apiClient.ts). Before this
 * existed, every new call had to be written four times (an ipc/ handler, a
 * preload method, an HTTP route, and a fetch wrapper), and they had already
 * drifted: the shipped preload.cjs dropped agent:submitPrompt's
 * workspaceId/researchProfileId/sessionType/language arguments entirely and
 * never exposed runtime:discoverAll/bindTool/activeSessions/getUsage.
 *
 * Rules for this file:
 * - Channel names are stable strings; the renderer's client is type-checked
 *   against `ApiChannelName`, so a typo there is a compile error.
 * - Arguments are positional and serializable, in the same order the
 *   renderer's client passes them.
 * - Anything a host must do differently (streaming deltas to the renderer)
 *   comes in through `ApiChannelHost`, never through a host-specific copy
 *   of the handler.
 */
export interface ApiChannelHost {
  /** Streamed assistant tokens for the turn currently executing. */
  onDelta(delta: string): void;
}

export interface AgentSubmitPayload {
  prompt: string;
  sessionId?: string;
  executionProfileId?: string;
  sessionType?: 'chat' | 'research';
  workspaceId?: string;
  researchProfileId?: string;
  /** Which member this conversation is with; only used when starting a new one. */
  agentId?: string;
  language?: 'en' | 'zh';
}

/** Placeholder the UI shows (and sends back) instead of a stored API key. */
const SECRET_MASK = '••••••••';

function sanitizeProfile(profile: ModelProfile | undefined): ModelProfile | undefined {
  return profile ? { ...profile, apiKey: profile.apiKey ? SECRET_MASK : '' } : undefined;
}

/**
 * Restores the stored API key when the incoming profile carries the mask (or
 * nothing) instead of a real secret -- i.e. the user edited some other field
 * and never retyped the key.
 */
function profileWithStoredSecret(profile: ModelProfile): ModelProfile {
  if (profile.apiKey && profile.apiKey !== SECRET_MASK) return profile;
  const stored = profile.id ? globalProfileManager.getProfile(profile.id) : undefined;
  return stored?.apiKey ? { ...profile, apiKey: stored.apiKey } : profile;
}

/**
 * Before the channel registry existed, a few calls took a single payload
 * object ({ title, description }) instead of positional arguments. A
 * desktop app still running an older preload sends that shape, and the new
 * handler would then receive an object where it expects a string --
 * `title.trim is not a function`, and the call fails with no visible reason
 * (the symptom: "I can't create a workspace any more"). These unwrap either
 * shape so an app that has not been restarted keeps working.
 */
function legacyArgs<T extends Record<string, any>>(first: any, keys: (keyof T)[], values: any[]): T {
  if (first && typeof first === 'object' && !Array.isArray(first) && keys.some((key) => key in first)) {
    return first as T;
  }
  const unpacked = {} as T;
  keys.forEach((key, index) => {
    (unpacked as any)[key] = index === 0 ? first : values[index - 1];
  });
  return unpacked;
}

function emitLedgerUpdate(source: 'curator' | 'retraction-sweep', transitions: number): void {
  globalEventBus.emit({
    type: 'evidence.ledger.updated',
    sessionId: 'ledger',
    timestamp: new Date().toISOString(),
    payload: { source, admitted: 0, quarantined: 0, transitions },
  });
}

export function createApiChannels(host: ApiChannelHost) {
  return {
    // ----- model profiles -----
    'model:getProfiles': async (): Promise<ModelProfile[]> =>
      globalProfileManager.listProfiles().map((p) => sanitizeProfile(p)!),
    'model:getActiveProfile': async (): Promise<ModelProfile | undefined> =>
      sanitizeProfile(globalProfileManager.getActiveProfile()),
    'model:saveProfile': async (profile: ModelProfile) => {
      const result = globalProfileManager.saveProfile(profileWithStoredSecret(profile));
      return { ...result, profile: sanitizeProfile(result.profile) };
    },
    'model:deleteProfile': async (id: string): Promise<boolean> => globalProfileManager.deleteProfile(id),
    'model:setActiveProfile': async (id: string): Promise<boolean> => globalProfileManager.setActiveProfile(id),
    'model:testConnection': async (profile: ModelProfile): Promise<ConnectionTestResult> => {
      const full = profileWithStoredSecret(profile);
      if (!full?.baseUrl || !full.model) return fallbackMockProvider.testConnection();
      return new GenericModelClient(full).testConnection();
    },

    // ----- single-agent turns -----
    // Routed through ExecutionRouter (not the API research engine directly)
    // so the active ExecutionProfile decides which backend runs this turn;
    // executionProfileId overrides it for this one request only.
    'agent:submitPrompt': async (payload: AgentSubmitPayload) =>
      globalExecutionRouter.execute(
        {
          prompt: payload.prompt,
          sessionId: payload.sessionId,
          executionProfileId: payload.executionProfileId,
          sessionType: payload.sessionType,
          workspaceId: payload.workspaceId,
          researchProfileId: payload.researchProfileId,
          agentId: payload.agentId,
          language: payload.language,
        },
        { onDelta: (delta: string) => host.onDelta(delta) }
      ),
    // Strips each ToolDefinition's execute() (not serializable) down to what
    // the prompt bar's tool picker needs.
    'agent:listTools': async () =>
      globalToolRegistry.list().map((t) => ({ name: t.name, description: t.description, category: t.category })),
    'agent:cancel': async (runId: string): Promise<boolean> => globalExecutionRouter.cancel(runId),

    // ----- execution runtimes -----
    'runtime:listProfiles': async (): Promise<ExecutionProfile[]> => globalExecutionProfileManager.listProfiles(),
    'runtime:getActiveProfile': async (): Promise<ExecutionProfile> => globalExecutionProfileManager.getActiveProfile(),
    'runtime:saveProfile': async (profile: ExecutionProfile) => globalExecutionProfileManager.saveProfile(profile),
    'runtime:deleteProfile': async (id: string): Promise<boolean> => globalExecutionProfileManager.deleteProfile(id),
    'runtime:setActiveProfile': async (id: string): Promise<boolean> => globalExecutionProfileManager.setActiveProfile(id),
    'runtime:detect': async (executablePath?: string) => globalRuntimeDetector.probe(executablePath),
    'runtime:discoverAll': async () => discoverAllRuntimes(),
    'runtime:bindTool': async (
      runtime: LocalRuntimeKind | { runtime: LocalRuntimeKind; executablePath?: string },
      executablePath?: string
    ) => {
      const args = legacyArgs<{ runtime: LocalRuntimeKind; executablePath?: string }>(
        runtime,
        ['runtime', 'executablePath'],
        [executablePath]
      );
      return bindLocalRuntime(args.runtime, args.executablePath);
    },
    'runtime:activeSessions': async () => globalExecutionRouter.listActiveLocalSessions(),
    'runtime:getUsage': async () => globalRuntimeUsageStore.getAllUsage(),
    'runtime:respondApproval': async (
      sessionId: string | { sessionId: string; approvalId: string; decision: RuntimeApprovalDecision },
      approvalId?: string,
      decision?: RuntimeApprovalDecision
    ) => {
      const args = legacyArgs<{ sessionId: string; approvalId: string; decision: RuntimeApprovalDecision }>(
        sessionId,
        ['sessionId', 'approvalId', 'decision'],
        [approvalId, decision]
      );
      return globalExecutionRouter.respondApproval(args.sessionId, args.approvalId, args.decision);
    },

    // ----- research teams (群组) -----
    'team:list': async (includeArchived?: boolean, workspaceId?: string): Promise<ResearchTeamDefinition[]> => {
      // A workspace always has a team (see ensureDefaultTeam); this is the
      // one call every workspace makes, so it is where that is guaranteed.
      if (workspaceId) globalTeamProfileManager.ensureDefaultTeam(workspaceId);
      return globalTeamProfileManager.listAll(Boolean(includeArchived), workspaceId);
    },
    'team:listAgents': async () => globalTeamAgentRegistry.list(),
    /** The user's standing instructions for a member (member card). */
    'team:setAgentInstructions': async (agentId: string, userInstructions: string) =>
      globalTeamAgentRegistry.setUserInstructions(agentId, userInstructions),
    'team:saveAgent': async (agent: any) => globalTeamAgentRegistry.saveCustomAgent(agent),
    'team:deleteAgent': async (agentId: string): Promise<boolean> =>
      globalTeamAgentRegistry.deleteCustomAgent(agentId),
    'team:get': async (id: string): Promise<ResearchTeamDefinition | undefined> => globalTeamProfileManager.getTeam(id),
    // Forces a fresh id so "create" can never silently overwrite a team.
    'team:create': async (team: ResearchTeamDefinition) =>
      globalTeamProfileManager.saveTeam({ ...team, id: undefined as any }),
    'team:update': async (team: ResearchTeamDefinition) => {
      if (!team.id) return { success: false, errors: ['team:update requires an existing team id.'] };
      return globalTeamProfileManager.saveTeam(team);
    },
    'team:archive': async (id: string): Promise<boolean> => globalTeamProfileManager.archiveTeam(id),
    'team:unarchive': async (id: string): Promise<boolean> => globalTeamProfileManager.unarchiveTeam(id),
    'team:cloneTemplate': async (
      templateId: string,
      overrides?: { name?: string; description?: string; workspaceId?: string }
    ) => globalTeamProfileManager.cloneTemplate(templateId, overrides),

    // ----- team runs (群里的课题) -----
    'team:run:start': async (
      teamId: string,
      inquiry: string,
      sessionId?: string,
      workspaceId?: string,
      researchProfileId?: string
    ) => globalTeamOrchestrator.startRun(teamId, inquiry, sessionId, workspaceId, researchProfileId),
    'team:run:approvePlan': async (runId: string) => globalTeamOrchestrator.approvePlan(runId),
    'team:run:pause': async (runId: string): Promise<boolean> => globalTeamOrchestrator.pauseRun(runId),
    'team:run:resume': async (runId: string): Promise<boolean> => globalTeamOrchestrator.resumeRun(runId),
    'team:run:cancel': async (runId: string): Promise<boolean> => globalTeamOrchestrator.cancelRun(runId),
    'team:run:get': async (runId: string) => globalTeamOrchestrator.getRun(runId),
    'team:run:list': async (teamId?: string, workspaceId?: string) =>
      globalTeamOrchestrator.listRuns(teamId, workspaceId),
    /** Full records for the group chat's message history (see TeamOrchestrator.listRunRecords). */
    'team:run:history': async (teamId: string, workspaceId?: string, limit?: number) =>
      globalTeamOrchestrator.listRunRecords(teamId, workspaceId, limit ?? 5),

    // ----- scientific skills -----
    // installSkill stages the source, runs the static security audit, and
    // only commits if the audit passes -- the audit report comes back either
    // way so the caller can show WHY an install was refused. This used to be
    // reachable only from the CLI; the desktop skills page is where a user
    // actually looks for skills, so it belongs here.
    'skill:install': async (sourceUrlOrPath: string) => globalSkillInstaller.installSkill(sourceUrlOrPath, true),
    'skill:listInstalled': async () => globalSkillInstaller.listInstalledSkills(),
    'skill:uninstall': async (skillId: string): Promise<boolean> => globalSkillInstaller.uninstallSkill(skillId),

    // ----- workspaces -----
    'workspace:list': async () => globalWorkspaceManager.listWorkspaces(),
    'workspace:create': async (title: string | { title: string; description?: string }, description?: string) => {
      const args = legacyArgs<{ title: string; description?: string }>(title, ['title', 'description'], [description]);
      return globalWorkspaceManager.createWorkspace(args.title, undefined, args.description);
    },
    'workspace:rename': async (id: string | { id: string; title: string }, title?: string): Promise<boolean> => {
      const args = legacyArgs<{ id: string; title: string }>(id, ['id', 'title'], [title]);
      return globalWorkspaceManager.renameWorkspace(args.id, args.title);
    },
    'workspace:delete': async (id: string): Promise<boolean> => globalWorkspaceManager.deleteWorkspace(id),

    // ----- conversations -----
    'session:list': async () => globalSessionManager.listSessions(),
    'session:get': async (id: string) => globalSessionManager.getSession(id),
    'session:create': async (
      title: string | { title: string; agentId?: string; profileId?: string; modelName?: string; workspaceId?: string; researchProfileId?: string },
      agentId?: string,
      profileId?: string,
      modelName?: string,
      workspaceId?: string,
      researchProfileId?: string
    ) => {
      const args = legacyArgs<{
        title: string;
        agentId?: string;
        profileId?: string;
        modelName?: string;
        workspaceId?: string;
        researchProfileId?: string;
      }>(title, ['title', 'agentId', 'profileId', 'modelName', 'workspaceId', 'researchProfileId'], [
        agentId,
        profileId,
        modelName,
        workspaceId,
        researchProfileId,
      ]);
      return globalSessionManager.createSession(
        args.title,
        args.workspaceId || 'proj-1',
        args.agentId || DEFAULT_AGENT_ID,
        args.profileId,
        args.modelName,
        undefined,
        'research',
        args.researchProfileId || 'general'
      );
    },
    'session:delete': async (id: string): Promise<boolean> => globalSessionManager.deleteSession(id),
    'session:rename': async (id: string | { id: string; title: string }, title?: string): Promise<boolean> => {
      const args = legacyArgs<{ id: string; title: string }>(id, ['id', 'title'], [title]);
      return globalSessionManager.renameSession(args.id, args.title);
    },
    'session:export': async (id: string): Promise<string> => globalSessionManager.exportSessionMarkdown(id),

    // ----- evidence ledger (证据账本) -----
    'ledger:list': async (filter?: LedgerFilter) => getGlobalEvidenceLedger().list(filter ?? {}),
    'ledger:get': async (id: string) => {
      const ledger = getGlobalEvidenceLedger();
      const entry = ledger.get(id);
      if (!entry) return undefined;
      const cites = [...(entry.supports ?? []), ...(entry.refutes ?? [])].map((ref) => ledger.get(ref)).filter(Boolean);
      return {
        entry,
        history: ledger.history(id),
        dependents: ledger.dependents(id),
        cites,
        // The UI offers only these, so it never has to mirror the state machine.
        allowedTransitions: ALLOWED_TRANSITIONS[entry.state],
      };
    },
    'ledger:overview': async () => {
      const ledger = getGlobalEvidenceLedger();
      const calibration = loadCalibration();
      return {
        stats: ledger.stats(),
        chain: ledger.chainStatus(),
        violations: ledger.checkInvariants(),
        retractions: getGlobalRetractionIndex().info(),
        calibration: calibration
          ? { calibrated: true, alpha: calibration.alpha, counts: calibration.counts, createdAt: calibration.createdAt, datasetHash: calibration.datasetHash }
          : { calibrated: false },
      };
    },
    'ledger:verify': async () => {
      const ledger = getGlobalEvidenceLedger();
      return { chain: ledger.verifyChain(), violations: ledger.checkInvariants() };
    },
    /** Curator action: a person moves an entry (e.g. contests or revokes it), with a reason. */
    'ledger:transition': async (id: string, to: LedgerState, reason: string) => {
      if (!reason?.trim()) return { ok: false, cascaded: [], error: 'A reason is required for every manual change.' };
      const result = getGlobalEvidenceLedger().transition(id, to, reason.trim(), 'user');
      if (result.ok) emitLedgerUpdate('curator', 1 + result.cascaded.length);
      return result;
    },
    'ledger:promoteClaim': async (id: string) => {
      const result = getGlobalEvidenceLedger().promoteClaim(id, 'user');
      if (result.ok) emitLedgerUpdate('curator', 1 + result.cascaded.length);
      return result;
    },
    /** Sends a quarantined entry back through the admission gate. */
    'ledger:readmit': async (id: string) => {
      const ledger = getGlobalEvidenceLedger();
      const entry = ledger.get(id);
      if (!entry || entry.kind !== 'evidence' || entry.state !== 'quarantined') {
        return { ok: false, error: 'Only quarantined evidence can be re-admitted.' };
      }
      const back = ledger.transition(id, 'candidate', 're-review requested', 'user');
      if (!back.ok) return { ok: false, error: back.error };
      const gate = new AdmissionGate({ retractions: getGlobalRetractionIndex() }).admit(ledger, id, { actor: 'user' });
      emitLedgerUpdate('curator', 2);
      return { ok: true, decision: gate.decision, checks: gate.checks, state: ledger.get(id)?.state };
    },
    /**
     * Imports a retraction CSV by path. Reading the file in the host process
     * (rather than sending its contents) is what lets the full Retraction
     * Watch file through: the web host caps request bodies at 1 MiB.
     */
    'ledger:importRetractionsFromPath': async (filePath: string) => getGlobalRetractionIndex().importFile(filePath),
    'ledger:importRetractionsCsv': async (csvText: string, sourceName?: string) =>
      getGlobalRetractionIndex().importCsv(csvText, sourceName || 'pasted.csv'),
    'ledger:sweepRetractions': async () => {
      const changes = sweepRetractions(getGlobalEvidenceLedger(), getGlobalRetractionIndex(), { actor: 'user' });
      emitLedgerUpdate('retraction-sweep', changes.reduce((n, c) => n + 1 + c.cascaded.length, 0));
      return changes;
    },
    /** Fits and calibrates the hypothesis classifier from a labelled JSON/JSONL file. */
    'ledger:calibrateFromFile': async (filePath: string, alpha?: number) => {
      const report = calibrateFromFile(filePath, alpha ?? 0.1);
      // The running engine picks up the new calibration without a restart.
      globalSubagentTreeEngine.setClassifier(loadDefaultClassifier());
      return report;
    },
  };
}

export type ApiChannels = ReturnType<typeof createApiChannels>;
export type ApiChannelName = keyof ApiChannels;

/** Every channel name, for host-side allowlisting. */
export const apiChannelNames = Object.keys(
  createApiChannels({ onDelta: () => undefined })
) as ApiChannelName[];
