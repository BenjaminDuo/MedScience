import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Workspace } from '@medscience/core';

// Real workspace store, backed by WorkspaceManager on the backend (window.medscience.workspace.*)
// -- this file used to hold a parallel, purely client-side "ResearchProject"
// concept (localStorage only: title/description/tags/status/evidenceCount/
// hypothesesCount) that had zero connection to RuntimeSession.workspaceId or
// the real sessions list, and was never rendered by any component. That
// shell is gone; this now talks to the real backing store added in
// WorkspaceManager (see @medscience/core), and RuntimeSession.workspaceId is
// what actually groups conversations, evidence, and files under a workspace.

const LOCAL_STORAGE_ACTIVE_PROJECT_KEY = 'medscience_desktop_active_project_v1';
export const DEFAULT_WORKSPACE_ID = 'proj-1';

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  setActiveWorkspaceId: (id: string) => void;
  createWorkspace: (title: string, description?: string) => Promise<Workspace | undefined>;
  renameWorkspace: (id: string, title: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  getWorkspace: (id: string) => Workspace | undefined;
  refreshProjects: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workspaces, setProjects] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveProjectIdState] = useState<string>(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_ACTIVE_PROJECT_KEY) || DEFAULT_WORKSPACE_ID;
    } catch {
      return DEFAULT_WORKSPACE_ID;
    }
  });

  const refreshProjects = useCallback(async () => {
    if (!window.medscience?.workspace) return;
    try {
      const list = await window.medscience.workspace.list();
      setProjects(list || []);
    } catch (err) {
      console.error('[MedScience] workspace.list() failed:', err);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const setActiveWorkspaceId = (id: string) => {
    setActiveProjectIdState(id);
    try {
      localStorage.setItem(LOCAL_STORAGE_ACTIVE_PROJECT_KEY, id);
    } catch {}
  };

  const createWorkspace = async (title: string, description?: string): Promise<Workspace | undefined> => {
    if (!window.medscience?.workspace) return undefined;
    try {
      const workspace = await window.medscience.workspace.create(title, description);
      setProjects((prev) => [workspace, ...prev]);
      setActiveWorkspaceId(workspace.id);
      return workspace;
    } catch (err) {
      console.error('[MedScience] workspace.create() failed:', err);
      return undefined;
    }
  };

  const renameWorkspace = async (id: string, title: string) => {
    if (!window.medscience?.workspace) return;
    try {
      await window.medscience.workspace.rename(id, title);
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, title, updatedAt: new Date().toISOString() } : p)));
    } catch (err) {
      console.error('[MedScience] workspace.rename() failed:', err);
    }
  };

  const deleteWorkspace = async (id: string) => {
    if (!window.medscience?.workspace) return;
    try {
      const ok = await window.medscience.workspace.delete(id);
      if (ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
        if (activeWorkspaceId === id) setActiveWorkspaceId(DEFAULT_WORKSPACE_ID);
      }
    } catch (err) {
      console.error('[MedScience] workspace.delete() failed:', err);
    }
  };

  const getWorkspace = (id: string) => workspaces.find((p) => p.id === id);

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspaceId,
        setActiveWorkspaceId,
        createWorkspace,
        renameWorkspace,
        deleteWorkspace,
        getWorkspace,
        refreshProjects,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspaces = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspaces must be used within a WorkspaceProvider');
  }
  return context;
};
