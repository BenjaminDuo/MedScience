import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, FolderKanban } from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useWorkspaces, DEFAULT_WORKSPACE_ID } from '../../context/WorkspaceContext';
import { useLanguage } from '../../context/LanguageContext';

/**
 * The composer's workspace assignment picker (research-only, see the "新建
 * 对话默认不绑定工作区" design): a brand-new conversation defaults to 未分类
 * (DEFAULT_WORKSPACE_ID, see AgentContext.resetSession) regardless of
 * whichever workspace happens to be expanded in the sidebar tree. This is
 * the one place a user explicitly assigns it to a real workspace instead --
 * left untouched, it stays 未分类. Same lock-once-started rule as
 * SessionModeToggle/ResearchProfilePicker: renders nothing once the
 * conversation has any turns, and only for sessionType 'research' (chat
 * sessions aren't workspace-scoped).
 */
export const WorkspacePicker: React.FC = () => {
  const { currentSession, setSessionWorkspace } = useAgent();
  const { workspaces } = useWorkspaces();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (currentSession.messages.length > 0 || currentSession.sessionType !== 'research') return null;

  const activeId = currentSession.workspaceId || DEFAULT_WORKSPACE_ID;
  const active = workspaces.find((w) => w.id === activeId);
  const activeLabel = active?.title || t('Uncategorized', '未分类');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-bg-elevated border border-border-subtle text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
        title={t('Which workspace this conversation belongs to', '本次对话归属的工作区')}
      >
        <FolderKanban size={12} className="text-accent" />
        <span className="max-w-[120px] truncate">{activeLabel}</span>
        <ChevronDown size={11} className="text-text-muted" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-64 rounded-lg border border-border bg-bg-surface shadow-lg z-30 overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-text-muted border-b border-border-subtle">
            {t('Assign to Workspace', '归属工作区')}
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {workspaces.map((w) => {
              const isActive = w.id === activeId;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    setSessionWorkspace(w.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-hover transition-colors ${
                    isActive ? 'bg-accent-soft' : ''
                  }`}
                >
                  {isActive ? (
                    <Check size={13} className="text-accent shrink-0" />
                  ) : (
                    <span className="w-[13px] shrink-0" />
                  )}
                  <span className="truncate text-xs text-text-primary">{w.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
