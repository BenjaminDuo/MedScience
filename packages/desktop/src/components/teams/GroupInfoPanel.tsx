import React, { useState } from 'react';
import type { AgentDefinition, ResearchTeamDefinition } from '@medscience/core';
import { Archive, Check, Minus, Pencil, Plus, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { GroupPrefs } from '../../lib/groupPrefs';
import { agentName } from './agentIdentity';
import { MemberAvatar } from './GroupAvatar';

interface GroupInfoPanelProps {
  team: ResearchTeamDefinition;
  agentById: Map<string, AgentDefinition>;
  prefs: GroupPrefs;
  /** True while a run of this team is still in flight (some edits are blocked then). */
  live: boolean;
  saving: boolean;
  onSave: (team: ResearchTeamDefinition) => void;
  onPrefsChange: (patch: Partial<GroupPrefs>) => void;
  onAddMembers: () => void;
  onOpenMember: (agentId: string) => void;
  onRemoveMember: (agentId: string) => void;
  onArchive: () => void;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 py-1.5">
    <span className="text-[12px] text-text-secondary shrink-0">{label}</span>
    <div className="text-[12px] text-text-primary flex items-center gap-1.5 min-w-0">{children}</div>
  </div>
);

const Toggle: React.FC<{ on: boolean; onChange: () => void }> = ({ on, onChange }) => (
  <button
    onClick={onChange}
    className={`w-9 h-5 rounded-full border relative transition-colors ${
      on ? 'bg-accent-soft border-accent' : 'bg-bg-hover border-border'
    }`}
  >
    <span
      className={`absolute top-[2px] w-3.5 h-3.5 rounded-full transition-all ${
        on ? 'left-[18px] bg-accent' : 'left-[2px] bg-text-muted'
      }`}
    />
  </button>
);

const NumberSelect: React.FC<{ value: number; options: number[]; onChange: (value: number) => void }> = ({
  value,
  options,
  onChange,
}) => (
  <select
    value={value}
    onChange={(event) => onChange(Number(event.target.value))}
    className="bg-bg-elevated border border-border rounded-md text-[12px] text-text-primary px-1.5 py-0.5 outline-none focus:border-accent"
  >
    {options.map((option) => (
      <option key={option} value={option}>
        {option}
      </option>
    ))}
  </select>
);

export const GroupInfoPanel: React.FC<GroupInfoPanelProps> = ({
  team,
  agentById,
  prefs,
  live,
  saving,
  onSave,
  onPrefsChange,
  onAddMembers,
  onOpenMember,
  onRemoveMember,
  onArchive,
}) => {
  const { t, language } = useLanguage();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingNotice, setEditingNotice] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState('');
  const [removing, setRemoving] = useState(false);

  const teamLabel = (language === 'zh' && team.nameZh) || team.name;

  const commitName = () => {
    const next = nameDraft.trim();
    setEditingName(false);
    if (!next || next === teamLabel) return;
    onSave(language === 'zh' && team.nameZh ? { ...team, nameZh: next } : { ...team, name: next });
  };

  const commitNotice = () => {
    setEditingNotice(false);
    if (noticeDraft === team.instructions) return;
    onSave({ ...team, instructions: noticeDraft });
  };

  return (
    <div className="w-[318px] shrink-0 bg-bg-surface border-l border-border h-full overflow-y-auto">
      {/* members */}
      <div className="p-3.5 border-b border-border-subtle">
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-[11px] font-semibold tracking-wide text-text-muted">{t('Members', '小队成员')}</h4>
          <span className="text-[11px] text-text-secondary">
            {t(`${team.members.length} · 1 leader`, `${team.members.length} 人 · 1 名队长`)}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-y-2.5 gap-x-1.5">
          {team.members.map((member) => (
            <button
              key={member.agentId}
              onClick={() => (removing ? onRemoveMember(member.agentId) : onOpenMember(member.agentId))}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span className="relative">
                <MemberAvatar
                  agentId={member.agentId}
                  agent={agentById.get(member.agentId)}
                  leader={member.agentId === team.leaderAgentId}
                />
                {removing && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center">
                    <Minus size={10} />
                  </span>
                )}
              </span>
              <span className="text-[10.5px] text-text-secondary truncate max-w-[62px] group-hover:text-text-primary">
                {agentName(agentById.get(member.agentId), member.agentId, language)}
              </span>
            </button>
          ))}
          <button onClick={onAddMembers} className="flex flex-col items-center gap-1.5">
            <span className="w-8 h-8 rounded-[9px] border border-dashed border-border text-text-muted flex items-center justify-center hover:border-accent hover:text-accent transition-colors">
              <Plus size={15} />
            </span>
            <span className="text-[10.5px] text-text-muted">{t('Add', '添加')}</span>
          </button>
          <button onClick={() => setRemoving((value) => !value)} className="flex flex-col items-center gap-1.5">
            <span
              className={`w-8 h-8 rounded-[9px] border border-dashed flex items-center justify-center transition-colors ${
                removing ? 'border-red-500 text-red-500' : 'border-border text-text-muted hover:border-accent hover:text-accent'
              }`}
            >
              {removing ? <X size={14} /> : <Minus size={15} />}
            </span>
            <span className="text-[10.5px] text-text-muted">{removing ? t('Done', '完成') : t('Remove', '移出')}</span>
          </button>
        </div>
        {removing && (
          <p className="text-[10.5px] text-amber-500 mt-2 leading-relaxed">
            {t('Tap a member to remove them from this team.', '点击成员头像即可将其移出小队。')}
          </p>
        )}
      </div>

      {/* identity */}
      <div className="p-3.5 border-b border-border-subtle">
        <Row label={t('Team name', '小队名称')}>
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitName();
                if (event.key === 'Escape') setEditingName(false);
              }}
              className="bg-bg-elevated border border-accent rounded-md px-1.5 py-0.5 text-[12px] text-text-primary outline-none w-[180px]"
            />
          ) : (
            <button
              onClick={() => {
                setNameDraft(teamLabel);
                setEditingName(true);
              }}
              className="flex items-center gap-1.5 hover:text-accent transition-colors min-w-0"
            >
              <span className="truncate">{teamLabel}</span>
              <Pencil size={11} className="shrink-0" />
            </button>
          )}
        </Row>
        <Row label={t('Leader', '队长')}>
          <MemberAvatar agentId={team.leaderAgentId} agent={agentById.get(team.leaderAgentId)} size="sm" />
          <button
            onClick={() => onOpenMember(team.leaderAgentId)}
            className="truncate hover:text-accent transition-colors"
          >
            {agentName(agentById.get(team.leaderAgentId), team.leaderAgentId, language)}
          </button>
        </Row>
        {team.clonedFromTemplateId && (
          <Row label={t('From template', '来源模板')}>
            <span className="text-text-muted truncate">{team.clonedFromTemplateId}</span>
          </Row>
        )}
      </div>

      {/* announcement */}
      <div className="p-3.5 border-b border-border-subtle">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-semibold tracking-wide text-text-muted">{t('Team notice', '群公告')}</h4>
          <button
            onClick={() => {
              setNoticeDraft(team.instructions);
              setEditingNotice((value) => !value);
            }}
            className="text-[11px] text-text-secondary hover:text-accent transition-colors"
          >
            {editingNotice ? t('Cancel', '取消') : t('Edit', '编辑')}
          </button>
        </div>
        {editingNotice ? (
          <div className="space-y-2">
            <textarea
              value={noticeDraft}
              onChange={(event) => setNoticeDraft(event.target.value)}
              rows={5}
              className="w-full bg-bg-elevated border border-accent rounded-lg px-2.5 py-2 text-[12px] leading-relaxed text-text-primary outline-none resize-none"
            />
            <button
              onClick={commitNotice}
              disabled={saving}
              className="w-full py-1.5 rounded-lg bg-accent text-[#04131f] text-[12px] font-semibold hover:bg-accent-hover transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              <Check size={12} />
              {t('Save notice', '保存公告')}
            </button>
          </div>
        ) : (
          <p className="bg-bg-elevated border border-border-subtle rounded-lg px-2.5 py-2 text-[12px] leading-relaxed text-text-secondary whitespace-pre-wrap">
            {team.instructions || t('No notice yet.', '还没有群公告。')}
          </p>
        )}
      </div>

      {/* settings */}
      <div className="p-3.5 border-b border-border-subtle">
        <h4 className="text-[11px] font-semibold tracking-wide text-text-muted mb-2">{t('Team settings', '小队设置')}</h4>
        <Row label={t('Execution mode', '执行模式')}>
          <select
            value={team.planningMode}
            onChange={(event) =>
              onSave({ ...team, planningMode: event.target.value as ResearchTeamDefinition['planningMode'] })
            }
            className="bg-bg-elevated border border-border rounded-md text-[12px] text-text-primary px-1.5 py-0.5 outline-none focus:border-accent"
          >
            <option value="review-first">{t('Leader plan needs approval', '需队长审批计划')}</option>
            <option value="automatic">{t('Plan and run automatically', '自动规划并执行')}</option>
          </select>
        </Row>
        <Row label={t('Max concurrency', '最大并发')}>
          <NumberSelect
            value={team.maxConcurrency}
            options={[1, 2, 3, 4, 5]}
            onChange={(value) => onSave({ ...team, maxConcurrency: value })}
          />
        </Row>
        <Row label={t('Max tasks', '任务上限')}>
          <NumberSelect
            value={team.maxTasks}
            options={[4, 6, 8, 10, 12, 16]}
            onChange={(value) => onSave({ ...team, maxTasks: value })}
          />
        </Row>
        <Row label={t('Revisions per task', '每任务修订上限')}>
          <NumberSelect
            value={team.maxRevisionsPerTask}
            options={[0, 1, 2, 3]}
            onChange={(value) => onSave({ ...team, maxRevisionsPerTask: value })}
          />
        </Row>
        <Row label={t('Mute notifications', '消息免打扰')}>
          <Toggle on={prefs.muted} onChange={() => onPrefsChange({ muted: !prefs.muted })} />
        </Row>
        <Row label={t('Pin to top', '置顶该小队')}>
          <Toggle on={prefs.pinned} onChange={() => onPrefsChange({ pinned: !prefs.pinned })} />
        </Row>
        {live && (
          <p className="text-[10.5px] text-amber-500 mt-1.5 leading-relaxed">
            {t(
              'A run is in flight: budget changes apply to the next inquiry, not this one.',
              '当前有课题在运行：预算类改动会在下一个课题生效，不影响本次。'
            )}
          </p>
        )}
      </div>

      <div className="p-3.5">
        <button
          onClick={onArchive}
          className="w-full py-2 rounded-lg border border-red-500/25 text-red-500 text-[12px] hover:bg-red-500/10 transition-colors flex items-center justify-center gap-1.5"
        >
          <Archive size={12} />
          {t('Archive this team', '归档该小队')}
        </button>
      </div>
    </div>
  );
};
