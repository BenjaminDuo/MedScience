import { globalSessionManager } from '@medscience/core';

export function registerSessionIpcHandlers(ipcMain: any): void {
  ipcMain.handle('session:list', async () => {
    return globalSessionManager.listSessions();
  });

  ipcMain.handle('session:get', async (_event: any, id: string) => {
    return globalSessionManager.getSession(id);
  });

  ipcMain.handle(
    'session:create',
    async (
      _event: any,
      payload: {
        title: string;
        agentId?: any;
        profileId?: string;
        modelName?: string;
        workspaceId?: string;
        researchProfileId?: string;
      }
    ) => {
      return globalSessionManager.createSession(
        payload.title,
        payload.workspaceId || 'proj-1',
        payload.agentId || 'research',
        payload.profileId,
        payload.modelName,
        undefined,
        'research',
        payload.researchProfileId || 'general'
      );
    }
  );

  ipcMain.handle('session:delete', async (_event: any, id: string) => {
    return globalSessionManager.deleteSession(id);
  });

  ipcMain.handle('session:rename', async (_event: any, payload: { id: string; title: string }) => {
    return globalSessionManager.renameSession(payload.id, payload.title);
  });

  ipcMain.handle('session:export', async (_event: any, id: string) => {
    return globalSessionManager.exportSessionMarkdown(id);
  });
}
