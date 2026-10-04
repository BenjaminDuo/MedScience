import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanTracker, EvidenceTracker } from '@medscience/core';
import { Markdown } from '../src/components/common/Markdown';

/**
 * Agent replies end with two Markdown tables (the plan checklist and the
 * evidence index). They used to be printed as raw "| --- |" text because
 * the message view never parsed Markdown at all. This renders the real
 * formatter output through the real component and checks for tables.
 */
let failures = 0;
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ✔ ${name}`);
    return;
  }
  failures += 1;
  console.log(`  ✗ ${name}${detail ? ` -- ${detail}` : ''}`);
}

console.log('\n=== Running Markdown Rendering Test Suite ===\n');

const plans = new PlanTracker();
plans.createPlan('s1', 'synthetic inquiry');
plans.startTask('s1', 'task-1');
plans.completeTask('s1', 'task-1', ['EV-1'], 'Resolved target | 2 records');
plans.startTask('s1', 'task-3');
// A failure note with a newline and a pipe -- the shape a Python traceback
// takes -- must not break the row.
plans.failTask('s1', 'task-3', 'Script execution failed: Traceback\n  File "x.py" | line 1');
const checklist = plans.formatPlanChecklist('s1', 'zh');

const evidence = new EvidenceTracker();
evidence.record('literature_search', 'literature', 'synthetic | query', 'Retrieved 3 synthetic records\nwith a line break', { ok: true });
const index = evidence.formatTraceabilityTable();

const html = renderToStaticMarkup(<Markdown>{`**Bold** finding.\n\n${checklist}\n\n${index}`}</Markdown>);
const tables = html.match(/<table/g)?.length ?? 0;
const rows = html.match(/<tr/g)?.length ?? 0;
const taskCount = plans.getPlan('s1')!.tasks.length;

check('both tables render as <table>', tables === 2, `found ${tables}`);
check('every task and evidence row is a table row', rows === taskCount + 1 + 2, `found ${rows} rows for ${taskCount} tasks + 1 evidence record (+2 headers)`);
check('no raw table syntax leaks into the page', !/\|\s*:?-{3}/.test(html));
check('bold text renders', html.includes('<strong'));
check('the escaped pipe stays inside its cell', html.includes('x.py&quot; | l') && html.includes('Resolved target | 2 records'));
check('raw HTML in model output is not rendered', !renderToStaticMarkup(<Markdown>{'<img src=x onerror=alert(1)>'}</Markdown>).includes('<img'));

if (failures > 0) {
  console.error(`\n✖ ${failures} Markdown rendering check(s) failed`);
  process.exit(1);
}
console.log('\n=== All Markdown Rendering tests passed ===\n');
