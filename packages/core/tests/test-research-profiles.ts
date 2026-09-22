import {
  AutonomousResearchEngine,
  globalSessionManager,
  globalEventBus,
  globalToolRegistry,
  globalPlanTracker,
  RESEARCH_PROFILES,
  getResearchProfile,
  buildPlanTasksForProfile,
} from '@medscience/core';

function assert(cond: any, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  OK: ${msg}`);
  }
}

console.log('=== ResearchProfiles sanity ===');
assert(RESEARCH_PROFILES.length === 4, 'exactly 4 profiles registered');
assert(getResearchProfile(undefined).id === 'general', 'undefined id falls back to general');
assert(getResearchProfile('bogus').id === 'general', 'unknown id falls back to general');
assert(getResearchProfile('literature-review').id === 'literature-review', 'literature-review resolves');

for (const p of RESEARCH_PROFILES) {
  const tasks = buildPlanTasksForProfile(p.id);
  assert(tasks.length === 5, `${p.id}: builds exactly 5 tasks`);
  assert(tasks[0].id === 'task-1' && tasks[4].id === 'task-5', `${p.id}: task ids are task-1..task-5`);
  const defaults = tasks.filter((t) => t.isDefaultTask);
  assert(defaults.length === 1, `${p.id}: exactly one default/catch-all task`);
  assert(tasks.every((t) => t.status === 'pending' && t.evidenceIds.length === 0), `${p.id}: fresh tasks start pending with no evidence`);
}

console.log('\n=== literature-review profile actually drives plan creation + routing ===');
const session = globalSessionManager.createSession(
  'Survey Parkinson detection papers',
  'proj-1',
  'research',
  undefined,
  undefined,
  undefined,
  'research',
  'literature-review'
);
assert(session.researchProfileId === 'literature-review', 'session persisted researchProfileId');

const plan = globalPlanTracker.createPlan(session.id, 'test', buildPlanTasksForProfile(session.researchProfileId));
assert(plan.tasks[0].title.includes('Systematic Literature Search'), 'task-1 title matches literature-review template, not general');
assert(plan.tasks[0].toolMatchers?.includes('arxiv'), 'task-1 routes arxiv_search via toolMatchers');
assert(!!plan.tasks.find((t) => t.isDefaultTask)?.id, 'has a default task id');

// Simulate the engine's routing lookup logic directly (same algorithm as
// AutonomousResearchEngine.run()'s tool-call branch) against a couple of
// representative tool names for this profile.
function routeFor(toolName: string): string {
  const matched = plan.tasks.find((t) => t.toolMatchers && t.toolMatchers.length > 0 && t.toolMatchers.some((m) => toolName.includes(m)));
  const def = plan.tasks.find((t) => t.isDefaultTask);
  return matched?.id || def?.id || plan.tasks[0].id;
}
assert(routeFor('arxiv_search') === 'task-1', 'arxiv_search routes to task-1 (literature search)');
assert(routeFor('uniprot_lookup') === plan.tasks.find((t) => t.isDefaultTask)!.id, 'uniprot_lookup (not a literature-review matcher) falls to the default task');
assert(routeFor('python_runner') === 'task-3', 'python_runner routes to task-3 (bibliometrics/computation)');

console.log('\n=== general profile preserves original hardcoded routing behavior ===');
const generalTasks = buildPlanTasksForProfile('general');
function routeGeneral(toolName: string): string {
  const matched = generalTasks.find((t) => t.toolMatchers && t.toolMatchers.length > 0 && t.toolMatchers.some((m) => toolName.includes(m)));
  const def = generalTasks.find((t) => t.isDefaultTask);
  return matched?.id || def?.id || generalTasks[0].id;
}
assert(routeGeneral('uniprot_lookup') === 'task-1', 'general: uniprot_lookup -> task-1 (matches old hardcoded behavior)');
assert(routeGeneral('pdb_lookup') === 'task-1', 'general: pdb_lookup -> task-1');
assert(routeGeneral('python_runner') === 'task-3', 'general: python_runner -> task-3');
assert(routeGeneral('medical_imaging_process') === 'task-3', 'general: medical_imaging_process -> task-3 (matches "imaging")');
assert(routeGeneral('clinical_nlp_analyze') === 'task-3', 'general: clinical_nlp_analyze -> task-3 (matches "nlp" before "clinical", same priority as old if/else chain)');
assert(routeGeneral('clinical_trials_lookup') === 'task-4', 'general: clinical_trials_lookup -> task-4');
assert(routeGeneral('openfda_lookup') === 'task-4', 'general: openfda_lookup -> task-4');
assert(routeGeneral('rxnorm_lookup') === 'task-4', 'general: rxnorm_lookup -> task-4');
assert(routeGeneral('chembl_lookup') === 'task-2', 'general: chembl_lookup -> task-2 (default/catch-all, matches old fallback)');
assert(routeGeneral('pubchem_lookup') === 'task-2', 'general: pubchem_lookup -> task-2 (default/catch-all)');

globalSessionManager.deleteSession(session.id);

if (process.exitCode === 1) {
  console.log('\n✖ SOME RESEARCH PROFILE TESTS FAILED');
} else {
  console.log('\n✔ ALL RESEARCH PROFILE TESTS PASSED');
}
