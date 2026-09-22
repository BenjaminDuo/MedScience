import React, { useEffect, useRef, useState } from 'react';
import {
  FolderKanban,
  FolderOpen,
  ChevronRight,
  Plus,
  Check,
  MessageSquare,
  ShieldCheck,
  Files,
  Users,
  MoreHorizontal,
  FolderCog,
  FolderX,
  Pencil,
} from 'lucide-react';
import { useWorkspaces } from '../../context/WorkspaceContext';
import { useAgent } from '../../context/AgentContext';
import { useNav } from '../../context/NavContext';
import { useLanguage } from '../../context/LanguageContext';
import { NavSection } from '../../types/navigation';
import {
  isFileSystemAccessSupported,
  getBoundFolderInfo,
  pickAndBindFolder,
  unbindFolder,
} from '../../utils/localFolder';

interface SubItemConfig {
  id: NavSection;
  icon: React.ElementType;
  labelEn: string;
  labelZh: string;
}

// 科研小队 sits right after 对话 (per the user's explicit ordering request) --
// the team you're working with belongs next to the conversations you have
// with it, ahead of the more reference-like Evidence/Files entries.
const SUB_ITEMS: SubItemConfig[] = [
  { id: 'sessions', icon: MessageSquare, labelEn: 'Conversations', labelZh: '对话' },
  { id: 'teams', icon: Users, labelEn: 'Research Team', labelZh: '科研小队' },
  { id: 'evidence', icon: ShieldCheck, labelEn: 'Evidence Registry', labelZh: '证据库' },
  { id: 'files', icon: Files, labelEn: 'Output Files', labelZh: '产出文件' },
];

/**
 * The sidebar's project tree (手风琴式项目树): replaces the old
 * ProjectSwitcher dropdown. Every workspace is a row that expands
 * (accordion -- only one open at a time) to reveal exactly one entry per
 * scoped view (对话/科研小队/证据库/产出文件); there is deliberately no
 * per-conversation listing here (that stays in SessionsView, reached via
 * the 对话 entry), matching the "只放一个'对话'入口" choice. Clicking a
 * workspace row also makes it the active workspace, since the whole point
 * of the tree is that "open" and "scope everything else to this one" are
 * the same action.
 *
 * Each row also carries an optional local-folder binding (File System
 * Access API, see ../../utils/localFolder.ts) -- purely a web-mode
 * feature, so it quietly does nothing on a browser that lacks
 * `showDirectoryPicker`.
 */
