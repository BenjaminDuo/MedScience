import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, Paperclip, Square, AtSign, X } from 'lucide-react';
import type { AgentDefinition } from '@medscience/core';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';
import { ExecutionProfilePicker } from '../common/ExecutionProfilePicker';
import { ToolsPicker } from '../common/ToolsPicker';
import { AttachmentChips } from '../common/AttachmentChips';
import { MemberAvatar } from '../teams/GroupAvatar';
import { agentName, agentTitle } from '../teams/agentIdentity';
import { readAttachedFiles, buildAttachmentContext, type AttachedFile } from '../../lib/attachFiles';
import {
  parseMention,
  mentionQueryAt,
  matchMembers,
  suggestMember,
  type MemberSuggestion,
} from '../../lib/memberRouting';

export const WorkspaceComposer: React.FC = () => {
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [roster, setRoster] = useState<AgentDefinition[]>([]);
  const [mention, setMention] = useState<{ query: string; start: number } | undefined>();
  const [highlighted, setHighlighted] = useState(0);
  /** A pending "should X take this?" question -- see lib/memberRouting.ts. */
  const [suggestion, setSuggestion] = useState<(MemberSuggestion & { text: string }) | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { submitPrompt, status, cancelActiveRun } = useAgent();
  const { t, language } = useLanguage();

  useEffect(() => {
    let cancelled = false;
    window.medscience?.teams
      ?.listAgents()
      .then((agents) => {
        if (!cancelled) setRoster(agents.filter((agent) => agent.enabled));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Kept in sync with AgentInput.tsx's isBusy -- see its comment for why
  // 'waiting_for_permission' is excluded.
  const isBusy = status === 'thinking' || status === 'planning' || status === 'tool_calling' || status === 'executing' || status === 'generating';

  const candidates = mention ? matchMembers(roster, mention.query) : [];

  const syncMention = (value: string, caret: number) => {
    const found = mentionQueryAt(value, caret);
    setMention(found);
    setHighlighted(0);
  };

  const insertMention = (agent: AgentDefinition) => {
    if (!mention) return;
    const name = (language === 'zh' && agent.nameZh) || agent.name;
    const next = `${input.slice(0, mention.start)}@${name} ${input.slice(mention.start + 1 + mention.query.length)}`;
    setInput(next);
    setMention(undefined);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && candidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((h) => (h + 1) % candidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((h) => (h - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(candidates[highlighted]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(undefined);
        return;
      }
    }
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

  /** Sends for real. `agentId` set means a member was named or accepted. */
  const send = (text: string, agentId?: string) => {
    const attachmentContext = buildAttachmentContext(attachedFiles);
    const toolHint =
      selectedTools.length > 0
        ? `(${t('Please prioritize using', '请优先使用')}: ${selectedTools.join(', ')})\n\n`
        : '';
    submitPrompt(`${attachmentContext}${toolHint}${text}`, {
      agentId,
      // Naming a specialist is a request for their actual work -- tools and
      // evidence -- not small talk. With nobody named it stays a plain
      // conversation, which is what the removed chat/research toggle used to
      // ask about before there was a message to judge.
      sessionType: agentId ? 'research' : 'chat',
    });
    setInput('');
    setAttachedFiles([]);
    setSuggestion(undefined);
    setMention(undefined);
  };

  const handleSubmit = () => {
    if ((!input.trim() && attachedFiles.length === 0) || isBusy) return;
    const { agentId, text } = parseMention(input.trim(), roster);
    if (agentId) {
      send(text, agentId);
      return;
    }
    const match = suggestMember(text, roster, 'general-expert');
    if (match) {
      // Ask rather than route: the keyword is evidence, not proof, and the
      // user can answer in one click either way.
      setSuggestion({ ...match, text });
      return;
    }
    send(text);
  };

  return (
    <div className="border-t border-border bg-bg-surface p-4">
      <div className="max-w-[840px] mx-auto">
        {suggestion && (
          <div className="mb-2 flex items-center gap-2.5 p-2.5 rounded-xl border border-accent/40 bg-accent-soft/60">
            <MemberAvatar agentId={suggestion.agent.id} agent={suggestion.agent} />
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] text-text-primary leading-snug">
                {t(
                  `This looks like ${agentName(suggestion.agent, suggestion.agent.id, language)}'s area. Hand it to them?`,
                  `这个问题看起来属于${agentName(suggestion.agent, suggestion.agent.id, language)}的领域，要交给 TA 吗？`
                )}
              </p>
              <p className="text-[10.5px] text-text-muted mt-0.5 truncate">
                {t('Matched on', '匹配到')} “{suggestion.trigger}” · {agentTitle(suggestion.agent, language)}
              </p>
            </div>
            <button
              onClick={() => send(suggestion.text, suggestion.agent.id)}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-accent text-white text-[11.5px] font-medium hover:brightness-110 transition-all"
            >
              {t('Yes, ask them', '好，交给 TA')}
            </button>
            <button
              onClick={() => send(suggestion.text)}
              className="shrink-0 px-2.5 py-1 rounded-lg border border-border text-text-secondary text-[11.5px] hover:text-text-primary transition-colors"
            >
              {t('Keep it a chat', '普通对话就好')}
            </button>
            <button
              onClick={() => setSuggestion(undefined)}
              className="shrink-0 p-1 rounded text-text-muted hover:text-text-primary transition-colors"
              title={t('Back to editing', '回到编辑')}
            >
              <X size={13} />
            </button>
          </div>
        )}

        <div className="relative rounded-xl bg-bg-elevated border border-border focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft transition-all p-2.5">
          <AttachmentChips files={attachedFiles} onRemove={(name) => setAttachedFiles((prev) => prev.filter((f) => f.name !== name))} />

          {mention && candidates.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1.5 w-80 max-h-64 overflow-y-auto rounded-xl border border-border bg-bg-surface shadow-lg z-30 py-1">
              <div className="px-3 py-1 text-[10px] tracking-wide text-text-muted">
                {t('Ask a member directly', '直接找某位队员')}
              </div>
              {candidates.map((agent, index) => (
                <button
                  key={agent.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(agent);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                    index === highlighted ? 'bg-accent-soft' : 'hover:bg-bg-hover'
                  }`}
                >
                  <MemberAvatar agentId={agent.id} agent={agent} />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-text-primary truncate">
                      {agentName(agent, agent.id, language)}
                    </span>
                    <span className="block text-[10.5px] text-text-muted truncate">{agentTitle(agent, language)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              syncMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
            }}
            onKeyUp={(e) => syncMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
            onClick={(e) => syncMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
            onKeyDown={handleKeyDown}
            placeholder={t(
              'Ask anything — type @ to put the question to a specific member',
              '随便问 —— 输入 @ 可以直接点名某位队员'
            )}
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
              <span className="flex items-center gap-1 text-[11px] opacity-70">
                <AtSign size={11} />
                {t('mention a member', '点名队员')}
              </span>
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
