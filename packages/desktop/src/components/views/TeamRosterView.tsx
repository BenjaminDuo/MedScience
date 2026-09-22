import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Crown,
  Plus,
  Trash2,
  Save,
  Archive,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * 科研小队队员管理 (Team Roster Management) -- a Configuration-group page,
 * account-wide rather than workspace-scoped (team DEFINITIONS are shared
 * tooling, same tier as Model Configuration/Guardrail Hooks; only team
 * RUNS are workspace-scoped, see the 科研小队 sub-item in the sidebar
 * workspace tree / ResearchTeamsView.tsx).
 *
 * ResearchTeamsView.tsx already lets a user browse teams, clone a built-in
 * template, and start/monitor runs -- what it never had is full CRUD over a
 * team's own definition (who leads, who's on it, what role each member
 * plays). That's what this page adds, via the same team:create/team:update
 * IPC/HTTP channels TeamProfileManager already validates against (a team
 * must have >=1 member, the leader must be a member with canLead: true,
 * every member agentId must be a known agent).
 *
 * Types are intentionally loose (not imported from @medscience/core), same
 * pattern as ResearchTeamsView.tsx, so this file has no compile-time
 * dependency on the exact IPC/HTTP payload shape.
 */

interface AgentLike {
  id: string;
  name: string;
  title: string;
  description: string;
  nameZh?: string;
  titleZh?: string;
  descriptionZh?: string;
}

interface MemberLike {
  agentId: string;
  role: string;
  roleZh?: string;
  required: boolean;
  canLead: boolean;
}

interface TeamLike {
  id: string;
  name: string;
  description: string;
  nameZh?: string;
  descriptionZh?: string;
  scenarioZh?: string;
  scenario: string;
  leaderAgentId: string;
  instructions: string;
  members: MemberLike[];
  maxConcurrency: number;
  maxTasks: number;
  maxRevisionsPerTask: number;
  planningMode: 'review-first' | 'automatic';
  builtIn: boolean;
  archived: boolean;
  version: number;
}

function emptyDraft(): Omit<TeamLike, 'id' | 'builtIn' | 'archived' | 'version'> {
  return {
    name: '',
    description: '',
    scenario: '',
    leaderAgentId: '',
    instructions: '',
    members: [],
    maxConcurrency: 2,
    maxTasks: 8,
    maxRevisionsPerTask: 2,
    planningMode: 'review-first',
  };
}

