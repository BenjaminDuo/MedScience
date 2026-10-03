import type {
  CalibrationFileReport,
  ChainStatus,
  GateCheck,
  InvariantViolation,
  LedgerEntry,
  LedgerEvent,
  LedgerFilter,
  LedgerKind,
  LedgerState,
  RetractionImportResult,
  RetractionSweepChange,
  TransitionResult,
  AgentDefinition,
  AgentSubmitPayload,
  ApiChannelName,
  ConnectionTestResult,
  ExecutionProfile,
  LocalRuntimeKind,
  ModelProfile,
  ResearchTeamDefinition,
  SkillInstallResult,
  RuntimeApprovalDecision,
  RuntimeEvent,
  RuntimeSession,
  TeamRunRecord,
  TeamRunsIndexEntry,
  Workspace,
} from '@medscience/core';

/**
 * The renderer's typed view of the app API -- built once, on top of a
 * transport, for both hosts:
 *
 * - Electron: `window.medscienceBridge` (preload.cjs) -> ipcMain handlers
 * - Local web: POST /api/rpc + an SSE stream -> the same handlers
 *
 * The handlers themselves live in @medscience/core (api/channels.ts), and
 * `ApiChannelName` is imported from there, so calling a channel that does
 * not exist is a compile error rather than a runtime one. Nothing in this
 * file may import a runtime *value* from @medscience/core: the renderer
 * bundles core from source, and core is node-only.
 */
type Transport = (channel: ApiChannelName, ...args: any[]) => Promise<any>;
type EventSubscriber = (channel: 'agent:event' | 'agent:delta', callback: (payload: any) => void) => () => void;

interface MedScienceBridge {
  invoke: Transport;
  on: EventSubscriber;
}

declare global {
  interface Window {
    medscienceBridge?: MedScienceBridge;
  }
}

export interface LedgerOverview {
  stats: Record<LedgerKind, Record<LedgerState, number>>;
  chain: ChainStatus;
  violations: InvariantViolation[];
  retractions: { size: number; importedAt?: string; source?: string };
  calibration:
    | { calibrated: true; alpha: number; counts: Record<'supported' | 'refuted', number>; createdAt: string; datasetHash: string }
    | { calibrated: false };
}

