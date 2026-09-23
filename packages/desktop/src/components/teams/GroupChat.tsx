import React, { useEffect, useMemo, useRef } from 'react';
import type { AgentDefinition, ResearchTeamDefinition, TeamRunRecord } from '@medscience/core';
import { AtSign, Info, ListTree, Loader2, Pause, Play, Send, Square, Users } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { GroupMessage } from '../../lib/teamChat';
import { agentName } from './agentIdentity';
import { GroupAvatar, MemberAvatar } from './GroupAvatar';
import { HandoffCard, PlanCard, ReportCard } from './ChatCards';

interface GroupChatProps {
  team: ResearchTeamDefinition;
  messages: GroupMessage[];
  agentById: Map<string, AgentDefinition>;
  activeRun?: TeamRunRecord;
  busy?: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onApprovePlan: () => void;
  onRunAction: (action: 'pause' | 'resume' | 'cancel') => void;
  onToggleInfo: () => void;
  infoOpen: boolean;
}

const RUN_STATUS_LABEL: Record<string, [string, string]> = {
  planning: ['Planning', '规划中'],
  'awaiting-plan-approval': ['Waiting for your approval', '等待你批准计划'],
  running: ['Running', '运行中'],
  'awaiting-user': ['Paused', '已暂停'],
  reviewing: ['In review', '审阅中'],
  synthesizing: ['Writing report', '综合报告中'],
  completed: ['Completed', '已完成'],
  failed: ['Stopped', '已中止'],
  cancelled: ['Cancelled', '已取消'],
};

/** Renders @mentions of members as highlighted names instead of raw ids. */
const MessageText: React.FC<{ text: string; mentions: string[]; agentById: Map<string, AgentDefinition> }> = ({
  text,
  mentions,
  agentById,
}) => {
  const { language } = useLanguage();
  const prefix = mentions.length > 0 && (
    <>
      {mentions.map((agentId) => (
        <span key={agentId} className="text-accent font-semibold mr-1.5">
          @{agentName(agentById.get(agentId), agentId, language)}
        </span>
      ))}
    </>
  );
  return (
    <span className="whitespace-pre-wrap break-words">
      {prefix}
      {text}
    </span>
  );
};