export const TeamRosterView: React.FC = () => {
  const { t, language } = useLanguage();
  const [teams, setTeams] = useState<TeamLike[]>([]);
  const [agents, setAgents] = useState<AgentLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const [editingId, setEditingId] = useState<string | 'new' | undefined>();
  const [draft, setDraft] = useState<any>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);

  const load = async () => {
    if (!window.medscience?.teams) {
      setError(t('Research Teams are not available in this build.', '当前构建不支持科研小队功能。'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const [teamList, agentList] = await Promise.all([
        window.medscience.teams.list(true),
        window.medscience.teams.listAgents(),
      ]);
      setTeams(teamList as TeamLike[]);
      setAgents(agentList as AgentLike[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agentLabel = (agent?: AgentLike) => (agent ? (language === 'zh' && agent.nameZh) || agent.name : undefined);
  const teamLabel = (team: TeamLike) => (language === 'zh' && team.nameZh) || team.name;
  const teamDesc = (team: TeamLike) => (language === 'zh' && team.descriptionZh) || team.description;

  const agentById = useMemo(() => {
    const map = new Map<string, AgentLike>();
    agents.forEach((a) => map.set(a.id, a));
    return map;
  }, [agents]);

  const startCreate = () => {
    setEditingId('new');
    setDraft(emptyDraft());
    setSaveErrors([]);
  };

  const startEdit = (team: TeamLike) => {
    setEditingId(team.id);
    setDraft({
      name: team.name,
      description: team.description,
      scenario: team.scenario,
      leaderAgentId: team.leaderAgentId,
      instructions: team.instructions,
      members: team.members.map((m) => ({ ...m })),
      maxConcurrency: team.maxConcurrency,
      maxTasks: team.maxTasks,
      maxRevisionsPerTask: team.maxRevisionsPerTask,
      planningMode: team.planningMode,
    });
    setSaveErrors([]);
  };

  const cancelEdit = () => {
    setEditingId(undefined);
    setSaveErrors([]);
  };

  const addMember = () => {
    const firstUnused = agents.find((a) => !draft.members.some((m: MemberLike) => m.agentId === a.id));
    if (!firstUnused) return;
    setDraft((prev: any) => ({
      ...prev,
      members: [
        ...prev.members,
        { agentId: firstUnused.id, role: (language === 'zh' && firstUnused.titleZh) || firstUnused.title, required: true, canLead: false },
      ],
    }));
  };

  const updateMember = (index: number, patch: Partial<MemberLike>) => {
    setDraft((prev: any) => ({
      ...prev,
      members: prev.members.map((m: MemberLike, i: number) => (i === index ? { ...m, ...patch } : m)),
    }));
  };

  const removeMember = (index: number) => {
    setDraft((prev: any) => {
      const removed = prev.members[index];
      const members = prev.members.filter((_: MemberLike, i: number) => i !== index);
      return {
        ...prev,
        members,
        leaderAgentId: removed?.agentId === prev.leaderAgentId ? '' : prev.leaderAgentId,
      };
    });
  };

  const handleSave = async () => {
    if (!window.medscience?.teams) return;
    setSaving(true);
    setSaveErrors([]);
    try {
      const payload = editingId === 'new' ? draft : { ...draft, id: editingId };
      const result =
        editingId === 'new'
          ? await window.medscience.teams.create(payload)
          : await window.medscience.teams.update(payload);
      if (result?.success === false) {
        setSaveErrors(result.errors || [t('Save failed.', '保存失败。')]);
        return;
      }
      await load();
      setEditingId(undefined);
    } catch (err) {
      setSaveErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (!window.medscience?.teams) return;
    await window.medscience.teams.archive(id);
    await load();
  };

  const leaderCandidates = draft.members?.filter((m: MemberLike) => m.canLead) || [];

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 sm:p-10 max-w-[1100px] mx-auto w-full">
      <div className="flex items-center justify-between gap-4 pb-6 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-accent/10 text-accent">
            <Users size={22} />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-text-primary">{t('Team Roster Management', '科研小队队员管理')}</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              {t(
                'Define team leaders and members for Research Teams -- who is on each team, who leads it, and what role they play.',
                '设置各科研小队的队长与队员——每支小队由谁组成、谁负责领队、各自承担什么角色。'
              )}
            </p>
          </div>
        </div>
        {!editingId && (
          <button
            onClick={startCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors shrink-0"
          >
            <Plus size={14} />
            {t('New Team', '新建小队')}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-text-muted gap-2">
          <Loader2 size={18} className="animate-spin" />
          {t('Loading…', '加载中…')}
        </div>
      )}

      {error && (
        <div className="mt-6 flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {!loading && !error && !editingId && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {teams.map((team) => (
            <div
              key={team.id}
              className={`p-4 rounded-xl border bg-bg-surface space-y-2.5 ${
                team.archived ? 'opacity-50 border-border-subtle' : 'border-border hover:border-accent/40'
              } transition-all`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-text-primary truncate">{teamLabel(team)}</h3>
                {team.builtIn ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-elevated border border-border-subtle text-text-muted shrink-0">
                    <Lock size={10} />
                    {t('Built-in', '内置')}
                  </span>
                ) : team.archived ? (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-elevated border border-border-subtle text-text-muted shrink-0">
                    {t('Archived', '已归档')}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">{teamDesc(team)}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">
                  <Crown size={11} />
                  {agentLabel(agentById.get(team.leaderAgentId)) || team.leaderAgentId}
                </span>
                <span className="text-[11px] text-text-muted">
                  {team.members.length} {t('members', '名队员')}
                </span>
              </div>
              {!team.builtIn && (
                <div className="flex items-center gap-2 pt-1.5 border-t border-border-subtle">
                  <button
                    onClick={() => startEdit(team)}
                    className="flex-1 text-center px-2 py-1.5 rounded-lg text-xs font-medium border border-border hover:border-accent/40 bg-bg-elevated hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-all"
                  >
                    {t('Edit', '编辑')}
                  </button>
                  {!team.archived && (
                    <button
                      onClick={() => handleArchive(team.id)}
                      className="px-2 py-1.5 rounded-lg text-xs font-medium border border-border hover:border-red-500/40 bg-bg-elevated hover:bg-red-500/10 text-text-secondary hover:text-red-500 transition-all"
                      title={t('Archive team', '归档小队')}
                    >
                      <Archive size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editingId && (
        <div className="mt-6 space-y-5">
          {saveErrors.length > 0 && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs space-y-1">
              {saveErrors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">{t('Team Name', '小队名称')}</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft((p: any) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-surface outline-none focus:border-accent"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">{t('Scenario', '适用场景')}</span>
              <input
                value={draft.scenario}
                onChange={(e) => setDraft((p: any) => ({ ...p, scenario: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-surface outline-none focus:border-accent"
              />
            </label>
          </div>

          <label className="space-y-1.5 block">
            <span className="text-xs font-medium text-text-secondary">{t('Description', '描述')}</span>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((p: any) => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-surface outline-none focus:border-accent resize-none"
            />
          </label>

          <label className="space-y-1.5 block">
            <span className="text-xs font-medium text-text-secondary">{t('Leader Instructions', '队长指令')}</span>
            <textarea
              value={draft.instructions}
              onChange={(e) => setDraft((p: any) => ({ ...p, instructions: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-surface outline-none focus:border-accent resize-none"
            />
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">{t('Members', '队员')}</span>
              <button
                onClick={addMember}
                disabled={draft.members.length >= agents.length}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:bg-accent-soft px-2 py-1 rounded transition-colors disabled:opacity-40"
              >
                <Plus size={12} />
                {t('Add Member', '添加队员')}
              </button>
            </div>

            <div className="space-y-2">
              {draft.members.map((member: MemberLike, idx: number) => (
                <div key={idx} className="flex items-center gap-2 p-2.5 rounded-lg border border-border-subtle bg-bg-surface">
                  <select
                    value={member.agentId}
                    onChange={(e) => updateMember(idx, { agentId: e.target.value })}
                    className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded border border-border bg-bg-elevated outline-none focus:border-accent"
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {agentLabel(a)} -- {(language === 'zh' && a.titleZh) || a.title}
                      </option>
                    ))}
                  </select>
                  <input
                    value={member.role}
                    onChange={(e) => updateMember(idx, { role: e.target.value })}
                    placeholder={t('Role', '角色')}
                    className="w-28 shrink-0 px-2 py-1.5 text-xs rounded border border-border bg-bg-elevated outline-none focus:border-accent"
                  />
                  <label className="flex items-center gap-1 text-[11px] text-text-secondary shrink-0 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={member.canLead}
                      onChange={(e) => updateMember(idx, { canLead: e.target.checked })}
                    />
                    {t('Can lead', '可任队长')}
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-text-secondary shrink-0 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={member.required}
                      onChange={(e) => updateMember(idx, { required: e.target.checked })}
                    />
                    {t('Required', '必需')}
                  </label>
                  <button
                    onClick={() => removeMember(idx)}
                    className="p-1 rounded text-text-muted hover:text-red-500 shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {draft.members.length === 0 && (
                <p className="text-xs text-text-muted italic py-2">{t('No members yet -- add at least one.', '尚未添加队员——请至少添加一名。')}</p>
              )}
            </div>
          </div>

          <label className="space-y-1.5 block max-w-xs">
            <span className="text-xs font-medium text-text-secondary flex items-center gap-1">
              <Crown size={12} className="text-accent" />
              {t('Team Leader', '队长')}
            </span>
            <select
              value={draft.leaderAgentId}
              onChange={(e) => setDraft((p: any) => ({ ...p, leaderAgentId: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-surface outline-none focus:border-accent"
            >
              <option value="">{t('Select a leader…', '选择队长…')}</option>
              {leaderCandidates.map((m: MemberLike) => (
                <option key={m.agentId} value={m.agentId}>
                  {agentLabel(agentById.get(m.agentId)) || m.agentId}
                </option>
              ))}
            </select>
            {leaderCandidates.length === 0 && (
              <span className="text-[11px] text-text-muted">
                {t('Mark at least one member "Can lead" first.', '请先将至少一名队员标记为「可任队长」。')}
              </span>
            )}
          </label>

          <div className="grid grid-cols-3 gap-4 max-w-lg">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">{t('Max Concurrency', '最大并发')}</span>
              <input
                type="number"
                min={1}
                value={draft.maxConcurrency}
                onChange={(e) => setDraft((p: any) => ({ ...p, maxConcurrency: Number(e.target.value) }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-surface outline-none focus:border-accent"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">{t('Max Tasks', '最大任务数')}</span>
              <input
                type="number"
                min={1}
                value={draft.maxTasks}
                onChange={(e) => setDraft((p: any) => ({ ...p, maxTasks: Number(e.target.value) }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-surface outline-none focus:border-accent"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">{t('Max Revisions', '最大修订次数')}</span>
              <input
                type="number"
                min={0}
                value={draft.maxRevisionsPerTask}
                onChange={(e) => setDraft((p: any) => ({ ...p, maxRevisionsPerTask: Number(e.target.value) }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-surface outline-none focus:border-accent"
              />
            </label>
          </div>

          <label className="space-y-1.5 block max-w-xs">
            <span className="text-xs font-medium text-text-secondary flex items-center gap-1">
              <ShieldCheck size={12} className="text-accent" />
              {t('Planning Mode', '计划模式')}
            </span>
            <select
              value={draft.planningMode}
              onChange={(e) => setDraft((p: any) => ({ ...p, planningMode: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-surface outline-none focus:border-accent"
            >
              <option value="review-first">{t('Review First (approve plan before running)', '先审后跑（执行前需批准计划）')}</option>
              <option value="automatic">{t('Automatic (runs immediately after planning)', '自动（计划完成后立即执行）')}</option>
            </select>
          </label>

          <div className="flex items-center gap-2 pt-4 border-t border-border">
            <button
              onClick={handleSave}
              disabled={saving || !draft.name.trim() || draft.members.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {t('Save Team', '保存小队')}
            </button>
            <button
              onClick={cancelEdit}
              className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all"
            >
              {t('Cancel', '取消')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