export function createApiClient(invoke: Transport, subscribe: EventSubscriber) {
  return {
    model: {
      getProfiles: (): Promise<ModelProfile[]> => invoke('model:getProfiles'),
      getActiveProfile: (): Promise<ModelProfile | undefined> => invoke('model:getActiveProfile'),
      saveProfile: (profile: ModelProfile): Promise<{ success: boolean; profile?: ModelProfile; errors?: string[] }> =>
        invoke('model:saveProfile', profile),
      deleteProfile: (id: string): Promise<boolean> => invoke('model:deleteProfile', id),
      setActiveProfile: (id: string): Promise<boolean> => invoke('model:setActiveProfile', id),
      testConnection: (profile: ModelProfile): Promise<ConnectionTestResult> => invoke('model:testConnection', profile),
    },
    agent: {
      submitPrompt: (
        prompt: string,
        sessionId?: string,
        executionProfileId?: string,
        sessionType?: 'chat' | 'research',
        workspaceId?: string,
        researchProfileId?: string,
        language?: 'en' | 'zh',
        /** Which member the conversation is with; only used when starting a new one. */
        agentId?: string
      ): Promise<{ session: RuntimeSession; turn: any }> => {
        const payload: AgentSubmitPayload = {
          prompt,
          sessionId,
          executionProfileId,
          sessionType,
          workspaceId,
          researchProfileId,
          agentId,
          language,
        };
        return invoke('agent:submitPrompt', payload);
      },
      listTools: (): Promise<{ name: string; description: string; category: string }[]> => invoke('agent:listTools'),
      cancel: (runId: string): Promise<boolean> => invoke('agent:cancel', runId),
      onEvent: (callback: (event: RuntimeEvent) => void): (() => void) => subscribe('agent:event', callback),
      onDelta: (callback: (delta: string) => void): (() => void) => subscribe('agent:delta', callback),
    },
    runtime: {
      listProfiles: (): Promise<ExecutionProfile[]> => invoke('runtime:listProfiles'),
      getActiveProfile: (): Promise<ExecutionProfile> => invoke('runtime:getActiveProfile'),
      saveProfile: (
        profile: ExecutionProfile
      ): Promise<{ success: boolean; profile?: ExecutionProfile; errors?: string[] }> =>
        invoke('runtime:saveProfile', profile),
      deleteProfile: (id: string): Promise<boolean> => invoke('runtime:deleteProfile', id),
      setActiveProfile: (id: string): Promise<boolean> => invoke('runtime:setActiveProfile', id),
      detect: (executablePath?: string): Promise<any> => invoke('runtime:detect', executablePath),
      discoverAll: (): Promise<any[]> => invoke('runtime:discoverAll'),
      bindTool: (runtime: LocalRuntimeKind, executablePath?: string): Promise<any> =>
        invoke('runtime:bindTool', runtime, executablePath),
      activeSessions: (): Promise<any[]> => invoke('runtime:activeSessions'),
      getUsage: (): Promise<Record<string, any>> => invoke('runtime:getUsage'),
      respondApproval: (sessionId: string, approvalId: string, decision: RuntimeApprovalDecision): Promise<boolean> =>
        invoke('runtime:respondApproval', sessionId, approvalId, decision),
    },
    skills: {
      /** Stages, audits, and (only if the audit passes) installs a skill from a URL or local path. */
      install: (sourceUrlOrPath: string): Promise<SkillInstallResult> =>
        invoke('skill:install', sourceUrlOrPath),
      listInstalled: (): Promise<{ skillId: string; name: string; path: string }[]> =>
        invoke('skill:listInstalled'),
      uninstall: (skillId: string): Promise<boolean> => invoke('skill:uninstall', skillId),
    },
    teams: {
      list: (includeArchived?: boolean, workspaceId?: string): Promise<ResearchTeamDefinition[]> =>
        invoke('team:list', includeArchived, workspaceId),
      listAgents: (): Promise<AgentDefinition[]> => invoke('team:listAgents'),
      setAgentInstructions: (
        agentId: string,
        userInstructions: string
      ): Promise<{ success: boolean; errors?: string[] }> =>
        invoke('team:setAgentInstructions', agentId, userInstructions),
      saveAgent: (
        agent: AgentDefinition
      ): Promise<{ success: boolean; agent?: AgentDefinition; errors?: string[] }> => invoke('team:saveAgent', agent),
      deleteAgent: (agentId: string): Promise<boolean> => invoke('team:deleteAgent', agentId),
      get: (id: string): Promise<ResearchTeamDefinition | undefined> => invoke('team:get', id),
      create: (
        team: ResearchTeamDefinition
      ): Promise<{ success: boolean; team?: ResearchTeamDefinition; errors?: string[] }> =>
        invoke('team:create', team),
      update: (
        team: ResearchTeamDefinition
      ): Promise<{ success: boolean; team?: ResearchTeamDefinition; errors?: string[] }> =>
        invoke('team:update', team),
      archive: (id: string): Promise<boolean> => invoke('team:archive', id),
      unarchive: (id: string): Promise<boolean> => invoke('team:unarchive', id),
      cloneTemplate: (
        templateId: string,
        overrides?: { name?: string; description?: string; workspaceId?: string }
      ): Promise<{ success: boolean; team?: ResearchTeamDefinition; errors?: string[] }> =>
        invoke('team:cloneTemplate', templateId, overrides),
      run: {
        start: (
          teamId: string,
          inquiry: string,
          sessionId?: string,
          workspaceId?: string,
          researchProfileId?: string
        ): Promise<TeamRunRecord> =>
          invoke('team:run:start', teamId, inquiry, sessionId, workspaceId, researchProfileId),
        approvePlan: (runId: string): Promise<TeamRunRecord> => invoke('team:run:approvePlan', runId),
        pause: (runId: string): Promise<boolean> => invoke('team:run:pause', runId),
        resume: (runId: string): Promise<boolean> => invoke('team:run:resume', runId),
        cancel: (runId: string): Promise<boolean> => invoke('team:run:cancel', runId),
        get: (runId: string): Promise<TeamRunRecord | undefined> => invoke('team:run:get', runId),
        list: (teamId?: string, workspaceId?: string): Promise<TeamRunsIndexEntry[]> =>
          invoke('team:run:list', teamId, workspaceId),
        history: (teamId: string, workspaceId?: string, limit?: number): Promise<TeamRunRecord[]> =>
          invoke('team:run:history', teamId, workspaceId, limit),
      },
    },
    workspace: {
      list: (): Promise<Workspace[]> => invoke('workspace:list'),
      create: (title: string, description?: string): Promise<Workspace> =>
        invoke('workspace:create', title, description),
      rename: (id: string, title: string): Promise<boolean> => invoke('workspace:rename', id, title),
      delete: (id: string): Promise<boolean> => invoke('workspace:delete', id),
    },
    session: {
      list: (): Promise<RuntimeSession[]> => invoke('session:list'),
      get: (id: string): Promise<RuntimeSession | undefined> => invoke('session:get', id),
      create: (
        title: string,
        agentId?: any,
        profileId?: string,
        modelName?: string,
        workspaceId?: string,
        researchProfileId?: string
      ): Promise<RuntimeSession> =>
        invoke('session:create', title, agentId, profileId, modelName, workspaceId, researchProfileId),
      delete: (id: string): Promise<boolean> => invoke('session:delete', id),
      rename: (id: string, title: string): Promise<boolean> => invoke('session:rename', id, title),
      export: (id: string): Promise<string> => invoke('session:export', id),
    },
    ledger: {
      list: (filter?: LedgerFilter): Promise<LedgerEntry[]> => invoke('ledger:list', filter),
      get: (
        id: string
      ): Promise<
        | { entry: LedgerEntry; history: LedgerEvent[]; dependents: LedgerEntry[]; cites: LedgerEntry[]; allowedTransitions: LedgerState[] }
        | undefined
      > => invoke('ledger:get', id),
      overview: (): Promise<LedgerOverview> => invoke('ledger:overview'),
      verify: (): Promise<{ chain: ChainStatus; violations: InvariantViolation[] }> => invoke('ledger:verify'),
      transition: (id: string, to: LedgerState, reason: string): Promise<TransitionResult> =>
        invoke('ledger:transition', id, to, reason),
      promoteClaim: (id: string): Promise<TransitionResult> => invoke('ledger:promoteClaim', id),
      readmit: (
        id: string
      ): Promise<{ ok: boolean; error?: string; decision?: 'admit' | 'quarantine'; checks?: GateCheck[]; state?: LedgerState }> =>
        invoke('ledger:readmit', id),
      importRetractionsFromPath: (filePath: string): Promise<RetractionImportResult> =>
        invoke('ledger:importRetractionsFromPath', filePath),
      importRetractionsCsv: (csvText: string, sourceName?: string): Promise<RetractionImportResult> =>
        invoke('ledger:importRetractionsCsv', csvText, sourceName),
      sweepRetractions: (): Promise<RetractionSweepChange[]> => invoke('ledger:sweepRetractions'),
      calibrateFromFile: (filePath: string, alpha?: number): Promise<CalibrationFileReport> =>
        invoke('ledger:calibrateFromFile', filePath, alpha),
    },
  };
}

