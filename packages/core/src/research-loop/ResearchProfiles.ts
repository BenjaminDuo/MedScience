import { PlanTask, TaskCategory } from './PlanTracker.js';

/**
 * A pluggable research workflow. Chosen once per session (see
 * RuntimeSession.researchProfileId), same "decide at creation, never
 * per-message" principle as sessionType -- a profile changes what plan
 * template AutonomousResearchEngine builds and which tool calls it
 * emphasizes, not how it classifies any individual message.
 *
 * This intentionally reuses the existing 5-slot plan shape
 * (task-1..task-5, task-5 always the synthesis/closing step) so the rest
 * of AutonomousResearchEngine.run() -- which starts 'task-1' at the top of
 * a run and always finishes on 'task-5' -- needs no further change per
 * profile; only which titles/categories/tool-routing those five slots
 * carry differs.
 */
export interface ResearchProfileTaskTemplate {
  id: string;
  title: string;
  titleZh: string;
  category: TaskCategory;
  /** Tool-call name substrings routed onto this task, checked in template order. */
  toolMatchers?: string[];
  /** Exactly one task per profile must set this: the catch-all for any tool call no more specific task claimed. */
  isDefaultTask?: boolean;
}

export interface ResearchProfile {
  id: string;
  nameEn: string;
  nameZh: string;
  descriptionEn: string;
  descriptionZh: string;
  /** Appended to AutonomousResearchEngine's base system prompt to bias tool choice and framing toward this workflow. Empty for 'general'. */
  systemPromptFocus: string;
  taskTemplate: ResearchProfileTaskTemplate[];
}

function buildTasks(template: ResearchProfileTaskTemplate[]): PlanTask[] {
  return template.map((t) => ({
    id: t.id,
    title: t.title,
    titleZh: t.titleZh,
    category: t.category,
    status: 'pending',
    evidenceIds: [],
    toolMatchers: t.toolMatchers,
    isDefaultTask: t.isDefaultTask,
  }));
}

const GENERAL: ResearchProfile = {
  id: 'general',
  nameEn: 'General Research',
  nameZh: '通用科研',
  descriptionEn: 'Balanced target, bioactivity, computation and clinical coverage. Use when the inquiry does not clearly fit a narrower workflow.',
  descriptionZh: '兼顾靶点、生物活性、计算分析与临床证据的均衡流程。不确定用哪种工作流时选这个。',
  systemPromptFocus: '',
  taskTemplate: [
    { id: 'task-1', title: 'Retrieve Canonical Target Sequences, 3D Structures & Domain Topology', titleZh: '检索靶点标准序列、三维结构与结构域拓扑信息', category: 'databases', toolMatchers: ['uniprot', 'pdb'] },
    { id: 'task-2', title: 'Explore Bioactivity (IC50/Ki), Selectivity & Literature Associations', titleZh: '探索生物活性（IC50/Ki）、选择性与文献关联', category: 'databases', isDefaultTask: true },
    { id: 'task-3', title: 'Perform Local Sandbox Statistical Analysis, Radiomics or Clinical NLP', titleZh: '执行本地沙箱统计分析、影像组学或临床自然语言处理', category: 'computation', toolMatchers: ['python', 'imaging', 'nlp'] },
    { id: 'task-4', title: 'Validate Clinical Trial Endpoints, Safety Signals & Critique Gate Check', titleZh: '验证临床试验终点、安全性信号并通过审查关卡检查', category: 'clinical', toolMatchers: ['clinical', 'openfda', 'rxnorm'] },
    { id: 'task-5', title: 'Synthesize Evidence-Anchored Scientific Report & Traceability Index', titleZh: '综合撰写基于证据的科研报告与可追溯索引', category: 'synthesis' },
  ],
};

const LITERATURE_REVIEW: ResearchProfile = {
  id: 'literature-review',
  nameEn: 'Literature Review',
  nameZh: '文献综述',
  descriptionEn: 'Survey and synthesize published work on a topic -- e.g. "survey recent Parkinson\'s detection papers". Prioritizes PubMed/arXiv/bioRxiv search over target/bioactivity lookups.',
  descriptionZh: '针对某一主题系统检索并综述已发表文献，例如"调研帕金森检测领域的最新文章"。优先使用 PubMed/arXiv/bioRxiv 等文献检索工具，而非靶点或生物活性查询。',
  systemPromptFocus:
    'This session is running the Literature Review workflow: prioritize literature_search, arxiv_search, biorxiv_medrxiv_search, papers_with_code_lookup, and huggingface_hub_lookup to discover and characterize published work. Report study designs, cohorts, methods, and reported outcomes across papers, note where evidence disagrees, and do not fabricate a bioactivity/target analysis the inquiry did not ask for.',
  taskTemplate: [
    { id: 'task-1', title: 'Systematic Literature Search Across PubMed, arXiv, bioRxiv & Preprint Servers', titleZh: '系统检索 PubMed、arXiv、bioRxiv 及预印本平台文献', category: 'literature', toolMatchers: ['literature_search', 'arxiv', 'biorxiv', 'papers_with_code', 'huggingface'] },
    { id: 'task-2', title: 'Extract Study Characteristics, Cohorts, Methods & Reported Outcomes', titleZh: '提取研究特征、队列、方法与报告结局', category: 'literature', isDefaultTask: true },
    { id: 'task-3', title: 'Quantify Bibliometric Trends, Citation Patterns & Study Volume Over Time', titleZh: '量化文献计量趋势、引用模式与研究数量的时间变化', category: 'computation', toolMatchers: ['python', 'data_analysis'] },
    { id: 'task-4', title: 'Assess Study Quality, Heterogeneity & Risk of Bias (PRISMA-Aligned)', titleZh: '评估研究质量、异质性与偏倚风险（遵循 PRISMA 规范）', category: 'clinical', toolMatchers: ['clinical_trials', 'openfda'] },
    { id: 'task-5', title: 'Synthesize Evidence-Anchored Literature Review & Traceability Index', titleZh: '综合撰写基于证据的文献综述与可追溯索引', category: 'synthesis' },
  ],
};

