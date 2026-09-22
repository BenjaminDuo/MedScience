import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Crown,
  Copy,
  Archive,
  Loader2,
  AlertCircle,
  Wrench,
  ShieldAlert,
  GitBranch,
  Layers,
  Play,
  Pause,
  XCircle,
  CheckCircle2,
  Clock,
  FileText,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useWorkspaces } from '../../context/WorkspaceContext';

/**
 * Research Teams (科研小队).
 *
 * Phase 1 (browse/customize) + Phase 2 (API-backed execution via
 * TeamOrchestrator, design doc section 19 stage 2): a team's detail panel
 * lets the user submit an inquiry, review/approve the leader's plan, watch
 * tasks run, and read the final report -- all through the team:run:* IPC/
 * HTTP channels backed by TeamOrchestrator. Local-runtime (Codex) team
 * members are still a later phase; every member here runs against the
 * active API model profile.
 *
 * Types are intentionally loose (not imported from @medscience/core) so this
 * file has no compile-time dependency on the exact shape returned over IPC/
 * HTTP -- the same pattern SettingsModal.tsx uses for detect results.
 */

interface AgentDefinitionLike {
  id: string;
  name: string;
  title: string;
  description: string;
  nameZh?: string;
  titleZh?: string;
  descriptionZh?: string;
  capabilityTags: string[];
  allowedToolCategories: string[];
  defaultSkillIds: string[];
  privacyClass: 'standard' | 'sensitive-clinical';
}

interface TeamMemberLike {
  agentId: string;
  role: string;
  roleZh?: string;
  required: boolean;
  canLead: boolean;
  executionProfileId?: string;
}

interface TeamDefinitionLike {
  id: string;
  name: string;
  description: string;
  nameZh?: string;
  descriptionZh?: string;
  scenarioZh?: string;
  scenario?: string;
  leaderAgentId: string;
  instructions: string;
  members: TeamMemberLike[];
  defaultExecutionProfileId?: string;
  maxConcurrency: number;
  maxTasks: number;
  maxRevisionsPerTask: number;
  planningMode: 'review-first' | 'automatic';
  builtIn: boolean;
  archived: boolean;
  clonedFromTemplateId?: string;
  updatedAt: string;
}

interface TeamTaskLike {
  id: string;
  title: string;
  objective: string;
  assignedAgentId: string;
  dependencyTaskIds: string[];
  status: string;
  attempt: number;
}

interface ScientificHandoffLike {
  id: string;
  taskId: string;
  agentId: string;
  summary: string;
  findings: { kind: string; statement: string; evidenceIds: string[] }[];
  limitations: string[];
}

interface TeamRunLike {
  id: string;
  teamId: string;
  sessionId: string;
  inquiry: string;
  status: string;
  failure?: { code: string; message: string };
  qualityGate?: { verdict: string; issues: string[]; recommendations: string[]; summary: string };
  report?: { narrative: string; evidenceIds: string[]; limitations: string[]; failedOrIncompleteTaskIds: string[] };
}

interface TeamRunRecordLike {
  run: TeamRunLike;
  tasks: TeamTaskLike[];
  handoffs: ScientificHandoffLike[];
}

interface TeamRunIndexEntryLike {
  id: string;
  teamId: string;
  inquiry: string;
  status: string;
  startedAt: string;
  completedAt?: string;
}

const SETTLED_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const STATUS_LABEL: Record<string, [string, string]> = {
  planning: ['Planning', '规划中'],
  'awaiting-plan-approval': ['Awaiting plan approval', '待批准计划'],
  running: ['Running', '运行中'],
  'awaiting-user': ['Paused', '已暂停'],
  reviewing: ['Under review', '审稿中'],
  synthesizing: ['Synthesizing', '综合中'],
  completed: ['Completed', '已完成'],
  failed: ['Failed', '失败'],
  cancelled: ['Cancelled', '已取消'],
};

const TASK_STATUS_COLOR: Record<string, string> = {
  proposed: 'text-text-muted',
  blocked: 'text-text-muted',
  ready: 'text-text-muted',
  running: 'text-accent',
  'awaiting-review': 'text-amber-500',
  'revision-requested': 'text-amber-500',
  completed: 'text-emerald-500',
  failed: 'text-red-500',
  cancelled: 'text-text-muted',
};

