import React, { useState } from 'react';
import type { AgentDefinition, ResearchTeamDefinition } from '@medscience/core';
import {
  BellOff,
  ChevronDown,
  ChevronRight,
  Download,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { AgentSession } from '../../types/agent';
import { ConversationRow, lastMessageOf } from '../../lib/conversationRows';
import { agentName } from './agentIdentity';
import { GroupAvatar, MemberAvatar } from './GroupAvatar';

export interface SearchHit {
  session: AgentSession;
  agentId: string;
  /** The matched text, with a little context around it. */
  snippet: string;
}

interface ConversationListProps {
  rows: ConversationRow[];
  selectedKey?: string;
  activeSessionId?: string;
  query: string;
  /** Non-empty query: full-text hits across this workspace's conversations. */
  searchHits: SearchHit[];
  expandedAgentIds: string[];
  onQueryChange: (value: string) => void;
  onSelect: (row: ConversationRow) => void;
  onToggleExpand: (agentId: string) => void;
  onOpenSession: (agentId: string, sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onExportSession: (sessionId: string) => void;
  onCreateTeam: () => void;
  /** The built-in rosters, offered at the bottom of the list as suggestions. */
  templates: ResearchTeamDefinition[];
  onUseTemplate: (templateId: string) => void;
  agentById: Map<string, AgentDefinition>;
  workspaceName?: string;
}

/** The key that identifies a row in the list (a member id or a team id). */
export function rowKey(row: ConversationRow): string {
  return row.kind === 'member' ? `member:${row.agentId}` : `team:${row.group.team.id}`;
}

const COLLAPSED_LIMIT = 8;

/** Suggested rosters shown before "show all" -- enough to browse, not a catalogue. */
const TEMPLATE_PREVIEW_LIMIT = 4;

function relativeTime(at: string | undefined, isZh: boolean): string {
  if (!at) return '';
  const date = new Date(at);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(isZh ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return isZh ? '昨天' : 'Yesterday';
  return date.toLocaleDateString(isZh ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric' });
}

function teamStatusDot(runStatus?: string): 'running' | 'waiting' | undefined {
  if (!runStatus) return undefined;
  if (['planning', 'running', 'reviewing', 'synthesizing'].includes(runStatus)) return 'running';
  if (['awaiting-plan-approval', 'awaiting-user'].includes(runStatus)) return 'waiting';
  return undefined;
}

/** Today / this week / earlier -- enough structure to scan, not a calendar. */
function bucketOf(session: AgentSession): 'today' | 'week' | 'earlier' {
  const date = new Date(session.updatedAt || session.createdAt);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'today';
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  return date >= weekAgo ? 'week' : 'earlier';
}

/**
 * One list for everything you can talk to in this workspace: members (with
 * their conversations one level down) and teams.
 *
 * Top level stays bounded, so a team is never pushed off-screen by the
 * number of conversations. The second level is opened deliberately, and
 * collapses again -- which is the difference between "I went looking" and
 * "I got buried".
 */
export const ConversationList: React.FC<ConversationListProps> = ({
  rows,
  selectedKey,
  activeSessionId,
  query,
  searchHits,
  expandedAgentIds,
  onQueryChange,
  onSelect,
  onToggleExpand,
  onOpenSession,
  onRenameSession,
  onDeleteSession,
  onExportSession,
  onCreateTeam,
  templates,
  onUseTemplate,
  agentById,
  workspaceName,
}) => {
  const { t, language } = useLanguage();
  const [showAllFor, setShowAllFor] = useState<string[]>([]);
  const [renamingId, setRenamingId] = useState<string | undefined>();
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | undefined>();
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const visibleTemplates = showAllTemplates ? templates : templates.slice(0, TEMPLATE_PREVIEW_LIMIT);

  const renderSessionRow = (agentId: string, session: AgentSession) => {
    const isActive = session.id === activeSessionId;
    const failed = session.status === 'error';
    return (
      <div
        key={session.id}
        className={`group ml-[46px] mr-1 rounded-lg px-2 py-1 ${
          isActive ? 'bg-accent-soft' : 'hover:bg-bg-hover'
        }`}
      >
        {renamingId === session.id ? (
          <input
            autoFocus
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
            onBlur={() => {
              if (renameDraft.trim()) onRenameSession(session.id, renameDraft.trim());
              setRenamingId(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setRenamingId(undefined);
            }}
            className="w-full bg-bg-elevated border border-accent rounded-md px-1.5 py-0.5 text-[12px] text-text-primary outline-none"
          />
        ) : (
          <>
            <button
              onClick={() => onOpenSession(agentId, session.id)}
              className="w-full text-left flex items-center gap-1.5"
              title={session.title}
            >
              {failed && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
              <span className="text-[12px] text-text-primary truncate flex-1">{session.title}</span>
              <span className="text-[10px] text-text-muted shrink-0">
                {relativeTime(session.updatedAt || session.createdAt, language === 'zh')}
              </span>
            </button>
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] text-text-muted truncate flex-1">{lastMessageOf(session)}</span>
              {confirmDeleteId === session.id ? (
                <>
                  <button
                    onClick={() => {
                      onDeleteSession(session.id);
                      setConfirmDeleteId(undefined);
                    }}
                    className="text-[10px] text-red-500 shrink-0"
                  >
                    {t('Delete?', '确认删除？')}
                  </button>
                  <button onClick={() => setConfirmDeleteId(undefined)} className="text-[10px] text-text-muted shrink-0">
                    {t('No', '取消')}
                  </button>
                </>
              ) : (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setRenameDraft(session.title);
                      setRenamingId(session.id);
                    }}
                    title={t('Rename', '重命名')}
                    className="text-text-muted hover:text-accent"
                  >
                    <Pencil size={10} />
                  </button>
                  <button
                    onClick={() => onExportSession(session.id)}
                    title={t('Export Markdown', '导出 Markdown')}
                    className="text-text-muted hover:text-accent"
                  >
                    <Download size={10} />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(session.id)}
                    title={t('Delete', '删除')}
                    className="text-text-muted hover:text-red-500"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderRow = (row: ConversationRow) => {
    const key = rowKey(row);
    const isActive = key === selectedKey;
    const shell = `w-full flex gap-2.5 p-2 rounded-xl text-left transition-colors ${
      isActive ? 'bg-accent-soft ring-1 ring-accent/25' : 'hover:bg-bg-hover'
    }`;

    if (row.kind === 'member') {
      const agent = agentById.get(row.agentId);
      const newest = row.sessions[row.sessions.length - 1];
      const preview = lastMessageOf(newest);
      const expanded = expandedAgentIds.includes(row.agentId);
      const showAll = showAllFor.includes(row.agentId);
      const ordered = [...row.sessions].reverse();
      const visible = showAll ? ordered : ordered.slice(0, COLLAPSED_LIMIT);

      let lastBucket: string | undefined;

      return (
        <div key={key}>
          <div className={shell}>
            <button onClick={() => onSelect(row)} className="flex gap-2.5 flex-1 min-w-0 text-left">
              <MemberAvatar agentId={row.agentId} agent={agent} size={42} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-text-primary truncate">
                    {agentName(agent, row.agentId, language)}
                  </span>
                  {row.pinned && <Pin size={9} className="text-text-muted shrink-0" />}
                  <span className="ml-auto text-[10px] text-text-muted shrink-0">
                    {relativeTime(row.latestAt, language === 'zh')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-text-muted truncate flex-1">
                    {preview || t('Start a conversation', '开始一个会话')}
                  </span>
                  {row.topicCount > 0 && (
                    <span className="text-[9.5px] text-text-muted shrink-0">
                      {t(`${row.topicCount} conversations`, `${row.topicCount} 个会话`)}
                    </span>
                  )}
                </div>
              </div>
            </button>
            {row.topicCount > 0 && (
              <button
                onClick={() => onToggleExpand(row.agentId)}
                title={expanded ? t('Collapse', '收起') : t('Show conversations', '展开会话')}
                className="w-6 h-6 self-center rounded-md text-text-muted hover:text-accent hover:bg-bg-hover flex items-center justify-center shrink-0"
              >
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            )}
          </div>

          {expanded && (
            <div className="pb-1.5 space-y-0.5">
              {visible.map((session) => {
                const bucket = bucketOf(session);
                const heading = bucket !== lastBucket ? bucket : undefined;
                lastBucket = bucket;
                return (
                  <React.Fragment key={session.id}>
                    {heading && (
                      <div className="ml-[46px] pt-1 pb-0.5 text-[9.5px] text-text-muted tracking-wide">
                        {heading === 'today'
                          ? t('Today', '今天')
                          : heading === 'week'
                            ? t('This week', '本周')
                            : t('Earlier', '更早')}
                      </div>
                    )}
                    {renderSessionRow(row.agentId, session)}
                  </React.Fragment>
                );
              })}
              {ordered.length > COLLAPSED_LIMIT && (
                <button
                  onClick={() =>
                    setShowAllFor((current) =>
                      showAll ? current.filter((id) => id !== row.agentId) : [...current, row.agentId]
                    )
                  }
                  className="ml-[46px] text-[10.5px] text-accent hover:underline"
                >
                  {showAll
                    ? t('Show fewer', '收起部分')
                    : t(`Show all ${ordered.length}`, `查看全部 ${ordered.length} 条`)}
                </button>
              )}
            </div>
          )}
        </div>
      );
    }

    const { group } = row;
    const dot = teamStatusDot(group.runStatus);
    return (
      <button key={key} onClick={() => onSelect(row)} className={shell}>
        <GroupAvatar agentIds={group.team.members.map((member) => member.agentId)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {dot && (
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  dot === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
            )}
            <span className="text-[13px] font-semibold text-text-primary truncate">
              {(language === 'zh' && group.team.nameZh) || group.team.name}
            </span>
            <span className="text-[9.5px] px-1 rounded border border-border-subtle text-text-muted shrink-0 flex items-center gap-0.5">
              <Users size={8} />
              {group.team.members.length}
            </span>
            <span className="ml-auto text-[10px] text-text-muted shrink-0">
              {relativeTime(row.latestAt, language === 'zh')}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-text-muted truncate flex-1">{group.preview}</span>
            {group.unread > 0 && !group.prefs.muted && (
              <span className="px-1 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9.5px] font-semibold flex items-center justify-center">
                {group.unread > 99 ? '99+' : group.unread}
              </span>
            )}
            {group.prefs.muted && <BellOff size={10} className="text-text-muted shrink-0" />}
            {!group.team.workspaceId && (
              <span className="text-[9px] px-1 rounded border border-border-subtle text-text-muted shrink-0">
                {t('Unscoped', '未分类')}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const searching = query.trim().length > 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg-surface border-r border-border">
      <div className="px-3 pt-3 pb-2 border-b border-border-subtle">
        {workspaceName && (
          <div className="text-[11px] text-text-muted mb-2 truncate">
            {t('Workspace', '工作区')} · <span className="text-text-secondary font-medium">{workspaceName}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 flex items-center gap-1.5 bg-bg-elevated border border-border-subtle rounded-lg px-2 py-1.5">
            <Search size={12} className="text-text-muted shrink-0" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t('Search conversations, members, teams', '搜索会话内容、队员、小队')}
              className="flex-1 bg-transparent border-none outline-none text-[12px] text-text-primary placeholder:text-text-muted min-w-0"
            />
          </div>
          <button
            onClick={onCreateTeam}
            title={t('Start a research team', '拉起科研小队')}
            className="w-[30px] h-[30px] rounded-lg bg-bg-elevated border border-border-subtle text-text-secondary hover:border-accent hover:text-accent flex items-center justify-center transition-colors shrink-0"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 pt-1.5">
        {searching ? (
          <>
            <div className="px-2 pt-1 pb-1.5 text-[10px] text-text-muted tracking-wide">
              {t(`${rows.length} matching rows · ${searchHits.length} in conversations`, `匹配 ${rows.length} 个对象 · ${searchHits.length} 条会话内容`)}
            </div>
            {rows.map(renderRow)}
            {searchHits.length > 0 && (
              <div className="px-2 pt-3 pb-1 text-[10px] text-text-muted tracking-wide">
                {t('In conversations', '会话内容命中')}
              </div>
            )}
            {searchHits.map((hit) => {
              const agent = agentById.get(hit.agentId);
              return (
                <button
                  key={`hit-${hit.session.id}`}
                  onClick={() => onOpenSession(hit.agentId, hit.session.id)}
                  className="w-full flex gap-2.5 p-2 rounded-xl text-left hover:bg-bg-hover transition-colors"
                >
                  <MemberAvatar agentId={hit.agentId} agent={agent} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-medium text-text-primary truncate">
                        {agentName(agent, hit.agentId, language)}
                      </span>
                      <span className="text-[10.5px] text-text-muted truncate">· {hit.session.title}</span>
                      <span className="ml-auto text-[10px] text-text-muted shrink-0">
                        {relativeTime(hit.session.updatedAt || hit.session.createdAt, language === 'zh')}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-text-muted mt-0.5 line-clamp-2 leading-relaxed">{hit.snippet}</p>
                  </div>
                </button>
              );
            })}
            {rows.length === 0 && searchHits.length === 0 && (
              <p className="px-3 py-8 text-center text-[12px] text-text-muted leading-relaxed">
                {t('Nothing matched.', '没有匹配结果。')}
              </p>
            )}
          </>
        ) : (
          <>
            {rows.length === 0 ? (
              <p className="px-3 py-8 text-center text-[12px] text-text-muted leading-relaxed">
                {t('Nothing here yet.', '这里还是空的。')}
              </p>
            ) : (
              rows.map(renderRow)
            )}

            {/* Suggested rosters. These are NOT teams -- nothing here exists
                yet, and the styling has to say so on its own, because the
                previous version rendered them exactly like the workspace's
                real teams and read as "you already have 14 teams". Dashed
                outline, desaturated faces and an explicit create affordance
                are the difference between a thing and a suggestion. */}
            {templates.length > 0 && (
              <>
                <div className="px-2 pt-5 pb-1 flex items-baseline gap-1.5">
                  <span className="text-[10px] text-text-muted tracking-wide">
                    {t('Suggested team rosters', '推荐小队配置')}
                  </span>
                  <span className="text-[9.5px] text-text-muted/60">
                    {t('· not created yet', '· 尚未创建')}
                  </span>
                </div>
                <p className="px-2 pb-2 text-[10px] text-text-muted/80 leading-relaxed">
                  {t(
                    'Starting points, not teams. Pick one to assemble a team with that roster.',
                    '这些只是配置模板，不是已有小队。点一个即可按该阵容拉起一支新小队。'
                  )}
                </p>
                {visibleTemplates.map((template) => {
                  const leader = agentById.get(template.leaderAgentId);
                  const others = template.members.filter((member) => member.agentId !== template.leaderAgentId);
                  return (
                    <button
                      key={template.id}
                      onClick={() => onUseTemplate(template.id)}
                      className="group w-full flex gap-2.5 p-2 mb-1.5 rounded-xl text-left border border-dashed border-border-color hover:border-accent-color/70 hover:bg-accent-soft/50 transition-colors"
                      title={(language === 'zh' && template.scenarioZh) || template.scenario}
                    >
                      <div className="shrink-0 opacity-60 grayscale group-hover:opacity-100 group-hover:grayscale-0 transition">
                        <GroupAvatar agentIds={template.members.map((member) => member.agentId)} size={38} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12.5px] font-medium text-text-secondary group-hover:text-text-primary truncate transition-colors">
                            {(language === 'zh' && template.nameZh) || template.name}
                          </span>
                          <span className="text-[9.5px] px-1 rounded border border-dashed border-border-color text-text-muted shrink-0">
                            {t(`${template.members.length} members`, `${template.members.length} 人`)}
                          </span>
                          <span className="ml-auto shrink-0 flex items-center gap-0.5 text-[10px] text-text-muted group-hover:text-accent-color transition-colors">
                            <Plus className="w-3 h-3" />
                            {t('Create', '创建')}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-text-muted mt-0.5 leading-snug line-clamp-2">
                          <span className="text-text-secondary">{t('Leader: ', '队长：')}</span>
                          {agentName(leader, template.leaderAgentId, language)}
                          {others.length > 0 && (
                            <>
                              {'　'}
                              <span className="text-text-secondary">{t('Members: ', '队员：')}</span>
                              {others
                                .map((member) => agentName(agentById.get(member.agentId), member.agentId, language))
                                .join(language === 'zh' ? '、' : ', ')}
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {templates.length > TEMPLATE_PREVIEW_LIMIT && (
                  <button
                    onClick={() => setShowAllTemplates((value) => !value)}
                    className="w-full py-1.5 mb-2 text-[10.5px] text-text-muted hover:text-accent-color transition-colors"
                  >
                    {showAllTemplates
                      ? t('Show fewer', '收起')
                      : t(`Show all ${templates.length} rosters`, `查看全部 ${templates.length} 个配置`)}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
