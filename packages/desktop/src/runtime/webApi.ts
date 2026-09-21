import type { MedScienceDesktopAPI } from '../../electron/preload';
import type { RuntimeEvent } from '@medscience/core';

type RuntimeListener = (event: RuntimeEvent) => void;
type DeltaListener = (delta: string) => void;

const runtimeListeners = new Set<RuntimeListener>();
const deltaListeners = new Set<DeltaListener>();
let eventSource: EventSource | undefined;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = payload && typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

function ensureEventStream(): void {
  if (eventSource || (runtimeListeners.size === 0 && deltaListeners.size === 0)) return;

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

function releaseEventStream(): void {
  if (runtimeListeners.size > 0 || deltaListeners.size > 0) return;
  eventSource?.close();
  eventSource = undefined;
}

const webApi: MedScienceDesktopAPI = {
  model: {
    getProfiles: () => request('/api/model/profiles'),
    getActiveProfile: () => request('/api/model/active'),
    saveProfile: (profile) =>
      request('/api/model/profiles', { method: 'POST', body: JSON.stringify(profile) }),
    deleteProfile: (id) =>
      request(`/api/model/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    setActiveProfile: (id) =>
      request('/api/model/active', { method: 'POST', body: JSON.stringify({ id }) }),
    testConnection: (profile) =>
      request('/api/model/test', { method: 'POST', body: JSON.stringify(profile) }),
  },
  agent: {
    submitPrompt: (prompt, sessionId, executionProfileId) =>
      request('/api/agent/inquiries', {
        method: 'POST',
        body: JSON.stringify({ prompt, sessionId, executionProfileId }),
      }),
    listTools: () => request('/api/agent/tools'),
    cancel: (runId) => request(`/api/agent/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' }),
    onEvent: (callback) => {
      runtimeListeners.add(callback);
      ensureEventStream();
      return () => {
        runtimeListeners.delete(callback);
        releaseEventStream();
      };
    },
    onDelta: (callback) => {
      deltaListeners.add(callback);
      ensureEventStream();
      return () => {
        deltaListeners.delete(callback);
        releaseEventStream();
      };
    },
  },
  runtime: {
    listProfiles: () => request('/api/runtime/profiles'),
    getActiveProfile: () => request('/api/runtime/active'),
    saveProfile: (profile) =>
      request('/api/runtime/profiles', { method: 'POST', body: JSON.stringify(profile) }),
    deleteProfile: (id) => request(`/api/runtime/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    setActiveProfile: (id) => request('/api/runtime/active', { method: 'POST', body: JSON.stringify({ id }) }),
    detect: (executablePath) =>
      request('/api/runtime/detect', { method: 'POST', body: JSON.stringify({ executablePath }) }),
    respondApproval: (sessionId, approvalId, decision) =>
      request(`/api/runtime/approvals/${encodeURIComponent(approvalId)}`, {
        method: 'POST',
        body: JSON.stringify({ sessionId, decision }),
      }),
  },
  teams: {
    list: (includeArchived) =>
      request(`/api/teams${includeArchived ? '?includeArchived=1' : ''}`),
    listAgents: () => request('/api/teams/agents'),
    get: (id) => request(`/api/teams/${encodeURIComponent(id)}`),
    create: (team) => request('/api/teams', { method: 'POST', body: JSON.stringify(team) }),
    update: (team) =>
      request(`/api/teams/${encodeURIComponent(team.id)}`, { method: 'PUT', body: JSON.stringify(team) }),
    archive: (id) => request(`/api/teams/${encodeURIComponent(id)}/archive`, { method: 'POST' }),
    cloneTemplate: (templateId, overrides) =>
      request(`/api/teams/${encodeURIComponent(templateId)}/clone`, {
        method: 'POST',
        body: JSON.stringify(overrides || {}),
      }),
    run: {
      start: (teamId, inquiry, sessionId) =>
        request(`/api/teams/${encodeURIComponent(teamId)}/runs`, { method: 'POST', body: JSON.stringify({ inquiry, sessionId }) }),
      approvePlan: (runId) => request(`/api/team-runs/${encodeURIComponent(runId)}/approve-plan`, { method: 'POST' }),
      pause: (runId) => request(`/api/team-runs/${encodeURIComponent(runId)}/pause`, { method: 'POST' }),
      resume: (runId) => request(`/api/team-runs/${encodeURIComponent(runId)}/resume`, { method: 'POST' }),
      cancel: (runId) => request(`/api/team-runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' }),
      get: (runId) => request(`/api/team-runs/${encodeURIComponent(runId)}`),
      list: (teamId) => request(`/api/team-runs${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''}`),
    },
  },
  session: {
    list: () => request('/api/sessions'),
    get: (id) => request(`/api/sessions/${encodeURIComponent(id)}`),
    create: (title, agentId, profileId, modelName) =>
      request('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ title, agentId, profileId, modelName }),
      }),
    delete: (id) => request(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    rename: (id, title) =>
      request(`/api/sessions/${encodeURIComponent(id)}/rename`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),
    export: (id) => request(`/api/sessions/${encodeURIComponent(id)}/export`),
  },
};

// Electron preload owns this namespace in the native app. A regular browser gets
// the same contract through a loopback-only HTTP/SSE bridge.
if (!window.medscience) {
  window.medscience = webApi;
}