export type MedScienceApi = ReturnType<typeof createApiClient>;

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

async function httpInvoke(channel: ApiChannelName, ...args: any[]): Promise<any> {
  const response = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, args }),
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = payload && typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload?.result;
}

const runtimeListeners = new Set<(event: RuntimeEvent) => void>();
const deltaListeners = new Set<(delta: string) => void>();
let eventSource: EventSource | undefined;

function ensureEventStream(): void {
  if (eventSource) return;
  eventSource = new EventSource('/api/events');
  eventSource.addEventListener('runtime', (message) => {
    const event = JSON.parse((message as MessageEvent).data) as RuntimeEvent;
    runtimeListeners.forEach((listener) => listener(event));
  });
  eventSource.addEventListener('delta', (message) => {
    const delta = JSON.parse((message as MessageEvent).data) as string;
    deltaListeners.forEach((listener) => listener(delta));
  });
}

const httpSubscribe: EventSubscriber = (channel, callback) => {
  ensureEventStream();
  if (channel === 'agent:event') {
    runtimeListeners.add(callback);
    return () => runtimeListeners.delete(callback) as unknown as void;
  }
  deltaListeners.add(callback);
  return () => deltaListeners.delete(callback) as unknown as void;
};

/**
 * Installs `window.medscience`. Electron's preload provides the IPC
 * transport; a plain browser falls back to the loopback-only HTTP/SSE
 * bridge. Both get the identical client object.
 */
export function installApiClient(): MedScienceApi {
  const bridge = window.medscienceBridge;
  const client = bridge
    ? createApiClient(bridge.invoke, bridge.on)
    : createApiClient(httpInvoke, httpSubscribe);
  window.medscience = client;
  return client;
}
