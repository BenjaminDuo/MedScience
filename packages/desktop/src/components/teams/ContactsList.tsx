import React, { useMemo } from 'react';
import type { AgentDefinition } from '@medscience/core';
import { useLanguage } from '../../context/LanguageContext';
import { agentName, agentTitle } from './agentIdentity';
import { MemberAvatar } from './GroupAvatar';

/**
 * 队员管理: the member catalog that replaced the separate account-wide Team
 * Roster page. Membership of a given team is edited inside that team's own
 * info panel; this tab is the account-wide list of who exists to add.
 *
 * Groups follow capability tags rather than a hand-kept list, so a custom
 * agent lands in the right section on its own.
 */
const SECTIONS: { en: string; zh: string; match: (agent: AgentDefinition) => boolean }[] = [
  {
    en: 'Leadership & planning',
    zh: '统筹与规划',
    match: (agent) => agent.capabilityTags.some((tag) => tag === 'leadership' || tag === 'research-planning'),
  },
  {
    en: 'Evidence & writing',
    zh: '证据与写作',
    match: (agent) =>
      agent.capabilityTags.some((tag) =>
        ['literature-search', 'evidence-synthesis', 'scientific-writing', 'scientific-review', 'integrity-check'].includes(tag)
      ),
  },
  {
    en: 'Quantitative & engineering',
    zh: '定量与工程',
    match: (agent) =>
      agent.capabilityTags.some((tag) =>
        ['biostatistics', 'machine-learning', 'model-evaluation', 'reproducibility', 'environment-tracking'].includes(tag)
      ),
  },
];

export const ContactsList: React.FC<{
  agents: AgentDefinition[];
  onOpen: (agentId: string) => void;
}> = ({ agents, onOpen }) => {
  const { t, language } = useLanguage();

  const grouped = useMemo(() => {
    const used = new Set<string>();
    const sections = SECTIONS.map((section) => {
      const members = agents.filter((agent) => !used.has(agent.id) && section.match(agent));
      members.forEach((agent) => used.add(agent.id));
      return { label: t(section.en, section.zh), members };
    });
    const rest = agents.filter((agent) => !used.has(agent.id));
    if (rest.length > 0) sections.push({ label: t('Domain specialists', '学科专家'), members: rest });
    return sections.filter((section) => section.members.length > 0);
  }, [agents, t]);

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-3">
      {grouped.map((section) => (
        <div key={section.label}>
          <div className="text-[10px] text-text-muted px-2 pt-2.5 pb-1 tracking-wide">{section.label}</div>
          {section.members.map((agent) => (
            <button
              key={agent.id}
              onClick={() => onOpen(agent.id)}
              className="w-full flex items-center gap-2.5 p-2 rounded-xl text-left hover:bg-bg-hover transition-colors"
            >
              <MemberAvatar agentId={agent.id} agent={agent} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold text-text-primary truncate">
                  {agentName(agent, agent.id, language)}
                </span>
                <span className="block text-[11px] text-text-muted truncate">{agentTitle(agent, language)}</span>
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};
