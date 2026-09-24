import type { AgentDefinition } from '@medscience/core';

/**
 * Who should answer this message.
 *
 * The composer used to ask two questions up front -- "chat or research?" and
 * "which research workflow?" -- before the user had written anything. Both
 * were decisions about a message that did not exist yet, and neither is
 * something a person can answer well in the abstract. They are replaced by
 * one rule that reads off the message itself:
 *
 *   @someone  ->  that member answers, with their tools and their prompt
 *   no @      ->  a plain conversation with the general expert
 *
 * and, when a plain message is obviously in some specialist's territory, a
 * question the user can answer in one click instead of a setting they had to
 * predict.
 */

/** Matching is done on the display names a user actually sees, plus the id. */
function namesOf(agent: AgentDefinition): string[] {
  return [agent.name, agent.nameZh, agent.id].filter(Boolean) as string[];
}

/**
 * A mention is matched against the longest name first, so "@Machine Learning
 * Specialist" does not resolve to some shorter agent whose name is a prefix
 * of it.
 */
function byLongestName(agents: AgentDefinition[]): { agent: AgentDefinition; name: string }[] {
  return agents
    .flatMap((agent) => namesOf(agent).map((name) => ({ agent, name })))
    .sort((a, b) => b.name.length - a.name.length);
}

export interface ParsedMention {
  /** The member the message is addressed to, if any. */
  agentId?: string;
  /** The message with the mention removed -- what actually gets sent. */
  text: string;
  /** The matched display name, for the UI to echo back. */
  mentionedName?: string;
}

/**
 * Pulls a leading or inline `@Name` out of the message.
 *
 * Only the first mention counts: addressing two members in one message is a
 * team run, not a 1:1 conversation, and quietly picking one of them would be
 * worse than ignoring the second.
 */
export function parseMention(text: string, agents: AgentDefinition[]): ParsedMention {
  for (const { agent, name } of byLongestName(agents)) {
    const at = text.indexOf(`@${name}`);
    if (at === -1) continue;
    const before = at === 0 ? '' : text.slice(0, at);
    const after = text.slice(at + name.length + 1);
    return {
      agentId: agent.id,
      mentionedName: name,
      text: `${before}${after}`.replace(/\s+/g, ' ').trim(),
    };
  }
  return { text };
}

/** The `@` token the user is currently typing, if the caret sits inside one. */
export function mentionQueryAt(text: string, caret: number): { query: string; start: number } | undefined {
  const upToCaret = text.slice(0, caret);
  const at = upToCaret.lastIndexOf('@');
  if (at === -1) return undefined;
  // An '@' only opens the picker at a word boundary, so an email address or a
  // handle inside a sentence does not.
  if (at > 0 && !/\s/.test(upToCaret[at - 1])) return undefined;
  const query = upToCaret.slice(at + 1);
  if (/\s{2,}|\n/.test(query)) return undefined;
  return { query, start: at };
}

/** Members whose name or specialty matches what is being typed after '@'. */
export function matchMembers(agents: AgentDefinition[], query: string, limit = 6): AgentDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return agents.slice(0, limit);
  const scored = agents
    .map((agent) => {
      const haystacks = [agent.name, agent.nameZh, agent.title, agent.titleZh, agent.id].filter(Boolean) as string[];
      const hit = haystacks.findIndex((h) => h.toLowerCase().includes(q));
      const startsWith = haystacks.some((h) => h.toLowerCase().startsWith(q));
      return { agent, hit, startsWith };
    })
    .filter((s) => s.hit >= 0)
    // A name match beats a title match, and a prefix beats a substring.
    .sort((a, b) => Number(b.startsWith) - Number(a.startsWith) || a.hit - b.hit);
  return scored.slice(0, limit).map((s) => s.agent);
}

/**
 * Extra natural-language triggers per member.
 *
 * capabilityTags already carry the domain vocabulary ('medical-imaging',
 * 'pk-pd', 'toxicology'), so most of the matching is derived from them and
 * this only adds the words people actually type -- including the Chinese
 * ones, which no tag contains. Deliberately short: a suggestion that fires on
 * a vague word is worse than no suggestion, because the user learns to
 * dismiss it without reading.
 */
