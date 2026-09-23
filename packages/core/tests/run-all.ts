import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

/**
 * Runs every test script in this directory.
 *
 * `npm test` used to name eight files by hand, so the other twenty were
 * dead weight: they could break for months without anyone noticing, since
 * nothing ran them. Discovering the directory means a new test file is part
 * of the suite the moment it is written.
 *
 * Tests that need the public internet (live literature/database connectors)
 * are skipped by default so the suite is deterministic offline; run them
 * with MEDSCIENCE_TEST_NETWORK=1.
 */
const testsDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Tests write sessions, profiles and team runs through the same global
 * managers the app uses, and those default to ~/.medscience. Running the
 * suite used to litter the user's real session list with "Critique
 * Fail-Closed Test" and friends; each run now gets its own throwaway home.
 */
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'medscience-test-home-'));

/**
 * Tests that need the real outside world -- the public internet, or the
 * user's own configured model profile and API key. They are skipped by
 * default so the suite is deterministic offline and on a fresh machine, and
 * because the run below deliberately points MEDSCIENCE_HOME at a throwaway
 * directory (no real credentials in it).
 */
const LIVE_TESTS = new Set([
  'test-real-connectors.ts',
  'test-medical-connectors.ts',
  'test-evidence-verifier.ts',
  'test-medical-ai-multimodal.ts',
  // Probes a live model through the user's configured profile.
  'test-harness-live-injection.ts',
]);

const includeNetwork = process.env.MEDSCIENCE_TEST_NETWORK === '1';
const only = process.argv[2];

const files = fs
  .readdirSync(testsDir)
  .filter((name) => name.startsWith('test-') && name.endsWith('.ts'))
  .filter((name) => (only ? name.includes(only) : true))
  .sort();

const skipped: string[] = [];
const failed: string[] = [];
const started = Date.now();

for (const file of files) {
  if (!includeNetwork && LIVE_TESTS.has(file)) {
    skipped.push(file);
    continue;
  }
  process.stdout.write(`\n──── ${file} ────\n`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', path.join(testsDir, file)], {
    stdio: 'inherit',
    cwd: path.resolve(testsDir, '..'),
    // Live tests need the real config (API keys); everything else gets the
    // throwaway home so the suite never writes into ~/.medscience.
    env: LIVE_TESTS.has(file) ? process.env : { ...process.env, MEDSCIENCE_HOME: testHome },
  });
  if (result.status !== 0) failed.push(file);
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n════ ${files.length - skipped.length} test files run in ${seconds}s ════`);
if (skipped.length > 0) {
  console.log(
    `Skipped (need network and/or your configured API key; set MEDSCIENCE_TEST_NETWORK=1 to include): ${skipped.join(', ')}`
  );
}
if (failed.length > 0) {
  console.error(`\nFAILED: ${failed.join(', ')}`);
  process.exit(1);
}
fs.rmSync(testHome, { recursive: true, force: true });
console.log('All test files passed.');
