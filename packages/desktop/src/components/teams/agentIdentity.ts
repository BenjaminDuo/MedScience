import type { AgentDefinition } from '@medscience/core';
import type { Language } from '../../context/LanguageContext';

/**
 * Per-member visual identity for the group-chat UI: a stable color and a
 * 1-2 character avatar label, the way a chat app gives every participant a
 * recognizable avatar.
 *
 * Kept out of AgentDefinition on purpose -- this is presentation, and
 * writing colors into the persisted agent registry would mean an app theme
 * change had to migrate user data. Custom agents (any id not listed here)
 * fall back to a hash of the id, which is stable across restarts.
 */
const BUILT_IN_COLORS: Record<string, string> = {
  'general-expert': '#0EA5E9',
  'principal-investigator': '#F59E0B',
  'research-planner': '#A78BFA',
  'literature-reviewer': '#38BDF8',
  'biology-specialist': '#34D399',
  'chemistry-specialist': '#F472B6',
  'clinical-specialist': '#FB7185',
  biostatistician: '#60A5FA',
  'ml-specialist': '#818CF8',
  'reproducibility-engineer': '#2DD4BF',
  'scientific-critic': '#FBBF24',
  'scientific-writer': '#C084FC',
  'bioinformatics-engineer': '#22C55E',
  'single-cell-specialist': '#84CC16',
  'structural-biologist': '#0D9488',
  'medical-imaging-specialist': '#06B6D4',
  epidemiologist: '#F97316',
  pharmacologist: '#DB2777',
  toxicologist: '#EF4444',
  immunologist: '#8B5CF6',
  pathologist: '#D946EF',
  'clinical-trial-designer': '#3B82F6',
  'regulatory-specialist': '#64748B',
  'bioethics-officer': '#B45309',
  'data-curator': '#0369A1',
  'health-economist': '#65A30D',
};

const FALLBACK_COLORS = ['#38BDF8', '#818CF8', '#34D399', '#F472B6', '#FBBF24', '#2DD4BF', '#FB7185', '#A78BFA'];

/** Short avatar labels for the built-ins, in both languages. */
const BUILT_IN_SHORT: Record<string, [string, string]> = {
  'general-expert': ['GEN', '通用'],
  'principal-investigator': ['PI', 'PI'],
  'research-planner': ['PL', '规划'],
  'literature-reviewer': ['LR', '文献'],
  'biology-specialist': ['BIO', '生物'],
  'chemistry-specialist': ['CHM', '化学'],
  'clinical-specialist': ['CLN', '临床'],
  biostatistician: ['BST', '统计'],
  'ml-specialist': ['ML', '模型'],
  'reproducibility-engineer': ['REP', '复现'],
  'scientific-critic': ['CRI', '审查'],
  'scientific-writer': ['WRT', '写作'],
  'bioinformatics-engineer': ['BIF', '生信'],
  'single-cell-specialist': ['SC', '单细'],
  'structural-biologist': ['STR', '结构'],
  'medical-imaging-specialist': ['IMG', '影像'],
  epidemiologist: ['EPI', '流病'],
  pharmacologist: ['PK', '药理'],
  toxicologist: ['TOX', '毒理'],
  immunologist: ['IMM', '免疫'],
  pathologist: ['PTH', '病理'],
  'clinical-trial-designer': ['CTD', '试验'],
  'regulatory-specialist': ['REG', '法规'],
  'bioethics-officer': ['ETH', '伦理'],
  'data-curator': ['DAT', '数据'],
  'health-economist': ['HE', '卫经'],
};

export function agentColor(agentId: string): string {
  const known = BUILT_IN_COLORS[agentId];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < agentId.length; i += 1) hash = (hash * 31 + agentId.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

export function agentShortLabel(agentId: string, name: string | undefined, language: Language): string {
  const known = BUILT_IN_SHORT[agentId];
  if (known) return language === 'zh' ? known[1] : known[0];
  const source = (name || agentId).trim();
  // CJK names read best as their first two characters; latin ones as initials.
  if (/[一-龥]/.test(source)) return source.slice(0, 2);
  return source
    .split(/[\s-_]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export function agentName(agent: AgentDefinition | undefined, agentId: string, language: Language): string {
  if (!agent) return agentId;
  return (language === 'zh' && agent.nameZh) || agent.name;
}

export function agentTitle(agent: AgentDefinition | undefined, language: Language): string {
  if (!agent) return '';
  return (language === 'zh' && agent.titleZh) || agent.title;
}

export function agentDescription(agent: AgentDefinition | undefined, language: Language): string {
  if (!agent) return '';
  return (language === 'zh' && agent.descriptionZh) || agent.description;
}

/**
 * Whether a member may be made team leader.
 *
 * TeamProfileManager only requires that the leader is a member with
 * `canLead: true`; the UI decides who gets offered that flag. A leader
 * plans the task graph and synthesizes the report, so eligibility follows
 * the capability tags that describe exactly that work -- today the
 * Principal Investigator ('leadership') and the Research Planner
 * ('research-planning'). A custom agent tagged either way qualifies too.
 */
export function canLeadAgent(agent: AgentDefinition | undefined): boolean {
  if (!agent) return false;
  return agent.capabilityTags.some((tag) => tag === 'leadership' || tag === 'research-planning');
}