const EXTRA_TRIGGERS: Record<string, string[]> = {
  'literature-reviewer': ['pubmed', 'systematic review', 'literature', '文献', '综述', '检索'],
  biostatistician: ['p value', 'p-value', 'confidence interval', 'sample size', 'power', 'regression', '统计', '样本量', '置信区间', '显著性'],
  'ml-specialist': ['model', 'training', 'overfitting', 'cross-validation', 'auc', '机器学习', '模型', '过拟合', '交叉验证'],
  'medical-imaging-specialist': ['dicom', 'mri', 'ct scan', 'segmentation', 'radiomics', '影像', '分割', '磁共振'],
  'single-cell-specialist': ['scrna', 'single cell', 'umap', 'clustering', 'seurat', '单细胞', '聚类', '空间转录组'],
  'bioinformatics-engineer': ['fastq', 'alignment', 'variant calling', 'rna-seq', '测序', '比对', '质控'],
  'structural-biologist': ['pdb', 'alphafold', 'docking', 'crystal structure', '结构', '对接', '晶体'],
  'chemistry-specialist': ['smiles', 'ic50', 'compound', 'medicinal chemistry', '化合物', '分子', '构效'],
  pharmacologist: ['pharmacokinetic', 'half-life', 'dose', 'adme', 'exposure', '药代', '剂量', '半衰期'],
  toxicologist: ['toxicity', 'noael', 'herg', 'safety margin', '毒性', '安全窗'],
  epidemiologist: ['cohort', 'case-control', 'confounding', 'causal', 'odds ratio', '队列', '混杂', '因果'],
  'clinical-trial-designer': ['endpoint', 'randomization', 'protocol', 'inclusion criteria', '试验设计', '终点', '随机化', '入排'],
  'clinical-specialist': ['patient', 'clinical', 'adverse event', 'indication', '临床', '患者', '不良事件'],
  pathologist: ['histology', 'ihc', 'biopsy', 'grading', '病理', '免疫组化', '活检'],
  immunologist: ['cytokine', 'checkpoint', 't cell', 'immune', '免疫', '细胞因子'],
  'regulatory-specialist': ['fda', 'ema', 'nmpa', 'ind', '510(k)', 'samd', '法规', '注册', '申报'],
  'bioethics-officer': ['irb', 'consent', 'hipaa', 'gdpr', 'privacy', '伦理', '知情同意', '隐私'],
  'data-curator': ['icd', 'snomed', 'loinc', 'harmonization', 'missing data', '数据治理', '缺失值', '编码'],
  'health-economist': ['cost-effectiveness', 'qaly', 'icer', 'budget impact', '成本效果', '卫生经济'],
  'reproducibility-engineer': ['reproducible', 'random seed', 'environment', 'docker', '复现', '随机种子'],
  'scientific-writer': ['manuscript', 'abstract', 'draft the paper', '论文', '摘要', '投稿'],
  'scientific-critic': ['review my', 'critique', 'peer review', '审稿', '评审', '挑毛病'],
  'biology-specialist': ['pathway', 'gene expression', 'proteomics', 'biomarker', '通路', '基因', '生物标志物'],
};

/** Tags too generic to be worth matching -- every member would hit on them. */
const IGNORED_TAGS = new Set(['research-planning', 'leadership', 'synthesis', 'study-design']);

function triggersFor(agent: AgentDefinition): string[] {
  const fromTags = agent.capabilityTags
    .filter((tag) => !IGNORED_TAGS.has(tag))
    .map((tag) => tag.replace(/-/g, ' '));
  return [...fromTags, ...(EXTRA_TRIGGERS[agent.id] || [])];
}

/**
 * How long a trigger must be before it is allowed to fire.
 *
 * Three characters of Latin text is barely a word ("cat" matching
 * "concatenate"), but two CJK characters usually is one -- 队列 is "cohort"
 * and 混杂 is "confounding". Holding both to the same length is what made
 * every two-character Chinese trigger dead on arrival.
 */
function minTriggerLength(trigger: string): number {
  return /[\u4e00-\u9fff]/.test(trigger) ? 2 : 3;
}

export interface MemberSuggestion {
  agent: AgentDefinition;
  /** The phrase that matched, so the UI can say why it is asking. */
  trigger: string;
}

/**
 * The specialist a plain message looks like it belongs to, if one clearly
 * does.
 *
 * Returns at most one: this drives a yes/no question, and a list of
 * candidates would put the routing decision back on the user, which is the
 * thing the @-rule exists to avoid. The general expert is never suggested --
 * it is already who is answering.
 */
export function suggestMember(
  text: string,
  agents: AgentDefinition[],
  excludeAgentId?: string
): MemberSuggestion | undefined {
  const haystack = text.toLowerCase();
  if (haystack.trim().length < 8) return undefined;

  let best: MemberSuggestion | undefined;
  for (const agent of agents) {
    if (agent.id === excludeAgentId) continue;
    for (const trigger of triggersFor(agent)) {
      if (trigger.length < minTriggerLength(trigger) || !haystack.includes(trigger.toLowerCase())) continue;
      // Longest match wins: "single cell" should beat "cell".
      if (!best || trigger.length > best.trigger.length) best = { agent, trigger };
    }
  }
  return best;
}