const MOLECULAR_TARGET: ResearchProfile = {
  id: 'molecular-target',
  nameEn: 'Target & Mechanism',
  nameZh: '靶点机制',
  descriptionEn: 'Characterize a molecular target and its ligands -- structure, bioactivity, selectivity, computation. Use for drug-target/mechanism questions.',
  descriptionZh: '刻画分子靶点及其配体机制 -- 结构、生物活性、选择性与计算分析。适用于靶点/药物机制类问题。',
  systemPromptFocus:
    'This session is running the Target & Mechanism workflow: prioritize uniprot_lookup and pdb_lookup to establish target sequence/structure, then chembl_lookup and pubchem_lookup for bioactivity and selectivity, before any clinical or literature claims. Ground mechanism-of-action statements in structural and bioactivity evidence first.',
  taskTemplate: [
    { id: 'task-1', title: 'Retrieve Canonical Target Sequences, 3D Structures & Domain Topology', titleZh: '检索靶点标准序列、三维结构与结构域拓扑信息', category: 'databases', toolMatchers: ['uniprot', 'pdb'] },
    { id: 'task-2', title: 'Explore Bioactivity (IC50/Ki), Selectivity & Chemical Properties', titleZh: '探索生物活性（IC50/Ki）、选择性与化学性质', category: 'databases', isDefaultTask: true },
    { id: 'task-3', title: 'Perform Local Structural/Computational Analysis (Docking, ADMET, Sequence)', titleZh: '执行本地结构/计算分析（分子对接、ADMET、序列分析）', category: 'computation', toolMatchers: ['python', 'imaging'] },
    { id: 'task-4', title: 'Cross-Check Literature Support & Trial Status for the Target-Ligand Interaction', titleZh: '交叉核验靶点-配体相互作用的文献支持与试验状态', category: 'clinical', toolMatchers: ['clinical', 'literature', 'arxiv', 'biorxiv', 'openfda', 'rxnorm'] },
    { id: 'task-5', title: 'Synthesize Evidence-Anchored Mechanism Report & Traceability Index', titleZh: '综合撰写基于证据的机制报告与可追溯索引', category: 'synthesis' },
  ],
};

const CLINICAL_EVIDENCE: ResearchProfile = {
  id: 'clinical-evidence',
  nameEn: 'Clinical Evidence',
  nameZh: '临床证据',
  descriptionEn: 'Trial design, endpoints, safety signals and regulatory status for a drug/intervention. Use for clinical/safety-focused questions.',
  descriptionZh: '面向药物或干预措施的试验设计、终点、安全性信号与监管状态。适用于以临床/安全性为核心的问题。',
  systemPromptFocus:
    'This session is running the Clinical Evidence workflow: prioritize clinical_trials_lookup for trial design/endpoints, then openfda_lookup, rxnorm_lookup and dailymed_lookup for labeling and adverse-event signals, before broader literature synthesis. Flag safety signals explicitly and never understate them.',
  taskTemplate: [
    { id: 'task-1', title: 'Retrieve Trial Registrations, Endpoints & Study Design', titleZh: '检索试验注册信息、终点指标与研究设计', category: 'clinical', toolMatchers: ['clinical_trials'] },
    { id: 'task-2', title: 'Cross-Reference Drug Labeling, Adverse Events & Safety Signals', titleZh: '交叉核对药品说明书、不良事件与安全性信号', category: 'databases', isDefaultTask: true },
    { id: 'task-3', title: 'Perform Local Statistical, Survival or Adverse-Event Signal Analysis', titleZh: '执行本地统计分析、生存分析或不良事件信号分析', category: 'computation', toolMatchers: ['python', 'nlp', 'imaging'] },
    { id: 'task-4', title: 'Validate Supporting Literature & Regulatory Context', titleZh: '验证支持性文献与监管背景', category: 'literature', toolMatchers: ['literature', 'pubmed', 'arxiv', 'biorxiv'] },
    { id: 'task-5', title: 'Synthesize Evidence-Anchored Clinical Report & Traceability Index', titleZh: '综合撰写基于证据的临床报告与可追溯索引', category: 'synthesis' },
  ],
};

export const RESEARCH_PROFILES: ResearchProfile[] = [GENERAL, LITERATURE_REVIEW, MOLECULAR_TARGET, CLINICAL_EVIDENCE];

export const DEFAULT_RESEARCH_PROFILE_ID = 'general';

export function getResearchProfile(id?: string): ResearchProfile {
  return RESEARCH_PROFILES.find((p) => p.id === id) || GENERAL;
}

export function buildPlanTasksForProfile(id?: string): PlanTask[] {
  return buildTasks(getResearchProfile(id).taskTemplate);
}
