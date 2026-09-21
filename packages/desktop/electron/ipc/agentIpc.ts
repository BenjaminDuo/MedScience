import {
  globalExecutionRouter,
  globalEventBus,
  globalToolRegistry,
  RuntimeEvent,
} from '@medscience/core';

export function registerAgentIpcHandlers(ipcMain: any, getMainWindow: () => any): void {
  // Listen to all core runtime events and forward them via IPC to renderer.
  // This single broadcast channel covers BOTH backends: ExecutionRouter
  // dispatches to whichever backend (API or local Codex) the active
  // ExecutionProfile selects, and both backends emit onto this same shared
  // globalEventBus -- including local-runtime-only events like
  // runtime.turn.started/completed and runtime.approval.requested, which
  // the renderer picks up the same way it already picks up tool.started /
  // agent.message.delta / etc. No separate approval-specific IPC push is
  // needed; runtime:respondApproval (runtimeIpc.ts) is the only new channel
  // required, for answering back.
  globalEventBus.onAll((event: RuntimeEvent) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('agent:event', event);
    }
  });

  ipcMain.handle(
    'agent:submitPrompt',
    async (_event: any, payload: { prompt: string; sessionId?: string; executionProfileId?: string }) => {
      const win = getMainWindow();
      // Routes through ExecutionRouter rather than calling the API research
      // engine directly, so the active ExecutionProfile (API vs local Codex,
      // set in Settings) actually decides which backend runs this turn --
      // unless the caller picked a specific profile for this one submission
      // (the prompt bar's permission/runtime selector), in which case that
      // wins for this request only, without touching the global default.
      const result = await globalExecutionRouter.execute(
        { prompt: payload.prompt, sessionId: payload.sessionId, executionProfileId: payload.executionProfileId },
        {
          onDelta: (delta: string) => {
            if (win && !win.isDestroyed()) {
              win.webContents.send('agent:delta', delta);
            }
          },
        }
      );
      return result;
    }
  );

  // Lightweight, serializable tool catalog for the prompt bar's "prioritize
  // these databases/tools" picker -- strips each ToolDefinition's execute()
  // function (not cloneable over IPC) down to what the UI actually needs.
  ipcMain.handle('agent:listTools', async () => {
    return globalToolRegistry.list().map((t) => ({ name: t.name, description: t.description, category: t.category }));
  });
}
