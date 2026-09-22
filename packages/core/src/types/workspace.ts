/**
 * A research workspace: the grouping unit above a conversation (RuntimeSession).
 * A workspace can hold many conversations (chat, research, or team-run
 * sessions -- see RuntimeSession.sessionType/workspaceId), and its Evidence
 * Registry / Workspace Files views are meant to be filtered to the
 * sessions that share its id, rather than flattening every session that
 * has ever existed into one undifferentiated list.
 *
 * Every RuntimeSession has always carried a `workspaceId` field, but until
 * now nothing ever gave that id a real backing record -- every caller
 * hardcoded the literal 'proj-1' and there was no Workspace entity at all.
 * WorkspaceManager (see ../core/WorkspaceManager.ts) is that backing store; it
 * self-creates a 'proj-1' record titled "Uncategorized" on first run so
 * every session created before this existed resolves to a real workspace
 * instead of a dangling id.
 */
export interface Workspace {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}
