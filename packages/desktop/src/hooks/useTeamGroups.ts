import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentDefinition, ResearchTeamDefinition, RuntimeEvent, TeamRunRecord } from '@medscience/core';
import { useWorkspaces } from '../context/WorkspaceContext';
import { useLanguage } from '../context/LanguageContext';
import { buildGroupMessages, GroupMessage, lastMessagePreview, latestMessageAt, unreadCount } from '../lib/teamChat';
import { getAllGroupPrefs, getGroupPrefs, GroupPrefs, setGroupPrefs } from '../lib/groupPrefs';

/**
 * All the state behind the group-chat page: the workspace's groups, the
 * member (agent) catalog, and the selected group's transcript.
 *
 * Updates are event-driven. The orchestrator already emits team.* events
 * onto the shared bus, and both hosts forward that bus to the renderer, so
 * this subscribes and re-reads the affected run. The previous Research
 * Teams view instead polled team:run:get every 1.5s, which cannot carry a
 * chat UI: messages arrived in 1.5s batches and "typing" was meaningless.
 *
 * It lives in a hook rather than in AgentContext because AgentContext is
 * already an 881-line god context for single-agent sessions; group state
 * has no reason to be global -- only this page reads it.
 */
export interface GroupSummary {
  team: ResearchTeamDefinition;
  prefs: GroupPrefs;
  preview: string;
  latestAt?: string;
  unread: number;
  /** Status of this group's most recent run, if any. */
  runStatus?: string;
}

const EMPTY_MESSAGES: GroupMessage[] = [];

