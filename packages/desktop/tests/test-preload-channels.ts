import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiChannelNames } from '@medscience/core';

/**
 * preload.cjs allowlists channels by prefix. A channel added to the core
 * registry under a new namespace works in the web host (which dispatches
 * straight to the registry) but is rejected by the Electron bridge -- the
 * feature looks fine in `npm run web` and is dead in the desktop app. This
 * pins the two together.
 */
const preload = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'electron', 'preload.cjs'),
  'utf8'
);
const match = preload.match(/ALLOWED_INVOKE_PREFIXES\s*=\s*\[([^\]]*)\]/);
if (!match) {
  console.error('✗ could not find ALLOWED_INVOKE_PREFIXES in preload.cjs');
  process.exit(1);
}
const prefixes = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

console.log('\n=== Running Preload Channel Allowlist Test ===\n');
const blocked = apiChannelNames.filter((name) => !prefixes.some((p) => name.startsWith(p)));
if (blocked.length > 0) {
  console.error(`✗ channels the Electron bridge would block: ${blocked.join(', ')}`);
  process.exit(1);
}
console.log(`  ✔ all ${apiChannelNames.length} API channels pass the preload allowlist (${prefixes.join(' ')})`);
