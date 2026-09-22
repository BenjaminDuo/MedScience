import React, { useState } from 'react';
import {
  FolderKanban,
  Search,
  Trash2,
  Edit2,
  Check,
  X,
  FileDown,
  ArrowRight,
  Sparkles,
  Calendar,
  MessageSquare,
  Clock,
} from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useWorkspaces, DEFAULT_WORKSPACE_ID } from '../../context/WorkspaceContext';
import { useNav } from '../../context/NavContext';
import { useLanguage } from '../../context/LanguageContext';

export const SessionsView: React.FC = () => {
  const { sessions, openSession, renameSession, deleteSession, exportSession, resetSession } = useAgent();
  const { activeWorkspaceId, workspaces } = useWorkspaces();
  const { setActiveSection } = useNav();
  const { t } = useLanguage();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Scope the list to the active workspace -- sessions are workspace-owned,
  // so switching workspaces in the sidebar switches what shows up here.
  const projectSessions = sessions.filter(
    (s) => (s.workspaceId || DEFAULT_WORKSPACE_ID) === activeWorkspaceId
  );

  const filteredSessions = projectSessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeProjectTitle = workspaces.find((p) => p.id === activeWorkspaceId)?.title;

  const handleStartRename = (id: string, currentTitle: string) => {
    setEditingSessionId(id);
    setEditingTitle(currentTitle);
  };

  const handleSaveRename = async (id: string) => {
    if (editingTitle.trim()) {
      await renameSession(id, editingTitle.trim());
    }
    setEditingSessionId(null);
  };

  const handleCancelRename = () => {
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const handleDelete = async (id: string) => {
    await deleteSession(id);
    setConfirmDeleteId(null);
  };

  const handleExport = async (id: string) => {
    const md = await exportSession(id);
    // Create download blob
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MedScience_Report_${id}.md`;
    a.click();
    URL.revokeObjectURL(url);

    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleStartNew = () => {
    // Unlike the sidebar's own "New Conversation" button (deliberately
    // workspace-agnostic, see AgentContext.resetSession's doc comment), this
    // button is reached from inside a specific workspace's 对话 view, so the
    // new conversation should bind to that workspace automatically rather
    // than landing in 未分类 and making the user assign it by hand.
    resetSession('research', activeWorkspaceId);
    setActiveSection('home');
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 sm:p-10 max-w-[1100px] mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div className="text-left">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent/10 text-accent">
              <FolderKanban size={22} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-text-primary">{t('Research Sessions', '研究会话')}</h2>
              <p className="text-sm text-text-secondary mt-0.5">
                {activeProjectTitle
                  ? t(`In workspace "${activeProjectTitle}".`, `属于工作区「${activeProjectTitle}」。`)
                  : t('Local, persistent investigation records and verified scientific findings.', '本地持久化的研究记录与已验证的科研发现。')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleStartNew}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Sparkles size={14} />
            <span>{t('New Conversation', '新建对话')}</span>
          </button>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex items-center justify-between gap-4 my-6">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder={t('Filter sessions by title or ID...', '按标题或 ID 筛选会话…')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-bg-surface border border-border focus:border-accent focus:ring-1 focus:ring-accent text-xs text-text-primary placeholder:text-text-muted transition-all"
          />
        </div>

        <span className="text-xs font-mono text-text-muted">
          {t(`${filteredSessions.length} ${filteredSessions.length === 1 ? 'session' : 'sessions'} stored`, `已保存 ${filteredSessions.length} 个会话`)}
        </span>
      </div>

      {/* Sessions List */}
      {filteredSessions.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-bg-surface border border-border border-dashed space-y-4 my-8">
          <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto">
            <FolderKanban size={24} />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base font-semibold text-text-primary">
              {searchQuery ? t('No matching research sessions', '未找到匹配的研究会话') : t('No research sessions recorded yet', '暂无历史研究会话')}
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              {searchQuery
                ? t(`No sessions matched "${searchQuery}". Try a different keyword.`, `未找到匹配 "${searchQuery}" 的会话，换个关键词试试。`)
                : t('All your scientific investigations, tool executions, and generated manuscripts will be saved here.', '你所有的科研探索、工具执行记录与生成的报告都会保存在这里。')}
            </p>
          </div>
          {!searchQuery && (
            <button
              onClick={handleStartNew}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors shadow-sm"
            >
              <Sparkles size={14} />
              <span>{t('Launch First Research Inquiry', '发起第一个研究问题')}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map((session) => {
            const isEditing = editingSessionId === session.id;
            const isConfirmingDelete = confirmDeleteId === session.id;
            const messageCount = session.messages?.length || 0;
            const agentTurns = session.messages?.filter((m) => m.role === 'agent').length || 0;

            return (
              <div
                key={session.id}
                className="group p-4 rounded-xl bg-bg-surface border border-border hover:border-accent/40 transition-all shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 text-left space-y-1.5">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        autoFocus
                        className="flex-1 px-2.5 py-1 text-sm font-semibold rounded-lg bg-bg-elevated border border-accent text-text-primary focus:outline-none"
                      />
                      <button
                        onClick={() => handleSaveRename(session.id)}
                        className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                        title={t('Save title', '保存标题')}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={handleCancelRename}
                        className="p-1.5 rounded-md bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                        title={t('Cancel', '取消')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3
                        onClick={() => {
                          openSession(session.id);
                          setActiveSection('home');
                        }}
                        className="text-[14.5px] font-semibold text-text-primary hover:text-accent cursor-pointer transition-colors truncate"
                      >
                        {session.title}
                      </h3>
                      <button
                        onClick={() => handleStartRename(session.id, session.title)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-all"
                        title={t('Rename title', '重命名')}
                      >
                        <Edit2 size={13} />
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-text-muted">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock size={12} />
                      <span>{new Date(session.updatedAt || session.createdAt).toLocaleDateString()} {new Date(session.updatedAt || session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <MessageSquare size={12} />
                      <span>{t(`${agentTurns} ${agentTurns === 1 ? 'synthesis turn' : 'synthesis turns'}`, `${agentTurns} 次综合回复`)}</span>
                    </span>
                    <span>•</span>
                    <span className="font-mono text-[11px] text-accent/90 bg-accent/5 px-1.5 py-0.5 rounded border border-accent/10">
                      {session.id}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  {isConfirmingDelete ? (
                    <div className="flex items-center gap-2 p-1 rounded-lg bg-rose-500/10 border border-rose-500/30">
                      <span className="text-xs text-rose-500 font-medium px-2">{t('Confirm delete?', '确认删除？')}</span>
                      <button
                        onClick={() => handleDelete(session.id)}
                        className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors"
                      >
                        {t('Delete', '删除')}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="p-1 rounded text-text-muted hover:text-text-primary"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleExport(session.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border hover:border-accent/40 bg-bg-elevated hover:bg-bg-hover text-text-secondary hover:text-text-primary text-xs font-medium transition-all"
                        title={t('Export Markdown Report', '导出 Markdown 报告')}
                      >
                        <FileDown size={13} />
                        <span>{copiedId === session.id ? t('Exported!', '已导出！') : t('Export', '导出')}</span>
                      </button>

                      <button
                        onClick={() => setConfirmDeleteId(session.id)}
                        className="p-1.5 rounded-lg border border-border hover:border-rose-500/40 bg-bg-elevated hover:bg-rose-500/10 text-text-muted hover:text-rose-500 transition-colors"
                        title={t('Delete Session', '删除会话')}
                      >
                        <Trash2 size={14} />
                      </button>

                      <button
                        onClick={() => {
                          openSession(session.id);
                          setActiveSection('home');
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors"
                      >
                        <span>{t('Open', '打开')}</span>
                        <ArrowRight size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
