import { globalWorkspaceManager } from '@medscience/core';

export function registerWorkspaceIpcHandlers(ipcMain: any): void {
  ipcMain.handle('workspace:list', async () => {
    return globalWorkspaceManager.listWorkspaces();
  });

  ipcMain.handle('workspace:create', async (_event: any, payload: { title: string; description?: string }) => {
    return globalWorkspaceManager.createWorkspace(payload.title, undefined, payload.description);
  });

  ipcMain.handle('workspace:rename', async (_event: any, payload: { id: string; title: string }) => {
    return globalWorkspaceManager.renameWorkspace(payload.id, payload.title);
  });

  ipcMain.handle('workspace:delete', async (_event: any, id: string) => {
    return globalWorkspaceManager.deleteWorkspace(id);
  });
}
