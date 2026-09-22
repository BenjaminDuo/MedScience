import { ResearchTeamDefinition } from './types.js';

/**
 * 4 built-in team templates (design doc section 8, scoped to the MVP's "4
 * built-in templates" bound in section 18 -- the doc's 5th template,
 * Computational Biology Team, is intentionally omitted from this first
 * pass). Templates are read-only baselines: a user clicks "Customize" to
 * clone one into their own ResearchTeamDefinition (see TeamProfileManager's
 * cloneTemplate), so an app upgrade that changes a template never silently
 * rewrites a team the user is already using.
 *
 * Timestamps are fixed rather than Date.now()-generated so these built-in
 * records stay byte-for-byte stable across app restarts and versions.
 */
const BUILT_IN_TEMPLATE_TIMESTAMP = '2026-01-01T00:00:00.000Z';

export const builtInTeamTemplates: ResearchTeamDefinition[] = [
  {
    id: 'team-general-scientific-research',
    name: 'General Scientific Research Team',
    nameZh: '通用科研团队',
    description:
      'A general-purpose team for broad scientific questions that do not fit a more specialized template: a literature-grounded investigation with statistical rigor and independent review.',
    descriptionZh: '面向不适合更专业模板的广泛科学问题的通用团队：基于文献的调查研究，兼具统计严谨性与独立评审。',
    scenario: 'General scientific questions, exploratory literature-and-data investigations.',
    scenarioZh: '通用科学问题、探索性的文献与数据调研。',
    leaderAgentId: 'principal-investigator',
    instructions:
      'Ground every conclusion in retrieved evidence. Prefer the Biostatistician for any quantitative claim. Do not mark the run completed until the Scientific Critic has passed it.',
    members: [
      { agentId: 'principal-investigator', role: 'Team Leader', roleZh: '队长', required: true, canLead: true },
      { agentId: 'literature-reviewer', role: 'Evidence Synthesis', roleZh: '证据综合', required: true, canLead: false },
      { agentId: 'biostatistician', role: 'Quantitative Analysis', roleZh: '定量分析', required: true, canLead: false },
      { agentId: 'scientific-critic', role: 'Quality Gate', roleZh: '质量把关', required: true, canLead: false },
      { agentId: 'scientific-writer', role: 'Final Report (optional)', roleZh: '最终报告（可选）', required: false, canLead: false },
    ],
    maxConcurrency: 3,
    maxTasks: 10,
    maxRevisionsPerTask: 2,
    planningMode: 'review-first',
    builtIn: true,
    archived: false,
    version: 1,
    createdAt: BUILT_IN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILT_IN_TEMPLATE_TIMESTAMP,
  },
  {
    id: 'team-medical-ai-research',
    name: 'Medical AI Research Team',
    nameZh: '医学人工智能研究团队',
    description:
      "MedScience's default template: the closest fit to the product's positioning, for medical AI, clinical prediction, digital biomarkers, multimodal models, and intelligent medical assessment tasks.",
    descriptionZh: 'MedScience 的默认模板：与产品定位最契合，适用于医学人工智能、临床预测、数字生物标志物、多模态模型与智能医学评估任务。',
    scenario: 'Medical video/imaging analysis, clinical prediction, digital biomarkers, multimodal models, intelligent medical assessment.',
    scenarioZh: '医学视频/影像分析、临床预测、数字生物标志物、多模态模型、智能医学评估。',
    leaderAgentId: 'principal-investigator',
    instructions:
      'Treat all clinical/patient-level data as sensitive by default. Machine Learning Specialist and Biostatistician must both sign off on any predictive-model claim before synthesis. Reproducibility Engineer must confirm the experiment can be re-run before the run is marked completed.',
    members: [
      { agentId: 'principal-investigator', role: 'Team Leader', roleZh: '队长', required: true, canLead: true },
      { agentId: 'clinical-specialist', role: 'Clinical Design & Safety', roleZh: '临床设计与安全性', required: true, canLead: false },
      { agentId: 'ml-specialist', role: 'Model Development', roleZh: '模型研发', required: true, canLead: false },
      { agentId: 'biostatistician', role: 'Quantitative Analysis', roleZh: '定量分析', required: true, canLead: false },
      { agentId: 'literature-reviewer', role: 'Evidence Synthesis', roleZh: '证据综合', required: true, canLead: false },
      { agentId: 'reproducibility-engineer', role: 'Reproducibility', roleZh: '可复现性', required: true, canLead: false },
      { agentId: 'scientific-critic', role: 'Quality Gate', roleZh: '质量把关', required: true, canLead: false },
    ],
    maxConcurrency: 3,
    maxTasks: 10,
    maxRevisionsPerTask: 2,
    planningMode: 'review-first',
    builtIn: true,
    archived: false,
    version: 1,
    createdAt: BUILT_IN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILT_IN_TEMPLATE_TIMESTAMP,
  },
  {
    id: 'team-drug-discovery',
    name: 'Drug Discovery Team',
    nameZh: '药物研发团队',
    description: 'A team for target/compound investigation spanning biology, chemistry, literature, and clinical translatability.',
    descriptionZh: '面向靶点/化合物研究的团队，涵盖生物学、化学、文献与临床转化可行性。',
    scenario: 'Target identification, compound screening/SAR, mechanism-of-action, and translational feasibility questions.',
    scenarioZh: '靶点识别、化合物筛选/构效关系（SAR）、作用机制及转化可行性问题。',
    leaderAgentId: 'principal-investigator',
    instructions:
      'Require both Biology Specialist and Chemistry Specialist sign-off before any target/compound claim proceeds to review. Flag any claim that extrapolates from in vitro/computational results to clinical relevance for Clinical Specialist review.',
    members: [
      { agentId: 'principal-investigator', role: 'Team Leader', roleZh: '队长', required: true, canLead: true },
      { agentId: 'biology-specialist', role: 'Target Biology', roleZh: '靶点生物学', required: true, canLead: false },
      { agentId: 'chemistry-specialist', role: 'Cheminformatics', roleZh: '化学信息学', required: true, canLead: false },
      { agentId: 'literature-reviewer', role: 'Evidence Synthesis', roleZh: '证据综合', required: true, canLead: false },
      { agentId: 'clinical-specialist', role: 'Translational Review', roleZh: '转化研究审查', required: true, canLead: false },
      { agentId: 'scientific-critic', role: 'Quality Gate', roleZh: '质量把关', required: true, canLead: false },
    ],
    maxConcurrency: 3,
    maxTasks: 10,
    maxRevisionsPerTask: 2,
    planningMode: 'review-first',
    builtIn: true,
    archived: false,
    version: 1,
    createdAt: BUILT_IN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILT_IN_TEMPLATE_TIMESTAMP,
  },
  {
    id: 'team-systematic-review-meta-analysis',
    name: 'Systematic Review & Meta-Analysis Team',
    nameZh: '系统综述与荟萃分析团队',
    description: 'A team specialized in systematic literature review and quantitative meta-analysis with a structured, citable evidence table.',
    descriptionZh: '专注于系统性文献综述与定量荟萃分析的团队，产出结构化、可引用的证据表。',
    scenario: 'Systematic reviews, evidence synthesis across many primary studies, and formal meta-analysis.',
    scenarioZh: '系统综述、跨多项原始研究的证据综合，以及正式的荟萃分析。',
    leaderAgentId: 'principal-investigator',
    instructions:
      'Follow a documented search-and-screening strategy. Every included/excluded study must be traceable. Biostatistician must validate the meta-analytic method (fixed vs. random effects, heterogeneity) before synthesis.',
    members: [
      { agentId: 'principal-investigator', role: 'Team Leader', roleZh: '队长', required: true, canLead: true },
      { agentId: 'literature-reviewer', role: 'Search & Screening', roleZh: '检索与筛选', required: true, canLead: false },
      { agentId: 'biostatistician', role: 'Meta-Analysis', required: true, canLead: false },
      { agentId: 'clinical-specialist', role: 'Clinical Relevance Review', roleZh: '临床相关性审查', required: true, canLead: false },
      { agentId: 'scientific-critic', role: 'Quality Gate', roleZh: '质量把关', required: true, canLead: false },
      { agentId: 'scientific-writer', role: 'Final Report', roleZh: '最终报告', required: true, canLead: false },
    ],
    maxConcurrency: 3,
    maxTasks: 10,
    maxRevisionsPerTask: 2,
    planningMode: 'review-first',
    builtIn: true,
    archived: false,
    version: 1,
    createdAt: BUILT_IN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILT_IN_TEMPLATE_TIMESTAMP,
  },
];

export const DEFAULT_TEAM_TEMPLATE_ID = 'team-medical-ai-research';
