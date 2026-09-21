import { contextBridge, ipcRenderer } from 'electron';
import {
  ModelProfile,
  ConnectionTestResult,
  RuntimeEvent,
  RuntimeSession,
  ExecutionProfile,
  RuntimeProbeResult,
  RuntimeApprovalDecision,
  ResearchTeamDefinition,
  AgentDefinition,
  TeamRunRecord,
  TeamRunsIndexEntry,
} from '@medscience/core';

const api = {
  model: {
    getProfiles: (): Promise<ModelProfile[]> => ipcRenderer.invoke('model:getProfiles'),
    getActiveProfile: (): Promise<ModelProfile | undefined> => ipcRenderer.invoke('model:getActiveProfile'),
    saveProfile: (profile: ModelProfile): Promise<{ success: boolean; profile?: ModelProfile; errors?: string[] }> =>
      ipcRenderer.invoke('model:saveProfile', profile),
    deleteProfile: (id: string): Promise<boolean> => ipcRenderer.invoke('model:deleteProfile', id),
    setActiveProfile: (id: string): Promise<boolean> => ipcRenderer.invoke('model:setActiveProfile', id),
    testConnection: (profile: ModelProfile): Promise<ConnectionTestResult> =>
      ipcRenderer.invoke('model:testConnection', profile),
  },
  agent: {
    submitPrompt: (
      prompt: string,
      sessionId?: string,
      executionProfileId?: string,
      sessionType?: 'chat' | 'research'
    ): Promise<{ session: RuntimeSession; turn: any }> =>
      ipcRenderer.invoke('agent:submitPrompt', { prompt, sessionId, executionProfileId, sessionType }),
    listTools: (): Promise<{ name: string; description: string; category: string }[]> =>
      ipcRenderer.invoke('agent:listTools'),
    cancel: (runId: string): Promise<boolean> => ipcRenderer.invoke('agent:cancel', runId),
    onEvent: (callback: (event: RuntimeEvent) => void): (() => void) => {
      const handler = (_e: any, event: RuntimeEvent) => callback(event);
      ipcRenderer.on('agent:event', handler);
      return () => ipcRenderer.removeListener('agent:event', handler);
    },
    onDelta: (callback: (delta: string) => void): (() => void) => {
      const handler = (_e: any, delta: string) => callback(delta);
      ipcRenderer.on('agent:delta', handler);
      return () => ipcRenderer.removeListener('agent:delta', handler);
    },
  },
  runtime: {
    listProfiles: (): Promise<ExecutionProfile[]> => ipcRenderer.invoke('runtime:listProfiles'),
    getActiveProfile: (): Promise<ExecutionProfile> => ipcRenderer.invoke('runtime:getActiveProfile'),
    saveProfile: (
      profile: ExecutionProfile
    ): Promise<{ success: boolean; profile?: ExecutionProfile; errors?: string[] }> =>
      ipcRenderer.invoke('runtime:saveProfile', profile),
    deleteProfile: (id: string): Promise<boolean> => ipcRenderer.invoke('runtime:deleteProfile', id),
    setActiveProfile: (id: string): Promise<boolean> => ipcRenderer.invoke('runtime:setActiveProfile', id),
    detect: (executablePath?: string): Promise<RuntimeProbeResult> => ipcRenderer.invoke('runtime:detect', executablePath),
    respondApproval: (sessionId: string, approvalId: string, decision: RuntimeApprovalDecision): Promise<boolean> =>
      ipcRenderer.invoke('runtime:respondApproval', { sessionId, approvalId, decision }),
  },
  teams: {
    list: (includeArchived?: boolean): Promise<ResearchTeamDefinition[]> =>
      ipcRenderer.invoke('team:list', includeArchived),
    listAgents: (): Promise<AgentDefinition[]> => ipcRenderer.invoke('team:listAgents'),
    get: (id: string): Promise<ResearchTeamDefinition | undefined> => ipcRenderer.invoke('team:get', id),
    create: (
      team: ResearchTeamDefinition
    ): Promise<{ success: boolean; team?: ResearchTeamDefinition; errors?: string[] }> =>
      ipcRenderer.invoke('team:create', team),
    update: (
      team: ResearchTeamDefinition
    ): Promise<{ success: boolean; team?: ResearchTeamDefinition; errors?: string[] }> =>
      ipcRenderer.invoke('team:update', team),
    archive: (id: string): Promise<boolean> => ipcRenderer.invoke('team:archive', id),
    cloneTemplate: (
      templateId: string,
      overrides?: { name?: string; description?: string }
    ): Promise<{ success: boolean; team?: ResearchTeamDefinition; errors?: string[] }> =>
      ipcRenderer.invoke('team:cloneTemplate', templateId, overrides),
    run: {
      start: (teamId: string, inquiry: string, sessionId?: string): Promise<TeamRunRecord> =>
        ipcRenderer.invoke('team:run:start', teamId, inquiry, sessionId),
      approvePlan: (runId: string): Promise<TeamRunRecord> => ipcRenderer.invoke('team:run:approvePlan', runId),
      pause: (runId: string): Promise<boolean> => ipcRenderer.invoke('team:run:pause', runId),
      resume: (runId: string): Promise<boolean> => ipcRenderer.invoke('team:run:resume', runId),
      cancel: (runId: string): Promise<boolean> => ipcRenderer.invoke('team:run:cancel', runId),
      get: (runId: string): Promise<TeamRunRecord | undefined> => ipcRenderer.invoke('team:run:get', runId),
      list: (teamId?: string): Promise<TeamRunsIndexEntry[]> => ipcRenderer.invoke('team:run:list', teamId),
    },
  },
  session: {
    list: (): Promise<RuntimeSession[]> => ipcRenderer.invoke('session:list'),
    get: (id: string): Promise<RuntimeSession | undefined> => ipcRenderer.invoke('session:get', id),
    create: (title: string, agentId?: string, profileId?: string, modelName?: string): Promise<RuntimeSession> =>
      ipcRenderer.invoke('session:create', { title, agentId, profileId, modelName }),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('session:delete', id),
    rename: (id: string, title: string): Promise<boolean> => ipcRenderer.invoke('session:rename', { id, title }),
    export: (id: string): Promise<string> => ipcRenderer.invoke('session:export', id),
  },
};

contextBridge.exposeInMainWorld('medscience', api);

export type MedScienceDesktopAPI = typeof api;
