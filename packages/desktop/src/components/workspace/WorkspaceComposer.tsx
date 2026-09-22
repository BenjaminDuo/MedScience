import React, { useState, useRef } from 'react';
import { ArrowRight, Paperclip, Square } from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';
import { ExecutionProfilePicker } from '../common/ExecutionProfilePicker';
import { ToolsPicker } from '../common/ToolsPicker';
import { AttachmentChips } from '../common/AttachmentChips';
import { readAttachedFiles, buildAttachmentContext, type AttachedFile } from '../../lib/attachFiles';

export const WorkspaceComposer: React.FC = () => {
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { submitPrompt, status, cancelActiveRun } = useAgent();
  const { t } = useLanguage();

  // Kept in sync with AgentInput.tsx's isBusy -- see its comment for why
  // 'waiting_for_permission' is excluded.
  const isBusy = status === 'thinking' || status === 'planning' || status === 'tool_calling' || status === 'executing' || status === 'generating';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFilesPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const read = await readAttachedFiles(files);
    setAttachedFiles((prev) => [...prev, ...read.filter((f) => !prev.some((p) => p.name === f.name))]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = () => {
    if ((!input.trim() && attachedFiles.length === 0) || isBusy) return;
    const attachmentContext = buildAttachmentContext(attachedFiles);
    const toolHint =
      selectedTools.length > 0
        ? `(${t('Please prioritize using', '请优先使用')}: ${selectedTools.join(', ')})\n\n`
        : '';
    submitPrompt(`${attachmentContext}${toolHint}${input.trim()}`);
    setInput('');
    setAttachedFiles([]);
  };

  return (
    <div className="border-t border-border bg-bg-surface p-4">
      <div className="max-w-[840px] mx-auto">
        <div className="relative rounded-xl bg-bg-elevated border border-border focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft transition-all p-2.5">
          <AttachmentChips files={attachedFiles} onRemove={(name) => setAttachedFiles((prev) => prev.filter((f) => f.name !== name))} />

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('Ask a follow-up question, request tool rerun, or refine artifacts...', '提出后续问题、重新运行工具，或完善产物…')}
            rows={2}
            disabled={isBusy}
            className="w-full bg-transparent resize-none border-none outline-none text-[13.5px] placeholder:text-text-muted text-text-primary leading-relaxed"
          />

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFilesPicked(e.target.files)}
          />

          <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs select-none">
            <div className="flex items-center gap-2 text-text-muted">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1 rounded hover:bg-bg-hover hover:text-text-secondary transition-colors"
                title={t('Attach file / PDB / CSV', '附加文件 / PDB / CSV')}
              >
                <Paperclip size={14} />
              </button>
              <ToolsPicker selected={selectedTools} onChange={setSelectedTools} />
              <ExecutionProfilePicker />
              <span className="text-[11px] font-mono opacity-60">{t('⌘K for commands', '⌘K 打开命令面板')}</span>
            </div>

            <div className="flex items-center gap-2">
              {isBusy ? (
                <button
                  onClick={() => cancelActiveRun()}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 text-xs font-medium flex items-center gap-1.5 transition-all"
                >
                  <Square size={12} fill="currentColor" />
                  <span>{t('Stop', '停止')}</span>
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim() && attachedFiles.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-accent hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <span>{t('Send', '发送')}</span>
                  <ArrowRight size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
