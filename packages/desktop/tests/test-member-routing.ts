import { builtInTeamAgents } from '@medscience/core';
import type { AgentDefinition } from '@medscience/core';
import { parseMention, mentionQueryAt, matchMembers, suggestMember } from '../src/lib/memberRouting';

/**
 * The composer's routing rules: an @mention picks who answers, and a plain
 * message may offer a specialist. Both replaced settings the user used to
 * have to choose before writing anything, so the rules themselves are now
 * the product behaviour worth pinning.
 */
const agents = builtInTeamAgents as AgentDefinition[];
let failures = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ✔ ${name}`);
    return;
  }
  failures += 1;
  console.log(`  ✗ ${name}${detail ? ` -- ${detail}` : ''}`);
}

console.log('\n=== Running Member Routing Test Suite ===\n');

console.log('[1/3] An @mention picks the member and leaves the message clean');
const zh = parseMention('@医学影像分析专家 这套 CT 数据怎么分割', agents);
check('a Chinese display name resolves', zh.agentId === 'medical-imaging-specialist', String(zh.agentId));
check('the mention is stripped from what gets sent', !zh.text.includes('@'), zh.text);

const en = parseMention('can @Biostatistician check my sample size?', agents);
check('an inline English mention resolves', en.agentId === 'biostatistician', String(en.agentId));
check('text either side of the mention survives', en.text === 'can check my sample size?', en.text);
check('no mention means no routing', parseMention('no mention here', agents).agentId === undefined);
check(
  'the longest matching name wins',
  parseMention('@Machine Learning Specialist tune this', agents).agentId === 'ml-specialist'
);

console.log('[2/3] The picker opens on a real mention, not on an email address');
check('caret inside an @token opens it', mentionQueryAt('ask @bio', 8)?.query === 'bio');
check('an email address does not', mentionQueryAt('a@b.com', 7) === undefined);
check(
  'candidates match on title, not just name',
  matchMembers(agents, 'imag').some((a) => a.id === 'medical-imaging-specialist')
);

console.log('[3/3] A plain message offers a specialist only when one clearly fits');
check(
  'an imaging question offers the imaging specialist',
  suggestMember('how do I handle DICOM segmentation for this cohort', agents, 'general-expert')?.agent.id ===
    'medical-imaging-specialist'
);
check(
  'a statistics question offers the biostatistician',
  suggestMember('what is the p value and confidence interval', agents, 'general-expert')?.agent.id ===
    'biostatistician'
);
// Two CJK characters is a word; holding Chinese triggers to the Latin
// three-character minimum made every one of them unreachable.
check(
  'a Chinese epidemiology question offers the epidemiologist',
  suggestMember('帮我看看这个队列研究的混杂因素', agents, 'general-expert')?.agent.id === 'epidemiologist'
);
check('small talk offers nobody', suggestMember('hello there', agents, 'general-expert') === undefined);
check('a two-word fragment offers nobody', suggestMember('hi', agents, 'general-expert') === undefined);
check(
  'the member already answering is never offered',
  suggestMember('literature review please', agents, 'literature-reviewer')?.agent.id !== 'literature-reviewer'
);

if (failures > 0) {
  console.error(`\nMember Routing tests FAILED: ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log('\n=== All Member Routing tests passed ===\n');
