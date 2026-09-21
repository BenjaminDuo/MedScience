import {
  globalExecutionProfileManager,
  globalExecutionRouter,
  globalRuntimeDetector,
  ExecutionProfile,
  RuntimeApprovalDecision,
} from '@medscience/core';

/**
 * IPC surface for the API-vs-local-Codex execution system (see
 * agentIpc.ts, which now routes agent:submitPrompt through
 * globalExecutionRouter instead of calling the API research engine
 * directly). Mirrors the shape of modelIpc.ts/sessionIpc.ts.
 *
 * Detection (runtime:detect) can take a couple of seconds (spawns `codex
 * --version` and `codex app-server --help`), so it is its own handler
 * rather than folded into getActiveProfile -- the renderer calls it
 * explicitly (initial Settings load, and an explicit "Re-detect" button).
 */
export function registerRuntimeIpcHandlers(ipcMain: any): void {
  ipcMain.handle('runtime:listProfiles', async () => {
    return globalExecutionProfileManager.listProfiles();
  });

  ipcMain.handle('runtime:getActiveProfile', async () => {
    return globalExecutionProfileManager.getActiveProfile();
  });

  ipcMain.handle('runtime:saveProfile', async (_event: any, profile: ExecutionProfile) => {
    return globalExecutionProfileManager.saveProfile(profile);
  });

  ipcMain.handle('runtime:deleteProfile', async (_event: any, id: string) => {
    return globalExecutionProfileManager.deleteProfile(id);
  });

  ipcMain.handle('runtime:setActiveProfile', async (_event: any, id: string) => {
    return globalExecutionProfileManager.setActiveProfile(id);
  });

  ipcMain.handle('runtime:detect', async (_event: any, executablePath?: string) => {
    return globalRuntimeDetector.probe(executablePath);
  });

  ipcMain.handle(
    'runtime:respondApproval',
    async (_event: any, payload: { sessionId: string; approvalId: string; decision: RuntimeApprovalDecision }) => {
      return globalExecutionRouter.respondApproval(payload.sessionId, payload.approvalId, payload.decision);
    }
  );

  ipcMain.handle('agent:cancel', async (_event: any, runId: string) => {
    return globalExecutionRouter.cancel(runId);
  });
}
