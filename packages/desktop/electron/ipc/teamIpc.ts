import { globalTeamProfileManager, globalTeamAgentRegistry, globalTeamOrchestrator, ResearchTeamDefinition } from '@medscience/core';

/**
 * IPC surface for Research Teams: registry/CRUD channels (team:*, unchanged
 * since Phase 1) plus team:run:* channels added in Phase 2, which drive the
 * real API-backed TeamOrchestrator. Mirrors the shape of runtimeIpc.ts.
 */
export function registerTeamIpcHandlers(ipcMain: any): void {
  ipcMain.handle('team:list', async (_event: any, includeArchived?: boolean) => {
    return globalTeamProfileManager.listAll(Boolean(includeArchived));
  });

  ipcMain.handle('team:listAgents', async () => {
    return globalTeamAgentRegistry.list();
  });

  ipcMain.handle('team:get', async (_event: any, id: string) => {
    return globalTeamProfileManager.getTeam(id);
  });

  ipcMain.handle('team:create', async (_event: any, team: ResearchTeamDefinition) => {
    // Force a fresh id so "create" can never silently overwrite an existing team.
    return globalTeamProfileManager.saveTeam({ ...team, id: undefined as any });
  });

  ipcMain.handle('team:update', async (_event: any, team: ResearchTeamDefinition) => {
    if (!team.id) return { success: false, errors: ['team:update requires an existing team id.'] };
    return globalTeamProfileManager.saveTeam(team);
  });

  ipcMain.handle('team:archive', async (_event: any, id: string) => {
    return globalTeamProfileManager.archiveTeam(id);
  });

  ipcMain.handle('team:cloneTemplate', async (_event: any, templateId: string, overrides?: { name?: string; description?: string }) => {
    return globalTeamProfileManager.cloneTemplate(templateId, overrides);
  });

  ipcMain.handle(
    'team:run:start',
    async (_event: any, teamId: string, inquiry: string, sessionId?: string, workspaceId?: string, researchProfileId?: string) => {
      return globalTeamOrchestrator.startRun(teamId, inquiry, sessionId, workspaceId, researchProfileId);
    }
  );

  ipcMain.handle('team:run:approvePlan', async (_event: any, runId: string) => {
    return globalTeamOrchestrator.approvePlan(runId);
  });

  ipcMain.handle('team:run:pause', async (_event: any, runId: string) => {
    return globalTeamOrchestrator.pauseRun(runId);
  });

  ipcMain.handle('team:run:resume', async (_event: any, runId: string) => {
    return globalTeamOrchestrator.resumeRun(runId);
  });

  ipcMain.handle('team:run:cancel', async (_event: any, runId: string) => {
    return globalTeamOrchestrator.cancelRun(runId);
  });

  ipcMain.handle('team:run:get', async (_event: any, runId: string) => {
    return globalTeamOrchestrator.getRun(runId);
  });

  ipcMain.handle('team:run:list', async (_event: any, teamId?: string, workspaceId?: string) => {
    return globalTeamOrchestrator.listRuns(teamId, workspaceId);
  });
}