export const GroupChat: React.FC<GroupChatProps> = ({
  team,
  messages,
  agentById,
  activeRun,
  busy,
  draft,
  onDraftChange,
  onSend,
  onApprovePlan,
  onRunAction,
  onToggleInfo,
  infoOpen,
}) => {
  const { t, language } = useLanguage();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, team.id]);

  const runStatus = activeRun?.run.status;
  const statusLabel = runStatus ? RUN_STATUS_LABEL[runStatus] : undefined;
  const isLive = runStatus ? !['completed', 'failed', 'cancelled'].includes(runStatus) : false;
  const leaderName = agentName(agentById.get(team.leaderAgentId), team.leaderAgentId, language);

  const teamLabel = (language === 'zh' && team.nameZh) || team.name;

  const memberRoles = useMemo(() => {
    const map = new Map<string, string>();
    team.members.forEach((member) => map.set(member.agentId, (language === 'zh' && member.roleZh) || member.role));
    return map;
  }, [team, language]);

  const renderMessage = (message: GroupMessage) => {
    switch (message.kind) {
      case 'divider':
        return (
          <div key={message.id} className="self-center px-3 py-1 rounded-full bg-bg-elevated border border-border-subtle">
            <span className="text-[10.5px] text-text-muted">
              {new Date(message.at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {' · '}
              {t('New inquiry', '新课题')}
            </span>
          </div>
        );

      case 'system':
        return (
          <div
            key={message.id}
            className={`self-center max-w-[78%] text-center text-[11.5px] px-3 py-1.5 rounded-lg border ${
              message.tone === 'warn'
                ? 'text-amber-500 border-amber-500/25 bg-amber-500/10'
                : message.tone === 'error'
                  ? 'text-red-500 border-red-500/25 bg-red-500/10'
                  : 'text-text-muted border-border-subtle bg-bg-elevated'
            }`}
          >
            {message.text}
          </div>
        );

      case 'user':
        return (
          <div key={message.id} className="self-end flex flex-row-reverse gap-2.5 max-w-[84%]">
            <span className="w-8 h-8 rounded-[9px] bg-accent-secondary text-[#06131e] text-[10.5px] font-bold flex items-center justify-center shrink-0">
              {t('You', '我')}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] text-text-muted mb-1 text-right">{t('You', '你')}</div>
              <div className="rounded-[12px_3px_12px_12px] px-3 py-2 text-[13px] leading-relaxed bg-accent text-[#04131f] whitespace-pre-wrap break-words">
                {message.text}
              </div>
            </div>
          </div>
        );

      case 'typing':
        return (
          <div key={message.id} className="flex gap-2.5 max-w-[84%]">
            <MemberAvatar agentId={message.agentId} agent={agentById.get(message.agentId)} />
            <div className="min-w-0">
              <div className="text-[11px] text-text-muted mb-1">
                {agentName(agentById.get(message.agentId), message.agentId, language)}
              </div>
              <div className="rounded-[3px_12px_12px_12px] border border-border bg-bg-elevated px-3 py-2 text-[12.5px] text-text-muted flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" />
                {message.hint}
              </div>
            </div>
          </div>
        );

      case 'agent':
        return (
          <div key={message.id} className="flex gap-2.5 max-w-[84%]">
            <MemberAvatar
              agentId={message.agentId}
              agent={agentById.get(message.agentId)}
              leader={message.agentId === team.leaderAgentId}
            />
            <div className="min-w-0">
              <div className="text-[11px] text-text-muted mb-1 flex items-center gap-1.5 flex-wrap">
                <span>{agentName(agentById.get(message.agentId), message.agentId, language)}</span>
                {memberRoles.get(message.agentId) && (
                  <span className="opacity-70">· {memberRoles.get(message.agentId)}</span>
                )}
              </div>
              <div className="rounded-[3px_12px_12px_12px] border border-border bg-bg-elevated px-3 py-2 text-[13px] leading-relaxed text-text-primary">
                <MessageText text={message.text} mentions={message.mentions} agentById={agentById} />
              </div>
            </div>
          </div>
        );

      case 'plan':
        return (
          <div key={message.id} className="flex gap-2.5 max-w-[92%]">
            <MemberAvatar agentId={message.leaderAgentId} agent={agentById.get(message.leaderAgentId)} leader />
            <div className="min-w-0">
              <div className="text-[11px] text-text-muted mb-1">
                {agentName(agentById.get(message.leaderAgentId), message.leaderAgentId, language)} ·{' '}
                {t('proposed a plan', '发布了研究计划')}
              </div>
              <PlanCard
                tasks={message.tasks}
                approvable={message.approvable}
                agentById={agentById}
                busy={busy === 'run-approvePlan'}
                onApprove={onApprovePlan}
              />
            </div>
          </div>
        );

      case 'handoff':
        return (
          <div key={message.id} className="flex gap-2.5 max-w-[92%]">
            <MemberAvatar agentId={message.agentId} agent={agentById.get(message.agentId)} />
            <div className="min-w-0">
              <div className="text-[11px] text-text-muted mb-1">
                {agentName(agentById.get(message.agentId), message.agentId, language)}
              </div>
              <HandoffCard handoff={message.handoff} taskTitle={message.taskTitle} />
            </div>
          </div>
        );

      case 'report':
        return (
          <div key={message.id} className="flex gap-2.5 max-w-[92%]">
            <MemberAvatar agentId={message.leaderAgentId} agent={agentById.get(message.leaderAgentId)} leader />
            <div className="min-w-0">
              <div className="text-[11px] text-text-muted mb-1">
                {agentName(agentById.get(message.leaderAgentId), message.leaderAgentId, language)}
              </div>
              <ReportCard run={message.run} />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex-1 min-w-[380px] min-h-0 flex flex-col bg-bg-primary h-full">
      {/* header */}
      <div className="h-[54px] shrink-0 flex items-center gap-2.5 px-3.5 border-b border-border bg-bg-surface">
        <GroupAvatar agentIds={team.members.map((member) => member.agentId)} size={34} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-semibold text-text-primary truncate">{teamLabel}</span>
            <span className="text-[12px] text-text-muted shrink-0">({team.members.length})</span>
          </div>
          <div className="text-[11px] text-text-muted truncate">
            {t('Leader', '队长')} · {leaderName}
            {statusLabel && ` · ${language === 'zh' ? statusLabel[1] : statusLabel[0]}`}
          </div>
        </div>
        <div className="flex-1" />
        {isLive && (
          <>
            <span className="px-2 py-1 rounded-full text-[10.5px] border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 whitespace-nowrap">
              {t(`${team.maxConcurrency} concurrent`, `并发上限 ${team.maxConcurrency}`)}
            </span>
            {runStatus === 'awaiting-user' ? (
              <button
                onClick={() => onRunAction('resume')}
                className="px-2 py-1 rounded-md text-[11px] border border-border text-text-secondary hover:text-accent hover:border-accent transition-colors flex items-center gap-1"
              >
                <Play size={11} />
                {t('Resume', '继续')}
              </button>
            ) : (
              <button
                onClick={() => onRunAction('pause')}
                className="px-2 py-1 rounded-md text-[11px] border border-border text-text-secondary hover:text-accent hover:border-accent transition-colors flex items-center gap-1"
              >
                <Pause size={11} />
                {t('Pause', '暂停')}
              </button>
            )}
            <button
              onClick={() => onRunAction('cancel')}
              className="px-2 py-1 rounded-md text-[11px] border border-border text-text-secondary hover:text-red-500 hover:border-red-500/40 transition-colors flex items-center gap-1"
            >
              <Square size={10} />
              {t('Stop', '终止')}
            </button>
          </>
        )}
        <button
          onClick={onToggleInfo}
          title={t('Team info', '小队信息')}
          className={`w-[30px] h-[30px] rounded-lg border flex items-center justify-center transition-colors ${
            infoOpen
              ? 'border-accent text-accent bg-accent-soft'
              : 'border-border-subtle bg-bg-elevated text-text-secondary hover:text-accent hover:border-accent'
          }`}
        >
          <Info size={14} />
        </button>
      </div>

      {/* transcript */}
      <div className="flex-1 min-h-0 overflow-y-auto px-[6%] py-5 flex flex-col gap-3.5">
        {messages.length === 0 ? (
          <div className="m-auto text-center max-w-sm">
            <Users size={26} className="mx-auto text-text-muted mb-3" />
            <p className="text-[13px] text-text-secondary leading-relaxed">
              {t(
                `${team.members.length} members are waiting. Send the leader your research question to start.`,
                `${team.members.length} 位成员已就位。把你的研究问题发给队长，课题就开始了。`
              )}
            </p>
          </div>
        ) : (
          messages.map(renderMessage)
        )}
        <div ref={bottomRef} />
      </div>

      {/* composer */}
      <div className="shrink-0 border-t border-border bg-bg-surface px-3.5 pt-2 pb-3">
        <div className="flex items-center gap-1 mb-1.5 text-text-muted">
          <button
            className="w-7 h-7 rounded-md hover:bg-bg-hover hover:text-text-primary flex items-center justify-center transition-colors"
            title={t('Mention a member', '@ 指定成员')}
            onClick={() => onDraftChange(`${draft}@`)}
          >
            <AtSign size={13} />
          </button>
          <button
            className="w-7 h-7 rounded-md hover:bg-bg-hover hover:text-text-primary flex items-center justify-center transition-colors"
            title={t('Task graph', '任务图')}
            onClick={onToggleInfo}
          >
            <ListTree size={13} />
          </button>
        </div>
        <div className="flex gap-2.5 items-end">
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            rows={2}
            placeholder={
              isLive
                ? t('This team is already working on an inquiry.', '该小队正在进行一个课题。')
                : t('Describe the research question for this team…', '写下交给这支小队的研究问题…')
            }
            disabled={isLive}
            className="flex-1 resize-none bg-bg-elevated border border-border-subtle rounded-[10px] px-3 py-2 text-[13px] text-text-primary outline-none focus:border-accent placeholder:text-text-muted disabled:opacity-60"
          />
          <button
            onClick={onSend}
            disabled={isLive || !draft.trim() || busy === 'start-run'}
            className="px-4 py-2.5 rounded-[9px] bg-accent text-[#04131f] text-[13px] font-bold hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy === 'start-run' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {t('Send', '发送')}
          </button>
        </div>
        <div className="text-[10.5px] text-text-muted mt-1.5">
          {isLive
            ? t(
                'One inquiry at a time per team — the concurrency limit is per run.',
                '一支小队同一时间只跑一个课题（并发上限是按课题计的）。'
              )
            : t('Enter to send · Shift+Enter for a new line', '⏎ 发送 · ⇧⏎ 换行')}
        </div>
      </div>
    </div>
  );
};
