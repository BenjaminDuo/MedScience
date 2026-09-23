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
 * agent lands in the right section on its own. First match wins, so the
 * order below is the order a member is thought about: what they lead, then
 * what they produce, then what they specialise in. Anything unmatched falls
 * into 学科专家 at the end rather than disappearing.
 */
const SECTIONS: { en: string; zh: string; tags: string[] }[] = [
  {
    en: 'Leadership & planning',
    zh: '统筹与规划',
    tags: ['leadership', 'research-planning'],
  },
  {
    en: 'Evidence & writing',
    zh: '证据与写作',
    tags: ['literature-search', 'evidence-synthesis', 'scientific-writing', 'scientific-review', 'integrity-check'],
  },
  {
    en: 'Quantitative & engineering',
    zh: '定量与工程',
    tags: [
      'biostatistics',
      'machine-learning',
      'model-evaluation',
      'reproducibility',
      'environment-tracking',
      'bioinformatics',
      'data-processing',
    ],
  },
  {
    en: 'Omics & structure',
    zh: '组学与结构',
    tags: ['genomics', 'proteomics', 'transcriptomics', 'single-cell', 'spatial-omics', 'structural-biology', 'molecular-modeling'],
  },
  {
    en: 'Clinical, imaging & pathology',
    zh: '临床、影像与病理',
    tags: ['clinical-study-design', 'clinical-safety', 'medical-imaging', 'radiomics', 'pathology', 'digital-pathology', 'immunology', 'immunotherapy'],
  },
  {
    en: 'Drugs & safety',
    zh: '药物与安全',
    tags: ['cheminformatics', 'drug-discovery', 'pharmacology', 'pk-pd', 'toxicology', 'preclinical-safety'],
  },
  {
    en: 'Governance & translation',
    zh: '合规与转化',
    tags: ['regulatory-affairs', 'research-ethics', 'data-governance', 'data-harmonization', 'health-economics', 'outcomes-research', 'translation'],
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
      const members = agents.filter(
        (agent) => !used.has(agent.id) && agent.capabilityTags.some((tag) => section.tags.includes(tag))
      );
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
