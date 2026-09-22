import React, { useState, useEffect } from 'react';
import {
  Files,
  FileText,
  Image as ImageIcon,
  Table,
  Code,
  Download,
  Search,
  Sparkles,
  Eye,
} from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useWorkspaces, DEFAULT_WORKSPACE_ID } from '../../context/WorkspaceContext';
import { useNav } from '../../context/NavContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  isFileSystemAccessSupported,
  isFolderWriteReady,
  writeFileToFolder,
  writeFileToFolderWithPrompt,
} from '../../utils/localFolder';
import { FolderCog } from 'lucide-react';

interface OutputFileItem {
  id: string;
  name: string;
  type: 'figure' | 'dataset' | 'manuscript' | 'code';
  size: string;
  sessionTitle: string;
  description: string;
  downloadData?: string;
}

export const OutputFilesView: React.FC = () => {
  const { currentSession, sessions, resetSession } = useAgent();
  const { activeWorkspaceId, workspaces } = useWorkspaces();
  const { setActiveSection } = useNav();
  const { t } = useLanguage();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [previewContent, setPreviewContent] = useState<{ title: string; content: string } | null>(null);
  const [folderReady, setFolderReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const autoSavedRef = React.useRef<Set<string>>(new Set());

  // Aggregate artifacts across all sessions
  const allFiles: OutputFileItem[] = [];

  // Scope to the active workspace -- evidence/files are workspace-owned,
  // so switching workspaces in the sidebar switches what shows up here.
  const projectSessions = sessions.filter(
    (s) => (s.workspaceId || DEFAULT_WORKSPACE_ID) === activeWorkspaceId
  );
  const sourceSessions =
    (currentSession.workspaceId || DEFAULT_WORKSPACE_ID) === activeWorkspaceId
      ? [currentSession, ...projectSessions.filter((s) => s.id !== currentSession.id)]
      : projectSessions;
  const activeWorkspaceTitle = workspaces.find((p) => p.id === activeWorkspaceId)?.title;

  sourceSessions.forEach((sess) => {
    sess.messages?.forEach((msg) => {
      msg.artifacts?.forEach((art) => {
        let type: OutputFileItem['type'] = 'manuscript';
        if (art.type === 'figure' || art.title.endsWith('.png') || art.title.endsWith('.svg')) type = 'figure';
        else if (art.type === 'dataset' || art.type === 'table' || art.title.endsWith('.csv')) type = 'dataset';
        else if (art.type === 'code' || art.title.endsWith('.py') || art.title.endsWith('.r')) type = 'code';

        allFiles.push({
          id: art.id,
          name: art.title,
          type,
          size: art.type === 'figure' ? '2.4 MB' : '48 KB',
          sessionTitle: sess.title,
          description: art.description,
          downloadData: art.description,
        });
      });
    });
  });

  // Folder-binding readiness: re-checked whenever the active workspace
  // changes (switching workspaces switches which bound folder, if any,
  // writes go to).
  useEffect(() => {
    if (!isFileSystemAccessSupported()) {
      setFolderReady(false);
      return;
    }
    let cancelled = false;
    isFolderWriteReady(activeWorkspaceId).then((ready) => {
      if (!cancelled) setFolderReady(ready);
    });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  const allFileIds = allFiles.map((f) => f.id).join(',');

  // Best-effort auto-save: once a bound folder already has write permission
  // granted (no prompt needed), newly-seen artifacts are written straight
  // to disk as they show up, same idea as "生成的图/报告落盘到这个文件夹".
  // Never prompts -- a folder that still needs re-authorization after a
  // reload is only written to via the manual "Save to Folder" button below,
  // which runs from a real click and so is allowed to prompt.
  useEffect(() => {
    if (!folderReady) return;
    const toSave = allFiles.filter((f) => !autoSavedRef.current.has(f.id));
    if (toSave.length === 0) return;
    toSave.forEach((f) => autoSavedRef.current.add(f.id));
    (async () => {
      for (const f of toSave) {
        const result = await writeFileToFolder(activeWorkspaceId, f.name, f.downloadData || f.description);
        setSaveStatus((prev) => ({ ...prev, [f.id]: result.ok ? 'saved' : 'error' }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFileIds, folderReady, activeWorkspaceId]);

  const handleSaveToFolder = async (file: OutputFileItem) => {
    setSaveStatus((prev) => ({ ...prev, [file.id]: 'saving' }));
    const result = await writeFileToFolderWithPrompt(activeWorkspaceId, file.name, file.downloadData || file.description);
    setSaveStatus((prev) => ({ ...prev, [file.id]: result.ok ? 'saved' : 'error' }));
  };

  const filteredFiles = allFiles.filter((file) => {
    const matchesType = selectedType === 'All' || file.type === selectedType;
    const matchesSearch =
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.sessionTitle.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const getFileIcon = (type: OutputFileItem['type']) => {
    switch (type) {
      case 'figure':
        return ImageIcon;
      case 'dataset':
        return Table;
      case 'code':
        return Code;
      default:
        return FileText;
    }
  };

  const handleDownload = (file: OutputFileItem) => {
    const blob = new Blob([file.downloadData || file.description], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStartNew = () => {
    resetSession();
    setActiveSection('home');
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 sm:p-10 max-w-[1100px] mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div className="text-left">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent/10 text-accent">
              <Files size={22} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-text-primary">{t('Output Files & Artifacts', '产出文件与产出物')}</h2>
              <p className="text-sm text-text-secondary mt-0.5">
                {activeWorkspaceTitle
                  ? t(`In workspace "${activeWorkspaceTitle}".`, `属于工作区「${activeWorkspaceTitle}」。`)
                  : t('Generated figures, scientific datasets, reproducible scripts, and manuscript drafts.', '生成的图表、科研数据集、可复现脚本与稿件草稿。')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isFileSystemAccessSupported() && (
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-lg border ${
                folderReady
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                  : 'bg-bg-surface border-border text-text-muted'
              }`}
              title={t(
                'Bind a local folder for this workspace from the sidebar to save output files there automatically.',
                '在侧边栏为此工作区绑定本地文件夹，即可自动将产出文件保存到该文件夹。'
              )}
            >
              <FolderCog size={12} />
              {folderReady ? t('Local folder linked', '已链接本地文件夹') : t('No local folder', '未绑定本地文件夹')}
            </span>
          )}
          <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-bg-surface border border-border text-accent">
            {filteredFiles.length} {t(filteredFiles.length === 1 ? 'Artifact' : 'Artifacts', '项产出物')}
          </span>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 my-6">
        <div className="flex items-center gap-1.5">
          {['All', 'figure', 'dataset', 'code', 'manuscript'].map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedType(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                selectedType === tab
                  ? 'bg-accent text-white shadow-xs font-semibold'
                  : 'bg-bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              {tab === 'All' ? t('All Files', '全部文件') : tab}
            </button>
          ))}
        </div>

        <div className="relative max-w-xs w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder={t('Search file name or topic...', '搜索文件名或主题...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-bg-surface border border-border focus:border-accent text-xs text-text-primary placeholder:text-text-muted"
          />
        </div>
      </div>

      {/* Files List */}
      {filteredFiles.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-bg-surface border border-border border-dashed space-y-4 my-8">
          <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto">
            <Files size={24} />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base font-semibold text-text-primary">
              {searchQuery ? t('No matching artifacts found', '未找到匹配的产出物') : t('No output files generated yet', '尚未生成产出文件')}
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              {searchQuery
                ? t(`No files matched "${searchQuery}". Try a different search term.`, `未找到匹配 "${searchQuery}" 的文件。请尝试其他搜索词。`)
                : t('Files generated during your research sessions (such as volcano plots, DESeq2 matrices, and manuscript drafts) will appear here for one-click download.', '您研究会话中生成的文件（如火山图、DESeq2 矩阵和稿件草稿）将显示在此处，可一键下载。')}
            </p>
          </div>
          {!searchQuery && (
            <button
              onClick={handleStartNew}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors shadow-sm"
            >
              <Sparkles size={14} />
              <span>{t('Generate Research Files', '生成科研文件')}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFiles.map((file) => {
            const Icon = getFileIcon(file.type);
            return (
              <div
                key={file.id}
                className="flex flex-col justify-between p-4 rounded-xl bg-bg-surface border border-border hover:border-accent/40 transition-all shadow-xs group"
              >
                <div className="space-y-2 text-left">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                      <Icon size={12} />
                      <span className="capitalize">{file.type}</span>
                    </span>
                    <span className="text-[11px] font-mono text-text-muted">{file.size}</span>
                  </div>

                  <h4 className="text-[14px] font-semibold text-text-primary group-hover:text-accent transition-colors truncate">
                    {file.name}
                  </h4>

                  <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                    {file.description}
                  </p>

                  <p className="text-[11px] text-text-muted truncate pt-1">
                    {t('From: ', '来自：')}{file.sessionTitle}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between gap-2">
                  <button
                    onClick={() => setPreviewContent({ title: file.name, content: file.description })}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border hover:border-accent/40 bg-bg-elevated hover:bg-bg-hover text-text-secondary hover:text-text-primary text-xs font-medium transition-all"
                  >
                    <Eye size={13} />
                    <span>{t('Preview', '预览')}</span>
                  </button>

                  <button
                    onClick={() => handleDownload(file)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors"
                  >
                    <Download size={13} />
                    <span>{t('Download', '下载')}</span>
                  </button>

                  {isFileSystemAccessSupported() && (
                    <button
                      onClick={() => handleSaveToFolder(file)}
                      disabled={saveStatus[file.id] === 'saving'}
                      title={t('Save a copy into this workspace\'s bound local folder', '将副本保存到此工作区绑定的本地文件夹')}
                      className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all shrink-0 ${
                        saveStatus[file.id] === 'saved'
                          ? 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10'
                          : saveStatus[file.id] === 'error'
                          ? 'border-red-500/40 text-red-500 bg-red-500/10'
                          : 'border-border hover:border-accent/40 bg-bg-elevated hover:bg-bg-hover text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      <FolderCog size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Simple Modal Preview */}
      {previewContent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 z-50">
          <div className="bg-bg-surface border border-border rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl text-left">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-text-primary">{previewContent.title}</h3>
              <button
                onClick={() => setPreviewContent(null)}
                className="p-1 rounded-md text-text-muted hover:text-text-primary"
              >
                ✕
              </button>
            </div>
            <div className="p-4 rounded-xl bg-bg-elevated font-mono text-xs text-text-primary whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
              {previewContent.content}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setPreviewContent(null)}
                className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors"
              >
                {t('Close', '关闭')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
