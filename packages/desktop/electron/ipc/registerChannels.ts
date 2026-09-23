import { createApiChannels, globalEventBus, RuntimeEvent } from '@medscience/core';

/**
 * Registers every app API channel with Electron's ipcMain, plus the one-way
 * event push to the renderer.
 *
 * There is deliberately no per-namespace handler file any more (modelIpc.ts,
 * agentIpc.ts, runtimeIpc.ts, sessionIpc.ts, workspaceIpc.ts, teamIpc.ts):
 * the handlers themselves live in @medscience/core's channel registry, which
 * the local web server registers too, so a channel can no longer exist in
 * one host and be missing (or take different arguments) in the other.
 */
export function registerApiChannels(ipcMain: any, getMainWindow: () => any): void {
  const send = (channel: string, payload: unknown): void => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  // Every core runtime event (both backends emit onto this shared bus,
  // including team.* events and local-runtime approval requests) is
  // forwarded to the renderer over one channel.
  globalEventBus.onAll((event: RuntimeEvent) => send('agent:event', event));

  const channels = createApiChannels({ onDelta: (delta) => send('agent:delta', delta) });

  for (const [name, handler] of Object.entries(channels)) {
    ipcMain.handle(name, (_event: any, ...args: any[]) => (handler as (...a: any[]) => any)(...args));
  }
}
