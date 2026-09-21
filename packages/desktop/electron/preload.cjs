const { contextBridge, ipcRenderer } = require('electron');

const api = {
  model: {
    getProfiles: () => ipcRenderer.invoke('model:getProfiles'),
    getActiveProfile: () => ipcRenderer.invoke('model:getActiveProfile'),
    saveProfile: (profile) => ipcRenderer.invoke('model:saveProfile', profile),
    deleteProfile: (id) => ipcRenderer.invoke('model:deleteProfile', id),
    setActiveProfile: (id) => ipcRenderer.invoke('model:setActiveProfile', id),
    testConnection: (profile) => ipcRenderer.invoke('model:testConnection', profile),
  },
  agent: {
    submitPrompt: (prompt, sessionId, executionProfileId) =>
      ipcRenderer.invoke('agent:submitPrompt', { prompt, sessionId, executionProfileId }),
    listTools: () => ipcRenderer.invoke('agent:listTools'),
    cancel: (runId) => ipcRenderer.invoke('agent:cancel', runId),
    onEvent: (callback) => {
      const handler = (_e, event) => callback(event);
      ipcRenderer.on('agent:event', handler);
      return () => ipcRenderer.removeListener('agent:event', handler);
    },
    onDelta: (callback) => {
      const handler = (_e, delta) => callback(delta);
      ipcRenderer.on('agent:delta', handler);
      return () => ipcRenderer.removeListener('agent:delta', handler);
    },
  },
  runtime: {
    listProfiles: () => ipcRenderer.invoke('runtime:listProfiles'),
    getActiveProfile: () => ipcRenderer.invoke('runtime:getActiveProfile'),
    saveProfile: (profile) => ipcRenderer.invoke('runtime:saveProfile', profile),
    deleteProfile: (id) => ipcRenderer.invoke('runtime:deleteProfile', id),
    setActiveProfile: (id) => ipcRenderer.invoke('runtime:setActiveProfile', id),
    detect: (executablePath) => ipcRenderer.invoke('runtime:detect', executablePath),
    respondApproval: (sessionId, approvalId, decision) =>
      ipcRenderer.invoke('runtime:respondApproval', { sessionId, approvalId, decision }),
  },
  teams: {
    list: (includeArchived) => ipcRenderer.invoke('team:list', includeArchived),
    listAgents: () => ipcRenderer.invoke('team:listAgents'),
    get: (id) => ipcRenderer.invoke('team:get', id),
    create: (team) => ipcRenderer.invoke('team:create', team),
    update: (team) => ipcRenderer.invoke('team:update', team),
    archive: (id) => ipcRenderer.invoke('team:archive', id),
    cloneTemplate: (templateId, overrides) => ipcRenderer.invoke('team:cloneTemplate', templateId, overrides),
    run: {
      start: (teamId, inquiry, sessionId) => ipcRenderer.invoke('team:run:start', teamId, inquiry, sessionId),
      approvePlan: (runId) => ipcRenderer.invoke('team:run:approvePlan', runId),
      pause: (runId) => ipcRenderer.invoke('team:run:pause', runId),
      resume: (runId) => ipcRenderer.invoke('team:run:resume', runId),
      cancel: (runId) => ipcRenderer.invoke('team:run:cancel', runId),
      get: (runId) => ipcRenderer.invoke('team:run:get', runId),
      list: (teamId) => ipcRenderer.invoke('team:run:list', teamId),
    },
  },
  session: {
    list: () => ipcRenderer.invoke('session:list'),
    get: (id) => ipcRenderer.invoke('session:get', id),
    create: (title, agentId, profileId, modelName) =>
      ipcRenderer.invoke('session:create', { title, agentId, profileId, modelName }),
    delete: (id) => ipcRenderer.invoke('session:delete', id),
    rename: (id, title) => ipcRenderer.invoke('session:rename', { id, title }),
    export: (id) => ipcRenderer.invoke('session:export', id),
  },
};

contextBridge.exposeInMainWorld('medscience', api);
