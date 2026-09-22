import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, Paperclip, Square } from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';
import { ExecutionProfilePicker } from '../common/ExecutionProfilePicker';
import { SessionModeToggle } from '../common/SessionModeToggle';
import { ResearchProfilePicker } from '../common/ResearchProfilePicker';
import { WorkspacePicker } from '../common/WorkspacePicker';
import { ToolsPicker } from '../common/ToolsPicker';
import { AttachmentChips } from '../common/AttachmentChips';
import { readAttachedFiles, buildAttachmentContext, type AttachedFile } from '../../lib/attachFiles';

interface AgentInputProps {
  className?: string;
  autoFocus?: boolean;
}

export const AgentInput: React.FC<AgentInputProps> = ({ className = '', autoFocus = false }) => {
  const [prompt, setPrompt] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { submitPrompt, status, cancelActiveRun } = useAgent();
  const { t } = useLanguage();

  // Anything the agent is actively working through -- 'waiting_for_permission'
  // is deliberately excluded: that pause already has its own approve/deny
  // affordance (RuntimeApprovalCard), and cancelActiveRun() still works if
  // the user wants out of that too, just not via this Stop button.
  const isBusy = status === 'thinking' || status === 'planning' || status === 'tool_calling' || status === 'executing' || status === 'generating';

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

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
    if ((!prompt.trim() && attachedFiles.length === 0) || isBusy) return;
    const attachmentContext = buildAttachmentContext(attachedFiles);
    const toolHint =
      selectedTools.length > 0
        ? `(${t('Please prioritize using', '请优先使用')}: ${selectedTools.join(', ')})\n\n`
        : '';
    submitPrompt(`${attachmentContext}${toolHint}${prompt.trim()}`);
    setPrompt('');
    setAttachedFiles([]);
  };

  return (
    <div
      className={`relative w-full rounded-2xl bg-bg-surface border border-border hover:border-accent/40 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft shadow-sm transition-all px-4 py-2.5 ${className}`}
    >
      <AttachmentChips files={attachedFiles} onRemove={(name) => setAttachedFiles((prev) => prev.filter((f) => f.name !== name))} />

      <div className="flex items-center gap-3">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('Ask a question or describe your research...', '提出问题或描述你的研究需求…')}
          rows={1}
          disabled={isBusy}
          className="w-full bg-transparent resize-none border-none outline-none text-[14.5px] placeholder:text-text-muted text-text-primary leading-normal disabled:opacity-50 py-1"
          style={{ minHeight: '34px', maxHeight: '120px' }}
        />

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFilesPicked(e.target.files)} />

        {/* Action Button: send when idle, Stop when a run is in flight */}
        {isBusy ? (
          <button
            onClick={() => cancelActiveRun()}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-500 border border-red-500/30 flex items-center justify-center transition-all shadow-sm"
            title={t('Stop', '停止')}
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() && attachedFiles.length === 0}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all shadow-sm"
            title={t('Send query (Enter)', '发送 (Enter)')}
          >
            <ChevronRight size={18} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1.5 mt-1.5 border-t border-border-subtle text-text-muted">
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
        <div className="flex-1" />
        <WorkspacePicker />
        <ResearchProfilePicker />
        <SessionModeToggle />
      </div>
    </div>
  );
};
