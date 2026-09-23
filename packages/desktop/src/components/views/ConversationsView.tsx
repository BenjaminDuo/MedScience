import React, { useEffect, useMemo, useState } from 'react';
import type { ResearchTeamDefinition, ResearchTeamMember } from '@medscience/core';
import { AlertCircle, Loader2, MessagesSquare } from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';
import { useWorkspaces } from '../../context/WorkspaceContext';
import { useTeamGroups } from '../../hooks/useTeamGroups';
import { getGroupPrefs } from '../../lib/groupPrefs';
import { isRunSettled } from '../../lib/teamChat';
import {
  buildMemberRows,
  ConversationRow,
  GENERAL_EXPERT_ID,
  MemberRow,
  sortRows,
} from '../../lib/conversationRows';
import { ContactsList } from '../teams/ContactsList';
import { ConversationList, SearchHit } from '../teams/ConversationList';
import { GroupChat } from '../teams/GroupChat';
import { GroupInfoPanel } from '../teams/GroupInfoPanel';
import { MemberChat } from '../teams/MemberChat';
import { MemberCardModal } from '../teams/MemberCardModal';
import { MemberInfoPanel } from '../teams/MemberInfoPanel';
import { MemberPickerModal, MemberPickerResult } from '../teams/MemberPickerModal';
import { canLeadAgent } from '../teams/agentIdentity';

type Selection = { kind: 'member'; agentId: string } | { kind: 'team'; teamId: string };

/**
 * 对话: everything you can talk to in this workspace.
 *
 * One list, two kinds of row -- a member you talk to 1:1, or a team. A 1:1
 * conversation IS "talk to a member", so there is no separate "new
 * conversation" concept: you pick who to talk to, and each conversation you
 * start with them becomes a 课题 inside that member's thread. That keeps the
 * list bounded (members you use + teams you built), which is what stops
 * teams from being buried under dozens of conversations -- and it is why the
 * workspace tree no longer needs a separate 对话 entry.
 */
