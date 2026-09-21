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
    description:
      'A general-purpose team for broad scientific questions that do not fit a more specialized template: a literature-grounded investigation with statistical rigor and independent review.',
    scenario: 'General scientific questions, exploratory literature-and-data investigations.',
    leaderAgentId: 'principal-investigator',
    instructions:
      'Ground every conclusion in retrieved evidence. Prefer the Biostatistician for any quantitative claim. Do not mark the run completed until the Scientific Critic has passed it.',
    members: [
      { agentId: 'principal-investigator', role: 'Team Leader', required: true, canLead: true },
      { agentId: 'literature-reviewer', role: 'Evidence Synthesis', required: true, canLead: false },
      { agentId: 'biostatistician', role: 'Quantitative Analysis', required: true, canLead: false },
      { agentId: 'scientific-critic', role: 'Quality Gate', required: true, canLead: false },
      { agentId: 'scientific-writer', role: 'Final Report (optional)', required: false, canLead: false },
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
    description:
      "MedScience's default template: the closest fit to the product's positioning, for medical AI, clinical prediction, digital biomarkers, multimodal models, and intelligent medical assessment tasks.",
    scenario: 'Medical video/imaging analysis, clinical prediction, digital biomarkers, multimodal models, intelligent medical assessment.',
    leaderAgentId: 'principal-investigator',
    instructions:
      'Treat all clinical/patient-level data as sensitive by default. Machine Learning Specialist and Biostatistician must both sign off on any predictive-model claim before synthesis. Reproducibility Engineer must confirm the experiment can be re-run before the run is marked completed.',
    members: [
      { agentId: 'principal-investigator', role: 'Team Leader', required: true, canLead: true },
      { agentId: 'clinical-specialist', role: 'Clinical Design & Safety', required: true, canLead: false },
      { agentId: 'ml-specialist', role: 'Model Development', required: true, canLead: false },
      { agentId: 'biostatistician', role: 'Quantitative Analysis', required: true, canLead: false },
      { agentId: 'literature-reviewer', role: 'Evidence Synthesis', required: true, canLead: false },
      { agentId: 'reproducibility-engineer', role: 'Reproducibility', required: true, canLead: false },
      { agentId: 'scientific-critic', role: 'Quality Gate', required: true, canLead: false },
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
    description: 'A team for target/compound investigation spanning biology, chemistry, literature, and clinical translatability.',
    scenario: 'Target identification, compound screening/SAR, mechanism-of-action, and translational feasibility questions.',
    leaderAgentId: 'principal-investigator',
    instructions:
      'Require both Biology Specialist and Chemistry Specialist sign-off before any target/compound claim proceeds to review. Flag any claim that extrapolates from in vitro/computational results to clinical relevance for Clinical Specialist review.',
    members: [
      { agentId: 'principal-investigator', role: 'Team Leader', required: true, canLead: true },
      { agentId: 'biology-specialist', role: 'Target Biology', required: true, canLead: false },
      { agentId: 'chemistry-specialist', role: 'Cheminformatics', required: true, canLead: false },
      { agentId: 'literature-reviewer', role: 'Evidence Synthesis', required: true, canLead: false },
      { agentId: 'clinical-specialist', role: 'Translational Review', required: true, canLead: false },
      { agentId: 'scientific-critic', role: 'Quality Gate', required: true, canLead: false },
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
    description: 'A team specialized in systematic literature review and quantitative meta-analysis with a structured, citable evidence table.',
    scenario: 'Systematic reviews, evidence synthesis across many primary studies, and formal meta-analysis.',
    leaderAgentId: 'principal-investigator',
    instructions:
      'Follow a documented search-and-screening strategy. Every included/excluded study must be traceable. Biostatistician must validate the meta-analytic method (fixed vs. random effects, heterogeneity) before synthesis.',
    members: [
      { agentId: 'principal-investigator', role: 'Team Leader', required: true, canLead: true },
      { agentId: 'literature-reviewer', role: 'Search & Screening', required: true, canLead: false },
      { agentId: 'biostatistician', role: 'Meta-Analysis', required: true, canLead: false },
      { agentId: 'clinical-specialist', role: 'Clinical Relevance Review', required: true, canLead: false },
      { agentId: 'scientific-critic', role: 'Quality Gate', required: true, canLead: false },
      { agentId: 'scientific-writer', role: 'Final Report', required: true, canLead: false },
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
