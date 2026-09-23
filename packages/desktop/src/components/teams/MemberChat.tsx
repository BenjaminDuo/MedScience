import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentDefinition } from '@medscience/core';
import { AlignJustify, ChevronDown, ChevronLeft, ChevronRight, Info, Loader2, Plus, Rows3, Square } from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';
import { AgentSession } from '../../types/agent';
import { AgentMessage } from '../workspace/AgentMessage';
import { RuntimeApprovalCard } from '../workspace/RuntimeApprovalCard';
import { WorkspaceComposer } from '../workspace/WorkspaceComposer';
import { SessionModeToggle } from '../common/SessionModeToggle';
import { ResearchProfilePicker } from '../common/ResearchProfilePicker';
import { agentName, agentTitle } from './agentIdentity';
import { MemberAvatar } from './GroupAvatar';

interface MemberChatProps {
  agentId: string;
  agent?: AgentDefinition;
  /** This member's conversations in this workspace, oldest first. */
  sessions: AgentSession[];
  infoOpen: boolean;
  onToggleInfo: () => void;
  onNewConversation: () => void;
  onOpenConversation: (sessionId: string) => void;
}

/**
 * A 1:1 thread with one member, showing ONE conversation at a time.
 *
 * It used to concatenate every conversation with this member into a single
 * stream. With 27 of them that is unreadable, and worse: clicking a
 * conversation in the index changed which one the composer targeted but the
 * view barely moved, so the click looked like it did nothing. Now the pane
 * *is* the open conversation, and the bar above it is how you move between
 * them -- with a "continuous" toggle for anyone who does want to read the
 * whole history in one scroll.
 */
