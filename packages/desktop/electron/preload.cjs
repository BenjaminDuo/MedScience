const { contextBridge, ipcRenderer } = require('electron');

/**
 * Generic bridge, not a copy of the app API.
 *
 * This file used to enumerate every channel by hand, and because it is the
 * artifact Electron actually loads (main.ts points at preload.cjs; the
 * TypeScript preload was never bundled into the app), it silently drifted
 * from the rest of the codebase -- it dropped agent:submitPrompt's
 * workspaceId/researchProfileId/sessionType/language arguments and never
 * exposed runtime:discoverAll/bindTool/activeSessions/getUsage at all.
 *
 * Now it exposes only a transport. The typed API object is built once in
 * the renderer (src/runtime/apiClient.ts) on top of this, and the handlers
 * live once in @medscience/core's channel registry, so there is nothing
 * left here to drift.
 */
const ALLOWED_INVOKE_PREFIXES = ['model:', 'agent:', 'runtime:', 'team:', 'workspace:', 'session:', 'skill:', 'ledger:'];
const ALLOWED_EVENT_CHANNELS = ['agent:event', 'agent:delta'];

contextBridge.exposeInMainWorld('medscienceBridge', {
  invoke: (channel, ...args) => {
    if (typeof channel !== 'string' || !ALLOWED_INVOKE_PREFIXES.some((p) => channel.startsWith(p))) {
      return Promise.reject(new Error(`Blocked IPC channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, callback) => {
    if (!ALLOWED_EVENT_CHANNELS.includes(channel)) {
      throw new Error(`Blocked IPC event channel: ${channel}`);
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});
