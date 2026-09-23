import React from 'react';
import { BellOff, Pin, Plus, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { GroupSummary } from '../../hooks/useTeamGroups';
import { GroupAvatar } from './GroupAvatar';

interface GroupListProps {
  groups: GroupSummary[];
  selectedTeamId?: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (teamId: string) => void;
  onCreate: () => void;
  workspaceName?: string;
}

/** Green while the team is working, amber while it is waiting on the user. */
function statusDot(runStatus?: string): string | undefined {
  if (!runStatus) return undefined;
  if (['planning', 'running', 'reviewing', 'synthesizing'].includes(runStatus)) return 'running';
  if (['awaiting-plan-approval', 'awaiting-user'].includes(runStatus)) return 'waiting';
  return undefined;
}

function relativeTime(at: string | undefined, isZh: boolean): string {
  if (!at) return '';
  const date = new Date(at);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString(isZh ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return isZh ? '昨天' : 'Yesterday';
  return date.toLocaleDateString(isZh ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric' });
}

export const GroupList: React.FC<GroupListProps> = ({
  groups,
  selectedTeamId,
  query,
  onQueryChange,
  onSelect,
  onCreate,
  workspaceName,
}) => {
  const { t, language } = useLanguage();
  const pinned = groups.filter((group) => group.prefs.pinned);
  const rest = groups.filter((group) => !group.prefs.pinned);

  const renderRow = (group: GroupSummary) => {
    const dot = statusDot(group.runStatus);
    const isActive = group.team.id === selectedTeamId;
    return (
      <button
        key={group.team.id}
        onClick={() => onSelect(group.team.id)}
        className={`w-full flex gap-2.5 p-2 rounded-xl text-left transition-colors ${
          isActive ? 'bg-accent-soft ring-1 ring-accent/25' : 'hover:bg-bg-hover'
        }`}
      >
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
            <span className="ml-auto text-[10px] text-text-muted shrink-0">
              {relativeTime(group.latestAt, language === 'zh')}
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
            {group.prefs.pinned && <Pin size={10} className="text-text-muted shrink-0" />}
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
              placeholder={t('Search teams or members', '搜索小队或成员')}
              className="flex-1 bg-transparent border-none outline-none text-[12px] text-text-primary placeholder:text-text-muted min-w-0"
            />
          </div>
          <button
            onClick={onCreate}
            title={t('Start a new research team', '拉起新的科研小队')}
            className="w-[30px] h-[30px] rounded-lg bg-bg-elevated border border-border-subtle text-text-secondary hover:border-accent hover:text-accent flex items-center justify-center transition-colors shrink-0"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {groups.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <p className="text-[12px] text-text-muted leading-relaxed">
              {t(
                'No teams in this workspace yet. Pick members and start one.',
                '这个工作区还没有小队。选几位成员，拉起第一支吧。'
              )}
            </p>
            <button
              onClick={onCreate}
              className="mt-3 px-3 py-1.5 rounded-lg bg-accent text-[#04131f] text-xs font-semibold hover:bg-accent-hover transition-colors"
            >
              {t('Start a team', '拉起小队')}
            </button>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <>
                <div className="text-[10px] text-text-muted px-2 pt-2.5 pb-1 tracking-wide">{t('Pinned', '置顶')}</div>
                {pinned.map(renderRow)}
              </>
            )}
            <div className="text-[10px] text-text-muted px-2 pt-2.5 pb-1 tracking-wide">
              {t(`Teams in this workspace · ${rest.length}`, `本工作区的小队 · ${rest.length}`)}
            </div>
            {rest.map(renderRow)}
          </>
        )}
      </div>
    </div>
  );
};