export const MemberChat: React.FC<MemberChatProps> = ({
  agentId,
  agent,
  sessions,
  infoOpen,
  onToggleInfo,
  onNewConversation,
  onOpenConversation,
}) => {
  const { t, language } = useLanguage();
  const { currentSession, status, pendingApprovals, cancelActiveRun } = useAgent();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [continuous, setContinuous] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const isWorking =
    status === 'thinking' ||
    status === 'planning' ||
    status === 'tool_calling' ||
    status === 'executing' ||
    status === 'generating';

  // The live session stands in for its stored copy so an in-flight answer
  // streams in place; an unsent draft is appended as the newest one.
  const thread: AgentSession[] = useMemo(() => {
    const merged = sessions.map((session) => (session.id === currentSession.id ? currentSession : session));
    if (currentSession.agentId === agentId && !sessions.some((session) => session.id === currentSession.id)) {
      merged.push(currentSession);
    }
    return merged;
  }, [sessions, currentSession, agentId]);

  const activeIndex = Math.max(
    0,
    thread.findIndex((session) => session.id === currentSession.id)
  );
  const active = thread[activeIndex];
  const isDraft = Boolean(active && active.messages.length === 0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [agentId, active?.id, currentSession.messages.length, continuous]);

  useEffect(() => {
    setSwitcherOpen(false);
  }, [agentId, active?.id]);

  const name = agentName(agent, agentId, language);
  const dateOf = (session: AgentSession) =>
    new Date(session.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'numeric',
      day: 'numeric',
    });

  const renderSession = (session: AgentSession, withHeading: boolean) => (
    <div key={session.id} className="space-y-4">
      {withHeading && (
        <div className="flex items-center gap-2 py-1">
          <span className="h-px flex-1 bg-border-subtle" />
          <span className="text-[10.5px] text-text-muted px-2.5 py-0.5 rounded-full bg-bg-elevated border border-border-subtle whitespace-nowrap max-w-[60%] truncate">
            {session.messages.length === 0 ? t('New conversation', '新会话') : `${session.title} · ${dateOf(session)}`}
          </span>
          <span className="h-px flex-1 bg-border-subtle" />
        </div>
      )}
      {session.messages.map((message) => (
        <AgentMessage key={message.id} message={message} />
      ))}
    </div>
  );

  return (
    <div className="flex-1 min-w-[380px] min-h-0 flex flex-col bg-bg-primary h-full">
      {/* member header */}
      <div className="h-[54px] shrink-0 flex items-center gap-2.5 px-3.5 border-b border-border bg-bg-surface">
        <MemberAvatar agentId={agentId} agent={agent} />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-text-primary truncate">{name}</div>
          <div className="text-[11px] text-text-muted truncate">
            {agentTitle(agent, language)}
            {sessions.length > 0 && ` · ${t(`${sessions.length} conversations`, `${sessions.length} 个会话`)}`}
          </div>
        </div>
        <div className="flex-1" />
        <button
          onClick={onNewConversation}
          className="px-2.5 py-1 rounded-md text-[11.5px] border border-border text-text-secondary hover:text-accent hover:border-accent transition-colors flex items-center gap-1"
          title={t('Start a new conversation with this member', '与该队员开启一个新会话')}
        >
          <Plus size={12} />
          {t('New conversation', '新会话')}
        </button>
        <button
          onClick={onToggleInfo}
          title={t('Member details', '队员详情')}
          className={`w-[30px] h-[30px] rounded-lg border flex items-center justify-center transition-colors ${
            infoOpen
              ? 'border-accent text-accent bg-accent-soft'
              : 'border-border-subtle bg-bg-elevated text-text-secondary hover:text-accent hover:border-accent'
          }`}
        >
          <Info size={14} />
        </button>
      </div>

      {/* conversation switcher */}
      {thread.length > 0 && (
        <div className="relative shrink-0 h-[38px] flex items-center gap-1 px-3 border-b border-border-subtle bg-bg-surface">
          <button
            onClick={() => activeIndex > 0 && onOpenConversation(thread[activeIndex - 1].id)}
            disabled={activeIndex <= 0 || continuous}
            title={t('Previous conversation', '上一个会话')}
            className="w-6 h-6 rounded-md text-text-muted hover:text-accent hover:bg-bg-hover disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setSwitcherOpen((value) => !value)}
            disabled={continuous}
            className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-bg-hover transition-colors disabled:opacity-50"
          >
            <span className="text-[12px] text-text-primary truncate">
              {continuous
                ? t('Continuous reading — all conversations', '连续阅读 — 全部会话')
                : active?.messages.length === 0
                  ? t('New conversation', '新会话')
                  : active?.title}
            </span>
            {!continuous && active && active.messages.length > 0 && (
              <span className="text-[10.5px] text-text-muted shrink-0">{dateOf(active)}</span>
            )}
            {!continuous && (
              <span className="text-[10px] text-text-muted shrink-0">
                {activeIndex + 1}/{thread.length}
              </span>
            )}
            <ChevronDown size={12} className="text-text-muted shrink-0" />
          </button>
          <button
            onClick={() => activeIndex < thread.length - 1 && onOpenConversation(thread[activeIndex + 1].id)}
            disabled={activeIndex >= thread.length - 1 || continuous}
            title={t('Next conversation', '下一个会话')}
            className="w-6 h-6 rounded-md text-text-muted hover:text-accent hover:bg-bg-hover disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center"
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => setContinuous((value) => !value)}
            title={
              continuous
                ? t('Show one conversation at a time', '一次只看一个会话')
                : t('Read the whole history continuously', '连续阅读全部历史')
            }
            className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
              continuous ? 'text-accent bg-accent-soft' : 'text-text-muted hover:text-accent hover:bg-bg-hover'
            }`}
          >
            {continuous ? <Rows3 size={13} /> : <AlignJustify size={13} />}
          </button>

          {switcherOpen && !continuous && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSwitcherOpen(false)} />
              <div className="absolute left-8 right-8 top-[36px] z-20 max-h-[320px] overflow-y-auto rounded-xl border border-border bg-bg-surface shadow-panel py-1">
                {[...thread].reverse().map((session) => (
                  <button
                    key={session.id}
                    onClick={() => onOpenConversation(session.id)}
                    className={`w-full text-left px-3 py-1.5 hover:bg-bg-hover transition-colors ${
                      session.id === active?.id ? 'bg-accent-soft' : ''
                    }`}
                  >
                    <div className="text-[12px] text-text-primary truncate">
                      {session.messages.length === 0 ? t('New conversation', '新会话') : session.title}
                    </div>
                    <div className="text-[10px] text-text-muted">
                      {dateOf(session)} ·{' '}
                      {t(
                        `${Math.ceil(session.messages.length / 2)} exchanges`,
                        `${Math.ceil(session.messages.length / 2)} 轮`
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
        {thread.length === 0 || (thread.length === 1 && thread[0].messages.length === 0) ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-8">
            <MemberAvatar agentId={agentId} agent={agent} size="lg" />
            <p className="text-[13px] text-text-secondary max-w-sm leading-relaxed mt-1">
              {t(
                `Ask ${name} anything. Every conversation you have stays in this thread.`,
                `直接问${name}。你和 TA 的每一次会话都会留在这条线程里。`
              )}
            </p>
          </div>
        ) : continuous ? (
          thread.map((session) => renderSession(session, true))
        ) : (
          active && renderSession(active, false)
        )}

        {isWorking && (
          <div className="max-w-[840px] mx-auto flex items-center gap-3 p-3.5 rounded-xl bg-bg-surface border border-border text-accent shadow-sm">
            <Loader2 size={16} className="animate-spin shrink-0" />
            <span className="text-xs font-mono flex-1 animate-pulse">{t('Working on it…', '正在处理…')}</span>
            <button
              onClick={() => cancelActiveRun()}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 text-[11px] font-medium transition-all"
            >
              <Square size={11} fill="currentColor" />
              <span>{t('Stop', '停止')}</span>
            </button>
          </div>
        )}

        {pendingApprovals.length > 0 && (
          <div className="pt-1">
            <RuntimeApprovalCard />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* A conversation's mode and research workflow are fixed once it
          starts, so they are offered here, on the unsent one, rather than on
          every message. */}
      {isDraft && !continuous && (
        <div className="shrink-0 px-4 pt-2 flex items-center gap-2 flex-wrap border-t border-border-subtle bg-bg-surface">
          <span className="text-[11px] text-text-muted">{t('This conversation:', '本次会话：')}</span>
          <SessionModeToggle />
          <ResearchProfilePicker />
        </div>
      )}

      {continuous ? (
        <div className="shrink-0 px-4 py-3 border-t border-border bg-bg-surface text-center text-[11.5px] text-text-muted">
          {t(
            'Continuous reading is read-only — switch back to reply.',
            '连续阅读为只读模式，切回单会话即可继续对话。'
          )}
        </div>
      ) : (
        <WorkspaceComposer />
      )}
    </div>
  );
};