export const ResearchTeamsView: React.FC = () => {
  const { t, language } = useLanguage();

  const [teams, setTeams] = useState<TeamDefinitionLike[]>([]);
  const [agents, setAgents] = useState<AgentDefinitionLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [busyAction, setBusyAction] = useState<string | undefined>();

  const [inquiry, setInquiry] = useState('');
  const [starting, setStarting] = useState(false);
  const [activeRun, setActiveRun] = useState<TeamRunRecordLike | undefined>();
  const [recentRuns, setRecentRuns] = useState<TeamRunIndexEntryLike[]>([]);
  const [runActionBusy, setRunActionBusy] = useState(false);

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
        window.medscience.teams.list(false),
        window.medscience.teams.listAgents(),
      ]);
      setTeams(teamList as TeamDefinitionLike[]);
      setAgents(agentList as AgentDefinitionLike[]);
      setSelectedId((current) => current || (teamList as TeamDefinitionLike[])[0]?.id);
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

  const { activeWorkspaceId } = useWorkspaces();

  // Team runs are workspace-scoped, same as conversations/evidence/output
  // files -- the 科研小队 entry under a workspace in the sidebar tree only
  // shows runs started from that workspace, not every run across all of them.
  const loadRecentRuns = async (teamId: string) => {
    if (!window.medscience?.teams) return;
    try {
      const list = await window.medscience.teams.run.list(teamId, activeWorkspaceId);
      setRecentRuns(list as TeamRunIndexEntryLike[]);
    } catch {
      // best effort; the detail panel still works without run history
    }
  };

  useEffect(() => {
    setActiveRun(undefined);
    setInquiry('');
    if (selectedId) void loadRecentRuns(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, activeWorkspaceId]);

  // Poll the active run while it hasn't reached a terminal state.
  useEffect(() => {
    if (!activeRun || SETTLED_STATUSES.has(activeRun.run.status) || !window.medscience?.teams) return;
    const runId = activeRun.run.id;
    const interval = setInterval(async () => {
      try {
        const updated = await window.medscience!.teams.run.get(runId);
        if (updated) {
          setActiveRun(updated as TeamRunRecordLike);
          if (SETTLED_STATUSES.has((updated as TeamRunRecordLike).run.status) && selectedId) {
            void loadRecentRuns(selectedId);
          }
        }
      } catch {
        // transient poll failure; try again next tick
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [activeRun, selectedId]);

  const teamLabel = (team: TeamDefinitionLike) => (language === 'zh' && team.nameZh) || team.name;
  const teamDesc = (team: TeamDefinitionLike) => (language === 'zh' && team.descriptionZh) || team.description;
  const teamScenario = (team: TeamDefinitionLike) => (language === 'zh' && team.scenarioZh) || team.scenario;
  const agentLabel = (agent?: AgentDefinitionLike) => (agent ? (language === 'zh' && agent.nameZh) || agent.name : undefined);
  const agentDesc = (agent?: AgentDefinitionLike) => (agent ? (language === 'zh' && agent.descriptionZh) || agent.description : undefined);
  const memberRoleLabel = (member: TeamMemberLike) => (language === 'zh' && member.roleZh) || member.role;

  const agentById = useMemo(() => {
    const map = new Map<string, AgentDefinitionLike>();
    agents.forEach((a) => map.set(a.id, a));
    return map;
  }, [agents]);

  const templates = teams.filter((tm) => tm.builtIn);
  const myTeams = teams.filter((tm) => !tm.builtIn);
  const selected = teams.find((tm) => tm.id === selectedId);

  const handleClone = async (templateId: string) => {
    if (!window.medscience?.teams) return;
    setBusyAction(`clone-${templateId}`);
    try {
      const result = await window.medscience.teams.cloneTemplate(templateId);
      if (result?.success && result.team) {
        await load();
        setSelectedId(result.team.id);
      } else {
        setError(result?.errors?.join(' ') || t('Failed to clone team.', '复制小队失败。'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(undefined);
    }
  };

  const handleArchive = async (id: string) => {
    if (!window.medscience?.teams) return;
    setBusyAction(`archive-${id}`);
    try {
      await window.medscience.teams.archive(id);
      await load();
      setSelectedId((current) => (current === id ? undefined : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(undefined);
    }
  };

  const handleStartRun = async () => {
    if (!window.medscience?.teams || !selected || !inquiry.trim()) return;
    setStarting(true);
    setError(undefined);
    try {
      const record = await window.medscience.teams.run.start(selected.id, inquiry.trim(), undefined, activeWorkspaceId);
      setActiveRun(record as unknown as TeamRunRecordLike);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  const handleOpenRun = async (runId: string) => {
    if (!window.medscience?.teams) return;
    try {
      const record = await window.medscience.teams.run.get(runId);
      if (record) setActiveRun(record as unknown as TeamRunRecordLike);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const runAction = async (action: 'approvePlan' | 'pause' | 'resume' | 'cancel') => {
    if (!activeRun || !window.medscience?.teams) return;
    setRunActionBusy(true);
    try {
      await window.medscience.teams.run[action](activeRun.run.id);
      const updated = await window.medscience.teams.run.get(activeRun.run.id);
      if (updated) setActiveRun(updated as unknown as TeamRunRecordLike);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunActionBusy(false);
    }
  };

  const renderTeamCard = (team: TeamDefinitionLike) => {
    const isActive = team.id === selectedId;
    return (
      <button
        key={team.id}
        onClick={() => setSelectedId(team.id)}
        className={`w-full text-left p-3.5 rounded-xl border transition-all ${
          isActive
            ? 'border-accent/50 bg-accent/5 shadow-xs'
            : 'border-border bg-bg-surface hover:border-accent/30 hover:bg-bg-hover'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[13.5px] font-semibold text-text-primary truncate">{teamLabel(team)}</h4>
          {team.builtIn ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted border border-border-subtle shrink-0">
              {t('Template', '模板')}
            </span>
          ) : (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
              {t('My Team', '我的小队')}
            </span>
          )}
        </div>
        <p className="text-[11.5px] text-text-secondary mt-1 line-clamp-2 leading-relaxed">{teamDesc(team)}</p>
        <div className="flex items-center gap-1.5 mt-2 text-[10.5px] text-text-muted">
          <Users size={11} />
          <span>{t(`${team.members.length} members`, `${team.members.length} 名成员`)}</span>
        </div>
      </button>
    );
  };

  const statusLabel = (status: string) => {
    const pair = STATUS_LABEL[status];
    return pair ? t(pair[0], pair[1]) : status;
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 sm:p-10 max-w-[1300px] mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-accent/10 text-accent">
            <Users size={22} />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-text-primary">{t('Research Teams', '科研小队')}</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              {t(
                'A leader-driven research crew: a Principal Investigator plans a task graph and only wakes the specialists it needs.',
                '由队长驱动的科研工作流：主要研究员规划任务图，只按需唤醒相关专业成员。'
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg bg-bg-elevated text-text-muted border border-border-subtle">
          <Layers size={14} />
          <span>{t('API-backed execution', 'API 后端执行')}</span>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-text-muted gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" />
          <span>{t('Loading teams…', '正在加载小队…')}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 mt-6">
          {/* Left column: template + my-team lists */}
          <div className="space-y-6">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2 px-1">
                {t('Built-in Templates', '内置模板')}
              </h3>
              <div className="space-y-2">{templates.map(renderTeamCard)}</div>
            </div>
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2 px-1">
                {t('My Teams', '我的小队')}
              </h3>
              {myTeams.length === 0 ? (
                <p className="text-[11.5px] text-text-muted px-1 leading-relaxed">
                  {t(
                    'Customize a template below to create your first team.',
                    '在下方选择一个模板并点击“自定义”，即可创建你的第一支小队。'
                  )}
                </p>
              ) : (
                <div className="space-y-2">{myTeams.map(renderTeamCard)}</div>
              )}
            </div>
          </div>

          {/* Right column: detail panel */}
          <div className="min-w-0">
            {!selected ? (
              <div className="p-12 text-center rounded-2xl bg-bg-surface border border-border border-dashed">
                <p className="text-sm text-text-secondary">{t('Select a team to view its configuration.', '选择一个小队以查看其配置。')}</p>
              </div>
            ) : (
              <div className="rounded-2xl bg-bg-surface border border-border p-6 space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-text-primary">{teamLabel(selected)}</h3>
                    <p className="text-[13px] text-text-secondary mt-1 leading-relaxed">{teamDesc(selected)}</p>
                    {teamScenario(selected) && (
                      <p className="text-[12px] text-text-muted mt-1.5">
                        <span className="font-medium">{t('Best for: ', '适用场景：')}</span>
                        {teamScenario(selected)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selected.builtIn ? (
                      <button
                        onClick={() => handleClone(selected.id)}
                        disabled={busyAction === `clone-${selected.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors shadow-sm disabled:opacity-60"
                      >
                        {busyAction === `clone-${selected.id}` ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Copy size={13} />
                        )}
                        <span>{t('Customize', '自定义')}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleArchive(selected.id)}
                        disabled={busyAction === `archive-${selected.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:border-red-500/40 bg-bg-elevated hover:bg-red-500/5 text-text-secondary hover:text-red-500 text-xs font-medium transition-all disabled:opacity-60"
                      >
                        {busyAction === `archive-${selected.id}` ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Archive size={13} />
                        )}
                        <span>{t('Archive', '归档')}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Budget / mode row */}
                <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                  <span className="px-2.5 py-1 rounded-lg bg-bg-elevated text-text-secondary border border-border-subtle">
                    {t('Max concurrency: ', '最大并发：')}{selected.maxConcurrency}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-bg-elevated text-text-secondary border border-border-subtle">
                    {t('Max tasks: ', '最大任务数：')}{selected.maxTasks}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-bg-elevated text-text-secondary border border-border-subtle">
                    {t('Max revisions/task: ', '每任务最大修订次数：')}{selected.maxRevisionsPerTask}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-bg-elevated text-text-secondary border border-border-subtle">
                    {selected.planningMode === 'review-first'
                      ? t('Plan review required before running', '运行前需审核计划')
                      : t('Automatic planning', '自动规划')}
                  </span>
                </div>

                {/* Team instructions */}
                {selected.instructions && (
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1.5">
                      {t('Team Instructions', '小队统一指令')}
                    </h4>
                    <p className="text-[12.5px] text-text-secondary leading-relaxed bg-bg-elevated border border-border-subtle rounded-lg p-3">
                      {selected.instructions}
                    </p>
                  </div>
                )}

                {/* Members */}
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2">
                    {t('Members', '成员')}
                  </h4>
                  <div className="space-y-2">
                    {selected.members.map((member) => {
                      const agent = agentById.get(member.agentId);
                      const isLeader = member.agentId === selected.leaderAgentId && member.canLead;
                      return (
                        <div
                          key={member.agentId}
                          className="p-3 rounded-xl border border-border bg-bg-elevated flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isLeader && <Crown size={13} className="text-amber-500 shrink-0" />}
                              <span className="text-[13px] font-semibold text-text-primary">
                                {agentLabel(agent) || member.agentId}
                              </span>
                              <span className="text-[11px] text-text-muted">· {memberRoleLabel(member)}</span>
                              {!member.required && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-surface text-text-muted border border-border-subtle">
                                  {t('optional', '可选')}
                                </span>
                              )}
                              {agent?.privacyClass === 'sensitive-clinical' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  <ShieldAlert size={10} />
                                  {t('clinical-sensitive', '临床敏感')}
                                </span>
                              )}
                            </div>
                            {agentDesc(agent) && (
                              <p className="text-[11.5px] text-text-secondary mt-1 leading-relaxed">{agentDesc(agent)}</p>
                            )}
                            {agent && agent.capabilityTags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {agent.capabilityTags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-surface text-text-muted border border-border-subtle"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {agent && (
                            <div className="flex items-center gap-1.5 text-[10.5px] text-text-muted shrink-0">
                              <Wrench size={11} />
                              <span>{agent.allowedToolCategories.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Start a research run */}
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2 flex items-center gap-1.5">
                    <Play size={12} />
                    {t('Start a Team Run', '发起小队运行')}
                  </h4>
                  <div className="space-y-2">
                    <textarea
                      value={inquiry}
                      onChange={(e) => setInquiry(e.target.value)}
                      placeholder={t('What should this team investigate?', '这支小队要研究什么问题？')}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border-subtle focus:border-accent text-[13px] text-text-primary placeholder:text-text-muted resize-none"
                    />
                    <button
                      onClick={handleStartRun}
                      disabled={starting || !inquiry.trim()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors shadow-sm disabled:opacity-60"
                    >
                      {starting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                      <span>{t('Start Team Run', '开始运行')}</span>
                    </button>
                  </div>
                </div>

                {/* Active/selected run viewer */}
                {activeRun && (
                  <div className="rounded-xl border border-border bg-bg-elevated p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-text-primary">{statusLabel(activeRun.run.status)}</span>
                        <span className="text-[11px] text-text-muted truncate max-w-[320px]">"{activeRun.run.inquiry}"</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {activeRun.run.status === 'awaiting-plan-approval' && (
                          <button
                            onClick={() => runAction('approvePlan')}
                            disabled={runActionBusy}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent text-white text-[11px] font-medium disabled:opacity-60"
                          >
                            <CheckCircle2 size={12} />
                            {t('Approve plan', '批准计划')}
                          </button>
                        )}
                        {activeRun.run.status === 'running' && (
                          <button
                            onClick={() => runAction('pause')}
                            disabled={runActionBusy}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-text-secondary text-[11px] font-medium disabled:opacity-60"
                          >
                            <Pause size={12} />
                            {t('Pause', '暂停')}
                          </button>
                        )}
                        {activeRun.run.status === 'awaiting-user' && (
                          <button
                            onClick={() => runAction('resume')}
                            disabled={runActionBusy}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent text-white text-[11px] font-medium disabled:opacity-60"
                          >
                            <Play size={12} />
                            {t('Resume', '继续')}
                          </button>
                        )}
                        {!SETTLED_STATUSES.has(activeRun.run.status) && (
                          <button
                            onClick={() => runAction('cancel')}
                            disabled={runActionBusy}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border hover:border-red-500/40 text-text-secondary hover:text-red-500 text-[11px] font-medium disabled:opacity-60"
                          >
                            <XCircle size={12} />
                            {t('Cancel', '取消')}
                          </button>
                        )}
                      </div>
                    </div>

                    {activeRun.tasks.length > 0 && (
                      <div className="space-y-1.5">
                        {activeRun.tasks.map((task) => (
                          <div key={task.id} className="flex items-center gap-2 text-[12px]">
                            <Clock size={11} className={TASK_STATUS_COLOR[task.status] || 'text-text-muted'} />
                            <span className="text-text-primary truncate">{task.title}</span>
                            <span className="text-text-muted">· {agentLabel(agentById.get(task.assignedAgentId)) || task.assignedAgentId}</span>
                            <span className={`ml-auto font-mono text-[10.5px] ${TASK_STATUS_COLOR[task.status] || 'text-text-muted'}`}>{task.status}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeRun.run.failure && (
                      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[11.5px]">
                        <AlertCircle size={13} className="shrink-0 mt-0.5" />
                        <span>{activeRun.run.failure.message}</span>
                      </div>
                    )}

                    {activeRun.run.qualityGate && activeRun.run.qualityGate.verdict !== 'passed' && (
                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11.5px] space-y-1">
                        <div className="font-medium">{t('Scientific Critic gate: ', '科学审稿门：')}{activeRun.run.qualityGate.verdict}</div>
                        {activeRun.run.qualityGate.issues.map((issue, i) => (
                          <div key={i}>· {issue}</div>
                        ))}
                      </div>
                    )}

                    {activeRun.run.report && (
                      <div className="space-y-1.5">
                        <h5 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted flex items-center gap-1.5">
                          <FileText size={11} />
                          {t('Final Report', '最终报告')}
                        </h5>
                        <p className="text-[12.5px] text-text-primary leading-relaxed whitespace-pre-wrap bg-bg-surface border border-border-subtle rounded-lg p-3">
                          {activeRun.run.report.narrative}
                        </p>
                        {activeRun.run.report.evidenceIds.length > 0 && (
                          <p className="text-[11px] text-text-muted">
                            {t('Evidence: ', '证据：')}{activeRun.run.report.evidenceIds.join(', ')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Recent runs */}
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2 flex items-center gap-1.5">
                    <GitBranch size={12} />
                    {t('Recent Team Runs', '最近运行')}
                  </h4>
                  {recentRuns.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-border text-[12px] text-text-muted leading-relaxed">
                      {t('No runs yet for this team.', '这支小队还没有运行记录。')}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {recentRuns.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => handleOpenRun(r.id)}
                          className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] transition-colors ${
                            activeRun?.run.id === r.id ? 'border-accent/50 bg-accent/5' : 'border-border-subtle bg-bg-elevated hover:bg-bg-hover'
                          }`}
                        >
                          <span className="truncate flex-1 text-text-primary">{r.inquiry}</span>
                          <span className={`font-mono text-[10.5px] shrink-0 ${TASK_STATUS_COLOR[r.status] || 'text-text-muted'}`}>{statusLabel(r.status)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
