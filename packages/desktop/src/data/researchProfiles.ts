/**
 * Frontend-only mirror of the research workflow metadata (id, display
 * names, descriptions) from @medscience/core's research-loop/ResearchProfiles.ts.
 *
 * This is a plain data duplication, not a re-import, on purpose: the core
 * package's index.ts barrel-exports its entire module graph (including
 * Node-only modules like SkillInstaller, which uses child_process), so a
 * *value* import from '@medscience/core' pulls all of that into the Vite
 * browser bundle and fails it (`execSync` has no browser equivalent) --
 * only `import type` from core is safe in browser-bundled code, which is
 * why AgentSession/WorkspaceContext etc. already mirror core's shapes
 * locally instead of importing the real values. The task templates
 * (which tools route to which plan step) are a pure backend/engine
 * concern and stay in core only; the UI here only needs id + labels.
 *
 * Keep the id list and copy in sync with core's RESEARCH_PROFILES.
 */
export interface ResearchProfileOption {
  id: string;
  nameEn: string;
  nameZh: string;
  descriptionEn: string;
  descriptionZh: string;
}

export const RESEARCH_PROFILE_OPTIONS: ResearchProfileOption[] = [
  {
    id: 'general',
    nameEn: 'General Research',
    nameZh: '通用科研',
    descriptionEn: 'Balanced target, bioactivity, computation and clinical coverage. Use when the inquiry does not clearly fit a narrower workflow.',
    descriptionZh: '兼顾靶点、生物活性、计算分析与临床证据的均衡流程。不确定用哪种工作流时选这个。',
  },
  {
    id: 'literature-review',
    nameEn: 'Literature Review',
    nameZh: '文献综述',
    descriptionEn: 'Survey and synthesize published work on a topic -- e.g. "survey recent Parkinson\'s detection papers". Prioritizes PubMed/arXiv/bioRxiv search over target/bioactivity lookups.',
    descriptionZh: '针对某一主题系统检索并综述已发表文献，例如“调研帕金森检测领域的最新文章”。优先使用 PubMed/arXiv/bioRxiv 等文献检索工具，而非靶点或生物活性查询。',
  },
  {
    id: 'molecular-target',
    nameEn: 'Target & Mechanism',
    nameZh: '靶点机制',
    descriptionEn: 'Characterize a molecular target and its ligands -- structure, bioactivity, selectivity, computation. Use for drug-target/mechanism questions.',
    descriptionZh: '刻画分子靶点及其配体机制 -- 结构、生物活性、选择性与计算分析。适用于靶点/药物机制类问题。',
  },
  {
    id: 'clinical-evidence',
    nameEn: 'Clinical Evidence',
    nameZh: '临床证据',
    descriptionEn: 'Trial design, endpoints, safety signals and regulatory status for a drug/intervention. Use for clinical/safety-focused questions.',
    descriptionZh: '面向药物或干预措施的试验设计、终点、安全性信号与监管状态。适用于以临床/安全性为核心的问题。',
  },
];

export const DEFAULT_RESEARCH_PROFILE_ID = 'general';