export const WorkspaceTree: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, createWorkspace, renameWorkspace, deleteWorkspace } =
    useWorkspaces();
  const { sessions } = useAgent();
  const { activeSection, setActiveSection } = useNav();
  const { t } = useLanguage();

  const [expandedId, setExpandedId] = useState<string | undefined>(activeWorkspaceId);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [menuForId, setMenuForId] = useState<string | undefined>();
  const [renamingId, setRenamingId] = useState<string | undefined>();
  const [renameTitle, setRenameTitle] = useState('');
  const [folderNames, setFolderNames] = useState<Record<string, string | undefined>>({});
  const menuRef = useRef<HTMLDivElement>(null);

  // Keep the active workspace's row expanded when it changes elsewhere
  // (e.g. a sub-item click on a different, already-active workspace).
  useEffect(() => {
    setExpandedId((prev) => prev || activeWorkspaceId);
  }, [activeWorkspaceId]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuForId(undefined);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (!isFileSystemAccessSupported()) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        workspaces.map(async (w) => [w.id, (await getBoundFolderInfo(w.id))?.name] as const)
      );
      if (!cancelled) setFolderNames(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaces]);

  const sessionCount = (workspaceId: string) => sessions.filter((s) => (s.workspaceId || 'proj-1') === workspaceId).length;

  const handleToggle = (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    setExpandedId((prev) => (prev === workspaceId ? undefined : workspaceId));
  };

  const handleSubItemClick = (workspaceId: string, sectionId: NavSection) => {
    setActiveWorkspaceId(workspaceId);
    setActiveSection(sectionId);
  };

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    const created = await createWorkspace(title);
    setNewTitle('');
    setCreating(false);
    if (created) setExpandedId(created.id);
  };

  const handleBindFolder = async (workspaceId: string) => {
    setMenuForId(undefined);
    const bound = await pickAndBindFolder(workspaceId);
    if (bound) setFolderNames((prev) => ({ ...prev, [workspaceId]: bound.name }));
  };

  const handleUnbindFolder = async (workspaceId: string) => {
    setMenuForId(undefined);
    await unbindFolder(workspaceId);
    setFolderNames((prev) => ({ ...prev, [workspaceId]: undefined }));
  };

  const handleStartRename = (workspaceId: string, currentTitle: string) => {
    setMenuForId(undefined);
    setRenamingId(workspaceId);
    setRenameTitle(currentTitle);
  };

  const handleConfirmRename = async () => {
    if (renamingId && renameTitle.trim()) {
      await renameWorkspace(renamingId, renameTitle.trim());
    }
    setRenamingId(undefined);
    setRenameTitle('');
  };

  const handleDelete = async (workspaceId: string) => {
    setMenuForId(undefined);
    await deleteWorkspace(workspaceId);
  };

  if (collapsed) {
    const active = workspaces.find((w) => w.id === activeWorkspaceId);
    return (
      <div className="px-3 pt-2 pb-2 flex justify-center">
        <button
          type="button"
          onClick={() => setActiveSection('sessions')}
          className="p-2 rounded-lg border border-border hover:border-accent/40 bg-bg-elevated hover:bg-bg-hover text-accent transition-all"
          title={active?.title || t('Workspaces', '工作区')}
        >
          <FolderKanban size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 pt-2 pb-2 flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-0.5 pb-1.5 shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap">
          {t('Workspaces', '工作区')}
        </span>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="p-1 rounded text-text-muted hover:text-accent hover:bg-bg-hover transition-colors"
          title={t('New Workspace', '新建工作区')}
        >
          <Plus size={13} />
        </button>
      </div>

      {creating && (
        <div className="flex items-center gap-1.5 mb-2 shrink-0">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') {
                setCreating(false);
                setNewTitle('');
              }
            }}
            placeholder={t('Workspace name…', '工作区名称…')}
            className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-border bg-bg-elevated outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="px-2 py-1 rounded text-xs font-medium bg-accent text-white hover:brightness-110 shrink-0"
          >
            {t('Add', '创建')}
          </button>
        </div>
      )}

      {/* flex-1 + min-h-0 (not a fixed vh height): this box always fills
          whatever vertical space is left in the sidebar after the header,
          "New Conversation" button, Configuration group and account footer
          take theirs -- so it never changes size when workspaces
          expand/collapse (the sidebar no longer visibly "breathes"), and it
          never reserves more room than actually exists, which a fixed
          height (e.g. 38vh) could do on a shorter window and push the
          account footer below the visible area. Overflow (many workspaces,
          or an expanded one with its four sub-items) scrolls inside this
          box instead of growing it. */}
      <div className="space-y-0.5 flex-1 min-h-0 overflow-y-auto">
        {workspaces.map((w) => {
          const isExpanded = expandedId === w.id;
          const isActive = w.id === activeWorkspaceId;
          const folderName = folderNames[w.id];
          const isRenaming = renamingId === w.id;

          return (
            <div key={w.id}>
              <div
                className={`group relative w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  isActive ? 'bg-accent-soft' : 'hover:bg-bg-hover'
                }`}
                onClick={() => !isRenaming && handleToggle(w.id)}
              >
                <ChevronRight
                  size={12}
                  className={`text-text-muted shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                />
                {isActive ? (
                  <FolderOpen size={14} className="text-accent shrink-0" />
                ) : (
                  <FolderKanban size={14} className="text-text-muted shrink-0" />
                )}
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameTitle}
                    onChange={(e) => setRenameTitle(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmRename();
                      if (e.key === 'Escape') setRenamingId(undefined);
                    }}
                    onBlur={handleConfirmRename}
                    className="flex-1 min-w-0 px-1.5 py-0.5 text-[13px] rounded border border-accent bg-bg-elevated outline-none"
                  />
                ) : (
                  <span
                    className={`flex-1 min-w-0 truncate text-[13px] ${
                      isActive ? 'text-text-primary font-semibold' : 'text-text-secondary'
                    }`}
                    title={folderName ? t(`Bound to local folder: ${folderName}`, `已绑定本地文件夹：${folderName}`) : undefined}
                  >
                    {w.title}
                  </span>
                )}
                {!isRenaming && folderName && (
                  <FolderCog size={11} className="text-emerald-500 shrink-0" />
                )}
                {!isRenaming && (
                  <span className="text-[10px] font-mono text-text-muted shrink-0">{sessionCount(w.id)}</span>
                )}
                {!isRenaming && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuForId((prev) => (prev === w.id ? undefined : w.id));
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-muted hover:text-text-primary shrink-0 transition-opacity"
                  >
                    <MoreHorizontal size={13} />
                  </button>
                )}

                {menuForId === w.id && (
                  <div
                    ref={menuRef}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-full right-0 mt-1 w-52 rounded-lg border border-border bg-bg-surface shadow-lg z-40 overflow-hidden py-1"
                  >
                    <button
                      type="button"
                      onClick={() => handleStartRename(w.id, w.title)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                    >
                      <Pencil size={12} />
                      {t('Rename', '重命名')}
                    </button>
                    {isFileSystemAccessSupported() ? (
                      folderName ? (
                        <button
                          type="button"
                          onClick={() => handleUnbindFolder(w.id)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                        >
                          <FolderX size={12} />
                          {t('Unbind Local Folder', '解除文件夹绑定')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleBindFolder(w.id)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                        >
                          <FolderCog size={12} />
                          {t('Bind Local Folder…', '绑定本地文件夹…')}
                        </button>
                      )
                    ) : null}
                    {workspaces.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDelete(w.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-500/10"
                      >
                        <FolderX size={12} />
                        {t('Delete Workspace', '删除工作区')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isExpanded && (
                <div className="ml-[22px] pl-2 border-l border-border-subtle space-y-0.5 my-0.5">
                  {SUB_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isItemActive = isActive && activeSection === item.id;
                    const label = t(item.labelEn, item.labelZh);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSubItemClick(w.id, item.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12.5px] transition-colors ${
                          isItemActive
                            ? 'bg-accent/10 text-accent font-medium'
                            : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                        }`}
                      >
                        <Icon size={13} className={isItemActive ? 'text-accent' : 'text-text-muted'} />
                        <span className="truncate">{label}</span>
                        {isItemActive && <Check size={11} className="ml-auto text-accent shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
