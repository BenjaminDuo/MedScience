import React, { useEffect, useMemo, useState } from 'react';
import type { AgentDefinition, ResearchTeamDefinition } from '@medscience/core';
import { Check, Crown, Loader2, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { agentDescription, agentName, agentTitle, canLeadAgent } from './agentIdentity';
import { MemberAvatar } from './GroupAvatar';

export interface MemberPickerResult {
  agentIds: string[];
  leaderAgentId: string;
  name: string;
  /** Set when the user started from a built-in template. */
  templateId?: string;
}

interface MemberPickerModalProps {
  mode: 'create' | 'add';
  agents: AgentDefinition[];
  templates: ResearchTeamDefinition[];
  /** In 'add' mode: members already in the team, which cannot be picked again. */
  existingAgentIds?: string[];
  /** Open with this built-in roster already applied (from the suggested list). */
  initialTemplateId?: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (result: MemberPickerResult) => void;
}

/**
 * The "start a team" / "add members" picker: contacts on the left, the
 * selection on the right, and the built-in templates offered as one-tap
 * starting rosters rather than as teams you can chat with (a template's
 * record is a fixed constant -- chatting with it would mean editing it).
 */
export const MemberPickerModal: React.FC<MemberPickerModalProps> = ({
  mode,
  agents,
  templates,
  existingAgentIds = [],
  initialTemplateId,
  busy,
  onClose,
  onSubmit,
}) => {
  const { t, language } = useLanguage();
  const [selected, setSelected] = useState<string[]>([]);
  const [leaderAgentId, setLeaderAgentId] = useState<string>('');
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<string | undefined>();
  const [warning, setWarning] = useState<string | undefined>();

  const agentById = useMemo(() => {
    const map = new Map<string, AgentDefinition>();
    agents.forEach((agent) => map.set(agent.id, agent));
    return map;
  }, [agents]);

  useEffect(() => {
    if (mode !== 'create' || selected.length > 0) return;
    const preset = initialTemplateId ? templates.find((template) => template.id === initialTemplateId) : undefined;
    if (preset) {
      applyTemplate(preset);
      return;
    }
    // A team always needs a leader; the PI is the obvious default.
    const defaultLeader = agents.find((agent) => canLeadAgent(agent));
    if (defaultLeader) {
      setSelected([defaultLeader.id]);
      setLeaderAgentId(defaultLeader.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, agents, selected.length, initialTemplateId]);

  const applyTemplate = (template: ResearchTeamDefinition) => {
    const ids = template.members.map((member) => member.agentId);
    setSelected(ids);
    setLeaderAgentId(template.leaderAgentId);
    setTemplateId(template.id);
    setName((language === 'zh' && template.nameZh) || template.name);
    setWarning(undefined);
  };

  const toggle = (agentId: string) => {
    if (existingAgentIds.includes(agentId)) return;
    setTemplateId(undefined);
    setSelected((current) => {
      const next = current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId];
      if (!next.includes(leaderAgentId)) {
        setLeaderAgentId(next.find((id) => canLeadAgent(agentById.get(id))) || '');
      }
      return next;
    });
  };

  const chooseLeader = (agentId: string) => {
    if (!canLeadAgent(agentById.get(agentId))) {
      setWarning(
        t(
          'That member cannot lead a team — pick a Principal Investigator or Research Planner.',
          '该成员不能担任队长——请选择首席研究员或研究规划师。'
        )
      );
      return;
    }
    setWarning(undefined);
    setLeaderAgentId(agentId);
  };

  const canSubmit =
    selected.length > 0 && (mode === 'add' || (leaderAgentId && selected.includes(leaderAgentId))) && !busy;

  const submit = () => {
    if (!canSubmit) return;
    const fallbackName =
      name.trim() ||
      selected
        .slice(0, 3)
        .map((id) => agentName(agentById.get(id), id, language))
        .join('、');
    onSubmit({ agentIds: selected, leaderAgentId, name: fallbackName, templateId });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,14,0.66)] backdrop-blur-[3px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-[720px] max-w-[92vw] max-h-[84vh] flex flex-col bg-bg-surface border border-border rounded-2xl overflow-hidden shadow-panel">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <h3 className="text-[15px] font-semibold text-text-primary">
            {mode === 'create' ? t('Start a research team', '拉起科研小队') : t('Add members', '添加成员')}
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover flex items-center justify-center"
          >
            <X size={15} />
          </button>
        </div>

        {mode === 'create' && (
          <>
            <div className="px-4 py-3 border-b border-border-subtle">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t(
                  'Team name (leave blank to name it after its members)',
                  '小队名称（留空则按成员自动命名）'
                )}
                className="w-full bg-bg-elevated border border-border-subtle rounded-lg px-2.5 py-2 text-[13px] text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap px-4 py-2.5 border-b border-border-subtle">
              <span className="text-[11px] text-text-muted mr-0.5">{t('Suggested rosters:', '推荐组合：')}</span>
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => applyTemplate(template)}
                  className={`px-2 py-1 rounded-full text-[11px] border transition-colors ${
                    templateId === template.id
                      ? 'border-accent text-accent bg-accent-soft'
                      : 'border-border text-text-secondary bg-bg-elevated hover:border-accent hover:text-accent'
                  }`}
                >
                  {(language === 'zh' && template.nameZh) || template.name}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col border-r border-border-subtle min-w-0">
            <div className="px-3.5 py-2.5 text-[11px] text-text-muted border-b border-border-subtle">
              {t(`All members · ${agents.length}`, `全部队员 · ${agents.length} 位`)}
            </div>
            <div className="flex-1 overflow-y-auto px-2.5 py-1.5">
              {/* Leaders first: a team is defined by who leads it, so the
                  people who can take that role are what you choose first. */}
              {(
                [
                  { label: t('Can lead the team', '可任队长'), list: agents.filter((agent) => canLeadAgent(agent)) },
                  { label: t('Members', '队员'), list: agents.filter((agent) => !canLeadAgent(agent)) },
                ] as const
              ).map((section) =>
                section.list.length === 0 ? null : (
                  <div key={section.label}>
                    <div className="px-2 pt-2 pb-1 text-[10px] text-text-muted tracking-wide">{section.label}</div>
                    {section.list.map((agent) => {
                      const already = existingAgentIds.includes(agent.id);
                      const picked = selected.includes(agent.id) || already;
                      const isLeader = leaderAgentId === agent.id;
                      return (
                        <button
                          key={agent.id}
                          onClick={() => toggle(agent.id)}
                          disabled={already}
                          className={`w-full flex items-center gap-2.5 p-2 rounded-[10px] text-left transition-colors ${
                            already ? 'opacity-45 cursor-not-allowed' : 'hover:bg-bg-hover'
                          }`}
                        >
                          <span
                            className={`w-[17px] h-[17px] rounded-[5px] border flex items-center justify-center shrink-0 ${
                              picked ? 'bg-accent border-accent text-[#04131f]' : 'border-border text-transparent'
                            }`}
                          >
                            <Check size={11} />
                          </span>
                          <MemberAvatar agentId={agent.id} agent={agent} leader={isLeader} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[13px] font-semibold text-text-primary truncate">
                              {agentName(agent, agent.id, language)}
                            </span>
                            <span
                              className="block text-[11px] text-text-muted truncate"
                              title={agentDescription(agent, language)}
                            >
                              {agentTitle(agent, language)}
                            </span>
                          </span>
                          {isLeader && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500 shrink-0">
                              {t('leader', '队长')}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>

          <div className="w-[236px] shrink-0 flex flex-col min-w-0">
            <div className="px-3.5 py-2.5 text-[11px] text-text-muted border-b border-border-subtle">
              {t(`Selected ${selected.length}`, `已选 ${selected.length} 人`)}
              {mode === 'create' && (
                <>
                  {' · '}
                  {t('Leader: ', '队长：')}
                  <span className="text-text-secondary">
                    {leaderAgentId ? agentName(agentById.get(leaderAgentId), leaderAgentId, language) : '—'}
                  </span>
                </>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-2.5 py-1.5">
              {selected.length === 0 ? (
                <p className="p-3 text-[11.5px] text-text-muted leading-relaxed">
                  {t('Pick members on the left, or tap a suggested roster.', '从左侧勾选成员，或点击上方推荐组合。')}
                </p>
              ) : (
                // The leader is listed first, under its own heading: a team
                // reads as "leader X, members A, B, C", and that is also how
                // it will be summarised everywhere else in the app.
                (
                  [
                    { label: t('Leader', '队长'), list: selected.filter((id) => id === leaderAgentId) },
                    { label: t('Members', '队员'), list: selected.filter((id) => id !== leaderAgentId) },
                  ] as const
                ).map((section) =>
                  section.list.length === 0 ? null : (
                    <div key={section.label}>
                      <div className="px-1.5 pt-1.5 pb-1 text-[10px] text-text-muted tracking-wide">
                        {section.label}
                      </div>
                      {section.list.map((agentId) => (
                        <div key={agentId} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-bg-hover">
                          <MemberAvatar
                            agentId={agentId}
                            agent={agentById.get(agentId)}
                            size="sm"
                            leader={agentId === leaderAgentId}
                          />
                          <span className="flex-1 min-w-0 text-[12px] text-text-primary truncate">
                            {agentName(agentById.get(agentId), agentId, language)}
                          </span>
                          {mode === 'create' && agentId !== leaderAgentId && (
                            <button
                              onClick={() => chooseLeader(agentId)}
                              title={t('Make leader', '设为队长')}
                              className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-amber-500 transition-colors"
                            >
                              <Crown size={12} />
                            </button>
                          )}
                          <button
                            onClick={() => toggle(agentId)}
                            className="w-6 h-6 rounded-md text-text-muted hover:text-red-500 flex items-center justify-center"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                )
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-4 py-3 border-t border-border-subtle">
          <span className="text-[11px] flex-1 min-w-0">
            {warning ? (
              <span className="text-amber-500">{warning}</span>
            ) : selected.length > 0 ? (
              <span className="text-text-muted line-clamp-2 leading-snug">
                <span className="text-text-secondary">{t('Leader: ', '队长：')}</span>
                {leaderAgentId ? agentName(agentById.get(leaderAgentId), leaderAgentId, language) : '—'}
                {selected.filter((id) => id !== leaderAgentId).length > 0 && (
                  <>
                    {'　'}
                    <span className="text-text-secondary">{t('Members: ', '队员：')}</span>
                    {selected
                      .filter((id) => id !== leaderAgentId)
                      .map((id) => agentName(agentById.get(id), id, language))
                      .join(language === 'zh' ? '、' : ', ')}
                  </>
                )}
              </span>
            ) : (
              <span className="text-text-muted">
                {t('Tap the crown to choose who leads this team.', '点击王冠图标可指定谁是队长。')}
              </span>
            )}
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-border text-text-secondary text-[12px] hover:text-text-primary transition-colors"
          >
            {t('Cancel', '取消')}
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-3.5 py-1.5 rounded-lg bg-accent text-[#04131f] text-[12px] font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {mode === 'create' ? t('Create team', '创建小队') : t('Add', '添加')}
          </button>
        </div>
      </div>
    </div>
  );
};