export function useTeamGroups() {
  const { activeWorkspaceId } = useWorkspaces();
  const { t, language } = useLanguage();

  const [teams, setTeams] = useState<ResearchTeamDefinition[]>([]);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>();
  const [records, setRecords] = useState<TeamRunRecord[]>([]);
  const [previewRecords, setPreviewRecords] = useState<Record<string, TeamRunRecord[]>>({});
  const [prefsVersion, setPrefsVersion] = useState(0);
  const [busy, setBusy] = useState<string | undefined>();

  const selectedTeamIdRef = useRef<string | undefined>();
  selectedTeamIdRef.current = selectedTeamId;
  // Read by the event subscription below, which must not resubscribe every
  // time the transcript changes (it would tear down the listener on every
  // incoming event).
  const recordsRef = useRef<TeamRunRecord[]>([]);
  recordsRef.current = records;
  /** Once the user opens a group themselves, stop auto-following the newest one. */
  const userPickedRef = useRef(false);

  const api = typeof window !== 'undefined' ? window.medscience : undefined;

  const agentById = useMemo(() => {
    const map = new Map<string, AgentDefinition>();
    agents.forEach((agent) => map.set(agent.id, agent));
    return map;
  }, [agents]);

  const nameOf = useCallback(
    (agentId: string) => {
      const agent = agentById.get(agentId);
      if (!agent) return agentId;
      return (language === 'zh' && agent.nameZh) || agent.name;
    },
    [agentById, language]
  );

  // ---- loading -------------------------------------------------------------

  const loadTeams = useCallback(async () => {
    if (!api?.teams) {
      setError(t('Research teams are not available in this build.', '当前构建不支持科研小队功能。'));
      setLoading(false);
      return;
    }
    try {
      const [teamList, agentList] = await Promise.all([
        api.teams.list(false, activeWorkspaceId),
        api.teams.listAgents(),
      ]);
      setTeams(teamList);
      setAgents(agentList);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api, activeWorkspaceId, t]);

  useEffect(() => {
    setLoading(true);
    userPickedRef.current = false;
    setSelectedTeamId(undefined);
    setRecords([]);
    setPreviewRecords({});
    void loadTeams();
  }, [loadTeams]);

  /** Own groups only -- built-in templates are offered when creating a group, not chatted with. */
  const ownGroups = useMemo(() => teams.filter((team) => !team.builtIn), [teams]);
  /**
   * Suggestions, minus the ones this workspace has already acted on: a
   * roster you have already built a team from is not a suggestion any more,
   * and leaving it in the list is what made suggestions and real teams look
   * like the same thing.
   */
  const templates = useMemo(() => {
    const used = new Set(
      teams.filter((team) => !team.builtIn).map((team) => team.clonedFromTemplateId).filter(Boolean) as string[]
    );
    return teams.filter((team) => team.builtIn && !used.has(team.id));
  }, [teams]);

  // Opening the page lands on the group with the newest activity, which is
  // the first row of the list (see `summaries` below for the ordering).
  const defaultTeamId = useMemo(() => {
    if (ownGroups.length === 0) return undefined;
    const withActivity = [...ownGroups].sort((a, b) => {
      const at = previewRecords[a.id]?.[0]?.run.startedAt || '';
      const bt = previewRecords[b.id]?.[0]?.run.startedAt || '';
      return Date.parse(bt || '0') - Date.parse(at || '0');
    });
    return withActivity[0].id;
  }, [ownGroups, previewRecords]);

  useEffect(() => {
    // Run previews arrive after the team list, so the "newest activity"
    // answer changes once; follow it until the user picks a group.
    if (userPickedRef.current) return;
    if (defaultTeamId && defaultTeamId !== selectedTeamId) setSelectedTeamId(defaultTeamId);
  }, [defaultTeamId, selectedTeamId]);

  const selectTeam = useCallback((teamId: string) => {
    userPickedRef.current = true;
    setSelectedTeamId(teamId);
  }, []);

  // One record per group is enough for the list preview; the open group
  // loads its full history below.
  useEffect(() => {
    if (!api?.teams || ownGroups.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        ownGroups.map(async (team) => {
          try {
            return [team.id, await api.teams.run.history(team.id, activeWorkspaceId, 1)] as const;
          } catch {
            return [team.id, [] as TeamRunRecord[]] as const;
          }
        })
      );
      if (!cancelled) setPreviewRecords(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [api, ownGroups, activeWorkspaceId]);

  const loadHistory = useCallback(
    async (teamId: string) => {
      if (!api?.teams) return;
      try {
        const history = await api.teams.run.history(teamId, activeWorkspaceId, 5);
        if (selectedTeamIdRef.current === teamId) setRecords(history);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [api, activeWorkspaceId]
  );

  useEffect(() => {
    setRecords([]);
    if (selectedTeamId) void loadHistory(selectedTeamId);
  }, [selectedTeamId, loadHistory]);

  // ---- live updates --------------------------------------------------------

  useEffect(() => {
    if (!api?.agent?.onEvent) return;
    let pending: number | undefined;

    const refresh = (teamId: string) => {
      if (pending) window.clearTimeout(pending);
      // A single orchestrator step emits several events back to back; one
      // coalesced re-read per burst keeps the transcript in order without a
      // request per event.
      pending = window.setTimeout(() => {
        if (selectedTeamIdRef.current === teamId) void loadHistory(teamId);
        void (async () => {
          try {
            const latest = await api.teams.run.history(teamId, activeWorkspaceId, 1);
            setPreviewRecords((prev) => ({ ...prev, [teamId]: latest }));
          } catch {
            // preview is best-effort
          }
        })();
      }, 150);
    };

    const unsubscribe = api.agent.onEvent((event: RuntimeEvent) => {
      if (!event.type.startsWith('team.')) return;
      const teamRunId = (event.payload as { teamRunId?: string }).teamRunId;
      if (!teamRunId) return;
      const known = recordsRef.current.find((record) => record.run.id === teamRunId);
      if (known) {
        refresh(known.run.teamId);
        return;
      }
      // A run this view has not loaded yet (e.g. one just started, or one
      // belonging to another group in the list): resolve its team once.
      void (async () => {
        try {
          const record = await api.teams.run.get(teamRunId);
          if (record) refresh(record.run.teamId);
        } catch {
          // ignore: a run we cannot read cannot be rendered either
        }
      })();
    });

    return () => {
      if (pending) window.clearTimeout(pending);
      unsubscribe();
    };
  }, [api, loadHistory, activeWorkspaceId]);

  // ---- derived -------------------------------------------------------------

  const messages = useMemo(() => (records.length > 0 ? buildGroupMessages(records, t) : EMPTY_MESSAGES), [records, t]);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId),
    [teams, selectedTeamId]
  );

  const activeRun = useMemo(() => {
    const unsettled = records.find((record) => !['completed', 'failed', 'cancelled'].includes(record.run.status));
    return unsettled || records[0];
  }, [records]);

  const summaries = useMemo<GroupSummary[]>(() => {
    const allPrefs = getAllGroupPrefs(activeWorkspaceId);
    void prefsVersion; // recompute when preferences change
    return ownGroups
      .map((team) => {
        const teamRecords = team.id === selectedTeamId && records.length > 0 ? records : previewRecords[team.id] || [];
        const teamMessages = teamRecords.length > 0 ? buildGroupMessages(teamRecords, t) : EMPTY_MESSAGES;
        const stored = allPrefs[team.id] as Partial<GroupPrefs> | undefined;
        const prefs: GroupPrefs = { pinned: false, muted: false, ...stored };
        const preview = teamMessages.length
          ? lastMessagePreview(teamMessages, nameOf, t)
          : t('No inquiry yet — send the leader the first one.', '还没有课题，给队长发第一条吧。');
        return {
          team,
          prefs,
          preview,
          latestAt: latestMessageAt(teamMessages),
          unread: unreadCount(teamMessages, prefs.lastReadAt),
          runStatus: teamRecords[0]?.run.status,
        };
      })
      .sort((a, b) => {
        if (a.prefs.pinned !== b.prefs.pinned) return a.prefs.pinned ? -1 : 1;
        return Date.parse(b.latestAt || '0') - Date.parse(a.latestAt || '0');
      });
  }, [ownGroups, previewRecords, records, selectedTeamId, activeWorkspaceId, prefsVersion, nameOf, t]);

  // Opening a group marks it read.
  useEffect(() => {
    if (!selectedTeamId || messages.length === 0) return;
    const newest = latestMessageAt(messages);
    if (!newest) return;
    const current = getGroupPrefs(activeWorkspaceId, selectedTeamId);
    if (current.lastReadAt === newest) return;
    setGroupPrefs(activeWorkspaceId, selectedTeamId, { lastReadAt: newest });
    setPrefsVersion((v) => v + 1);
  }, [selectedTeamId, messages, activeWorkspaceId]);

  // ---- actions -------------------------------------------------------------

  const withBusy = useCallback(async <T,>(key: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(key);
    setError(undefined);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return undefined;
    } finally {
      setBusy(undefined);
    }
  }, []);

  const saveTeam = useCallback(
    async (team: ResearchTeamDefinition) => {
      if (!api?.teams) return false;
      const result = await withBusy(`save-${team.id}`, () => api.teams.update(team));
      if (result && !result.success) {
        setError(result.errors?.join(' '));
        return false;
      }
      await loadTeams();
      return Boolean(result?.success);
    },
    [api, withBusy, loadTeams]
  );

  const createGroup = useCallback(
    async (draft: Omit<ResearchTeamDefinition, 'id' | 'builtIn' | 'archived' | 'version' | 'createdAt' | 'updatedAt'>) => {
      if (!api?.teams) return undefined;
      const result = await withBusy('create', () =>
        api.teams.create({ ...draft, workspaceId: activeWorkspaceId } as ResearchTeamDefinition)
      );
      if (result && !result.success) {
        setError(result.errors?.join(' '));
        return undefined;
      }
      await loadTeams();
      // Treat creating a group as picking it: the newly created chat should
      // stay open even though it has no activity yet.
      if (result?.team) {
        userPickedRef.current = true;
        setSelectedTeamId(result.team.id);
      }
      return result?.team;
    },
    [api, withBusy, loadTeams, activeWorkspaceId]
  );

  const archiveGroup = useCallback(
    async (teamId: string) => {
      if (!api?.teams) return;
      await withBusy(`archive-${teamId}`, () => api.teams.archive(teamId));
      setSelectedTeamId((current) => (current === teamId ? undefined : current));
      await loadTeams();
    },
    [api, withBusy, loadTeams]
  );

  const updatePrefs = useCallback(
    (teamId: string, patch: Partial<GroupPrefs>) => {
      setGroupPrefs(activeWorkspaceId, teamId, patch);
      setPrefsVersion((v) => v + 1);
    },
    [activeWorkspaceId]
  );

  const startRun = useCallback(
    async (teamId: string, inquiry: string) => {
      if (!api?.teams) return;
      await withBusy('start-run', async () => {
        const record = await api.teams.run.start(teamId, inquiry, undefined, activeWorkspaceId);
        setRecords((prev) => [record, ...prev.filter((r) => r.run.id !== record.run.id)]);
        return record;
      });
      await loadHistory(teamId);
    },
    [api, withBusy, activeWorkspaceId, loadHistory]
  );

  const runAction = useCallback(
    async (action: 'approvePlan' | 'pause' | 'resume' | 'cancel', runId: string) => {
      if (!api?.teams) return;
      await withBusy(`run-${action}`, async () => {
        await (api.teams.run[action] as (id: string) => Promise<unknown>)(runId);
      });
      if (selectedTeamIdRef.current) await loadHistory(selectedTeamIdRef.current);
    },
    [api, withBusy, loadHistory]
  );

  return {
    loading,
    error,
    setError,
    busy,
    teams,
    templates,
    groups: summaries,
    agents,
    agentById,
    nameOf,
    selectedTeam,
    selectedTeamId,
    setSelectedTeamId: selectTeam,
    messages,
    records,
    activeRun,
    reloadTeams: loadTeams,
    saveTeam,
    createGroup,
    archiveGroup,
    updatePrefs,
    startRun,
    runAction,
  };
}