export const ConversationsView: React.FC = () => {
  const { t, language } = useLanguage();
  const { activeWorkspaceId, getWorkspace } = useWorkspaces();
  const {
    sessions,
    currentSession,
    resetSession,
    openSession,
    renameSession,
    deleteSession,
    exportSession,
    refreshSessions,
  } = useAgent();
  const {
    loading,
    error,
    setError,
    busy,
    teams,
    templates,
    groups,
    agents,
    agentById,
    reloadTeams,
    selectedTeam,
    setSelectedTeamId,
    messages,
    activeRun,
    saveTeam,
    createGroup,
    archiveGroup,
    updatePrefs,
    startRun,
    runAction,
  } = useTeamGroups();

  const [tab, setTab] = useState<'conversations' | 'members'>('conversations');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Selection>({ kind: 'member', agentId: GENERAL_EXPERT_ID });
  const [draft, setDraft] = useState('');
  // Closed by default: the chat is what you came for. The panel is one
  // click away in the header, and its open/closed state is remembered for
  // the rest of the session once you do open it.
  const [infoOpen, setInfoOpen] = useState(false);
  const [picker, setPicker] = useState<'create' | 'add' | undefined>();
  const [memberCardId, setMemberCardId] = useState<string | undefined>();
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [expandedAgentIds, setExpandedAgentIds] = useState<string[]>([]);
  const [pickerTemplateId, setPickerTemplateId] = useState<string | undefined>();

  const workspaceName = getWorkspace(activeWorkspaceId)?.title;
  const live = Boolean(activeRun && !isRunSettled(activeRun.run.status));

  // ---- rows -----------------------------------------------------------------

  const memberRows = useMemo(
    () => buildMemberRows(sessions, activeWorkspaceId),
    [sessions, activeWorkspaceId]
  );

  const rows = useMemo<ConversationRow[]>(() => {
    const teamRows: ConversationRow[] = groups.map((group) => ({
      kind: 'team',
      group,
      latestAt: group.latestAt,
      pinned: group.prefs.pinned,
    }));
    return sortRows([...memberRows, ...teamRows]);
  }, [memberRows, groups]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      if (row.kind === 'member') {
        const agent = agentById.get(row.agentId);
        const name = ((language === 'zh' && agent?.nameZh) || agent?.name || row.agentId).toLowerCase();
        return name.includes(needle);
      }
      const name = ((language === 'zh' && row.group.team.nameZh) || row.group.team.name).toLowerCase();
      return name.includes(needle);
    });
  }, [rows, query, agentById, language]);

  /**
   * Search goes into the message bodies, not just titles: a title is the
   * first sentence truncated, so title-only search could not find most of
   * what was actually said. Each conversation contributes at most one hit,
   * with the matched text in context, and opening a hit opens that
   * conversation.
   */
  const searchHits = useMemo<SearchHit[]>(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const hits: SearchHit[] = [];
    for (const row of memberRows) {
      for (const session of row.sessions) {
        const match = session.messages.find((message) => message.content?.toLowerCase().includes(needle));
        if (!match) continue;
        const text = match.content.replace(/\s+/g, ' ');
        const at = text.toLowerCase().indexOf(needle);
        const from = Math.max(0, at - 40);
        hits.push({
          session,
          agentId: row.agentId,
          snippet: `${from > 0 ? '…' : ''}${text.slice(from, at + needle.length + 60)}${
            at + needle.length + 60 < text.length ? '…' : ''
          }`,
        });
        if (hits.length >= 40) return hits;
      }
    }
    return hits;
  }, [query, memberRows]);

  const selectedMemberRow: MemberRow | undefined =
    selection.kind === 'member'
      ? memberRows.find((row) => row.agentId === selection.agentId) || {
          kind: 'member',
          agentId: selection.agentId,
          sessions: [],
          topicCount: 0,
          pinned: selection.agentId === GENERAL_EXPERT_ID,
          latestAt: undefined,
        }
      : undefined;

  // Selecting a team row drives the team hook; selecting a member opens that
  // member's most recent topic so the composer continues it.
  useEffect(() => {
    if (selection.kind === 'team') {
      setSelectedTeamId(selection.teamId);
      return;
    }
    const row = memberRows.find((candidate) => candidate.agentId === selection.agentId);
    const newest = row?.sessions[row.sessions.length - 1];
    if (newest && currentSession.id !== newest.id && currentSession.agentId !== selection.agentId) {
      openSession(newest.id);
    } else if (!newest && currentSession.agentId !== selection.agentId) {
      resetSession('research', activeWorkspaceId, 'general', selection.agentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, memberRows.length]);

  const handleSelect = (row: ConversationRow) => {
    setSelection(row.kind === 'member' ? { kind: 'member', agentId: row.agentId } : { kind: 'team', teamId: row.group.team.id });
    setDraft('');
  };

  const startChatWith = (agentId: string) => {
    setMemberCardId(undefined);
    setTab('conversations');
    setSelection({ kind: 'member', agentId });
    const row = memberRows.find((candidate) => candidate.agentId === agentId);
    if (!row || row.sessions.length === 0) {
      resetSession('research', activeWorkspaceId, 'general', agentId);
    } else {
      openSession(row.sessions[row.sessions.length - 1].id);
    }
  };

  const handleNewConversation = (agentId: string) => {
    resetSession('research', activeWorkspaceId, 'general', agentId);
  };

  const handleOpenSession = (agentId: string, sessionId: string) => {
    setTab('conversations');
    setSelection({ kind: 'member', agentId });
    openSession(sessionId);
  };

  const toggleExpand = (agentId: string) =>
    setExpandedAgentIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId]
    );

  // ---- team actions (unchanged behaviour, reused from the team hook) --------

  const handleCreate = async (result: MemberPickerResult) => {
    const draftTeam = {
      name: result.name,
      description: t('Created from the team picker.', '由「拉起科研小队」创建。'),
      scenario: '',
      leaderAgentId: result.leaderAgentId,
      instructions: '',
      members: result.agentIds.map<ResearchTeamMember>((agentId) => ({
        agentId,
        role: agentId === result.leaderAgentId ? 'Team Leader' : 'Member',
        roleZh: agentId === result.leaderAgentId ? '队长' : '成员',
        required: agentId === result.leaderAgentId,
        canLead: canLeadAgent(agentById.get(agentId)),
      })),
      maxConcurrency: 3,
      maxTasks: 10,
      maxRevisionsPerTask: 2,
      planningMode: 'review-first' as const,
      clonedFromTemplateId: result.templateId,
    };
    const created = await createGroup(draftTeam as any);
    if (created) {
      setPicker(undefined);
      setSelection({ kind: 'team', teamId: created.id });
    }
  };

  const handleAddMembers = async (result: MemberPickerResult) => {
    if (!selectedTeam) return;
    const additions = result.agentIds
      .filter((agentId) => !selectedTeam.members.some((member) => member.agentId === agentId))
      .map<ResearchTeamMember>((agentId) => ({
        agentId,
        role: 'Member',
        roleZh: '成员',
        required: false,
        canLead: canLeadAgent(agentById.get(agentId)),
      }));
    if (additions.length === 0) {
      setPicker(undefined);
      return;
    }
    const saved = await saveTeam({ ...selectedTeam, members: [...selectedTeam.members, ...additions] });
    if (saved) setPicker(undefined);
  };

  const handleRemoveMember = async (agentId: string) => {
    if (!selectedTeam) return;
    if (agentId === selectedTeam.leaderAgentId) {
      setError(t('Promote another member to leader before removing this one.', '请先将其他成员设为队长，再移出当前队长。'));
      return;
    }
    if (selectedTeam.members.length <= 1) {
      setError(t('A team needs at least one member.', '小队至少需要保留一名成员。'));
      return;
    }
    await saveTeam({ ...selectedTeam, members: selectedTeam.members.filter((m) => m.agentId !== agentId) });
    setMemberCardId(undefined);
  };

  const handleSetLeader = async (agentId: string) => {
    if (!selectedTeam) return;
    if (live) {
      setError(t('Cannot transfer leadership while a run is in flight.', '课题运行中无法转让队长。'));
      return;
    }
    const next: ResearchTeamDefinition = {
      ...selectedTeam,
      leaderAgentId: agentId,
      members: selectedTeam.members.map((member) =>
        member.agentId === agentId ? { ...member, canLead: true, required: true } : member
      ),
    };
    await saveTeam(next);
    setMemberCardId(undefined);
  };

  const handleSaveTeamMemberInstructions = async (agentId: string, instructions: string) => {
    if (!selectedTeam) return;
    await saveTeam({
      ...selectedTeam,
      members: selectedTeam.members.map((member) =>
        member.agentId === agentId ? { ...member, memberInstructions: instructions } : member
      ),
    });
    setMemberCardId(undefined);
  };

  // ---- member (account-wide) instructions -----------------------------------

  const handleSaveUserInstructions = async (agentId: string, instructions: string) => {
    if (!window.medscience?.teams) return;
    setSavingInstructions(true);
    try {
      const result = await window.medscience.teams.setAgentInstructions(agentId, instructions);
      if (result && result.success === false) setError(result.errors?.join(' '));
      await reloadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingInstructions(false);
    }
  };

  const teamsOfMember = (agentId: string): string[] =>
    teams
      .filter((team) => !team.builtIn && team.members.some((member) => member.agentId === agentId))
      .map((team) => (language === 'zh' && team.nameZh) || team.name);

  // Team actions (make leader / remove / team-only instructions) belong to
  // the team you are actually looking at. Opening the same card from 队员管理
  // while a member thread is selected must not offer to change a team that
  // is merely the team hook's last selection.
  const teamContext = selection.kind === 'team' ? selectedTeam : undefined;
  const memberCardMember = teamContext?.members.find((member) => member.agentId === memberCardId);

  if (loading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center gap-2 text-text-muted text-sm">
        <Loader2 size={16} className="animate-spin" />
        {t('Loading conversations…', '正在加载对话…')}
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex overflow-hidden">
      <div className="w-[296px] shrink-0 flex flex-col h-full">
        <div className="flex gap-0.5 px-2.5 pt-2.5 pb-1.5 bg-bg-surface border-r border-b border-border">
          {(['conversations', 'members'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex-1 py-1.5 rounded-lg text-[12.5px] transition-colors ${
                tab === value ? 'bg-bg-elevated text-text-primary font-semibold' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {value === 'conversations' ? t('Conversations', '对话') : t('Members', '队员管理')}
            </button>
          ))}
        </div>
        {tab === 'conversations' ? (
          <ConversationList
            rows={visibleRows}
            selectedKey={
              selection.kind === 'member'
                ? `member:${selection.agentId}`
                : `team:${selection.teamId}`
            }
            activeSessionId={currentSession.id}
            query={query}
            searchHits={searchHits}
            expandedAgentIds={expandedAgentIds}
            onQueryChange={setQuery}
            onSelect={handleSelect}
            onToggleExpand={toggleExpand}
            onOpenSession={handleOpenSession}
            onRenameSession={(sessionId, title) => void renameSession(sessionId, title).then(refreshSessions)}
            onDeleteSession={(sessionId) => void deleteSession(sessionId).then(refreshSessions)}
            onExportSession={(sessionId) => void exportSession(sessionId)}
            onCreateTeam={() => {
              setPickerTemplateId(undefined);
              setPicker('create');
            }}
            templates={templates}
            onUseTemplate={(templateId) => {
              setPickerTemplateId(templateId);
              setPicker('create');
            }}
            agentById={agentById}
            workspaceName={workspaceName}
          />
        ) : (
          <div className="flex-1 flex flex-col bg-bg-surface border-r border-border min-h-0">
            <ContactsList agents={agents} onOpen={(agentId) => setMemberCardId(agentId)} />
          </div>
        )}
      </div>

      {/* min-h-0: without it this column grows to its content's height, the
          chat pane below never becomes scrollable, and a long conversation
          simply runs off the bottom of the window. */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {error && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-500 text-xs">
            <AlertCircle size={13} className="shrink-0" />
            <span className="flex-1 min-w-0">{error}</span>
            <button onClick={() => setError(undefined)} className="text-[11px] underline">
              {t('Dismiss', '知道了')}
            </button>
          </div>
        )}
        <div className="flex-1 flex min-h-0">
          {selection.kind === 'member' && selectedMemberRow ? (
            <>
              <MemberChat
                agentId={selectedMemberRow.agentId}
                agent={agentById.get(selectedMemberRow.agentId)}
                sessions={selectedMemberRow.sessions}
                infoOpen={infoOpen}
                onToggleInfo={() => setInfoOpen((value) => !value)}
                onNewConversation={() => handleNewConversation(selectedMemberRow.agentId)}
                onOpenConversation={(sessionId) => openSession(sessionId)}
              />
              {infoOpen && (
                <MemberInfoPanel
                  agentId={selectedMemberRow.agentId}
                  agent={agentById.get(selectedMemberRow.agentId)}
                  sessions={selectedMemberRow.sessions}
                  teamNames={teamsOfMember(selectedMemberRow.agentId)}
                  savingInstructions={savingInstructions}
                  onSaveInstructions={(instructions) =>
                    void handleSaveUserInstructions(selectedMemberRow.agentId, instructions)
                  }
                />
              )}
            </>
          ) : selectedTeam ? (
            <>
              <GroupChat
                team={selectedTeam}
                messages={messages}
                agentById={agentById}
                activeRun={activeRun}
                busy={busy}
                draft={draft}
                onDraftChange={setDraft}
                onSend={() => {
                  const inquiry = draft.trim();
                  if (!inquiry) return;
                  setDraft('');
                  void startRun(selectedTeam.id, inquiry);
                }}
                onApprovePlan={() => activeRun && runAction('approvePlan', activeRun.run.id)}
                onRunAction={(action) => activeRun && runAction(action, activeRun.run.id)}
                onToggleInfo={() => setInfoOpen((value) => !value)}
                infoOpen={infoOpen}
              />
              {infoOpen && (
                <GroupInfoPanel
                  team={selectedTeam}
                  agentById={agentById}
                  prefs={getGroupPrefs(activeWorkspaceId, selectedTeam.id)}
                  live={live}
                  saving={busy?.startsWith('save-') ?? false}
                  onSave={(team) => void saveTeam(team)}
                  onPrefsChange={(patch) => updatePrefs(selectedTeam.id, patch)}
                  onAddMembers={() => setPicker('add')}
                  onOpenMember={(agentId) => setMemberCardId(agentId)}
                  onRemoveMember={(agentId) => void handleRemoveMember(agentId)}
                  onArchive={() => void archiveGroup(selectedTeam.id)}
                />
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
              <MessagesSquare size={28} className="text-text-muted" />
              <p className="text-sm text-text-secondary max-w-sm leading-relaxed">
                {t('Pick someone to talk to on the left.', '在左边选一个对话对象。')}
              </p>
            </div>
          )}
        </div>
      </div>

      {picker && (
        <MemberPickerModal
          mode={picker}
          agents={agents}
          templates={templates}
          initialTemplateId={picker === 'create' ? pickerTemplateId : undefined}
          existingAgentIds={picker === 'add' ? selectedTeam?.members.map((member) => member.agentId) : undefined}
          busy={busy === 'create' || busy?.startsWith('save-')}
          onClose={() => {
            setPicker(undefined);
            setPickerTemplateId(undefined);
          }}
          onSubmit={(result) => void (picker === 'create' ? handleCreate(result) : handleAddMembers(result))}
        />
      )}

      {memberCardId && (
        <MemberCardModal
          agentId={memberCardId}
          agent={agentById.get(memberCardId)}
          member={memberCardMember}
          isLeader={teamContext?.leaderAgentId === memberCardId}
          live={live}
          onClose={() => setMemberCardId(undefined)}
          onStartChat={() => startChatWith(memberCardId)}
          onSetLeader={memberCardMember ? () => void handleSetLeader(memberCardId) : undefined}
          onSaveInstructions={
            memberCardMember
              ? (instructions) => void handleSaveTeamMemberInstructions(memberCardId, instructions)
              : undefined
          }
          onRemove={memberCardMember ? () => void handleRemoveMember(memberCardId) : undefined}
        />
      )}
    </div>
  );
};
