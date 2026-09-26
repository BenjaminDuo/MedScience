import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ExecutionProfileManager } from '../src/config/ExecutionProfileManager';
import { ProfileManager } from '../src/config/ProfileManager';
import { writeFakeExecutable } from './platform';

function assertTrue(cond: boolean, message: string) {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
}

async function runTests() {
  console.log('\n=== Running ExecutionProfileManager Test Suite ===\n');
  const testDir = path.join(os.tmpdir(), `medscience-exec-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  try {
    console.log('[Test 1/6] First access migrates to a default API profile pointing at the active model profile');
    const modelProfiles = new ProfileManager(testDir);
    modelProfiles.saveProfile({
      id: 'prof-existing',
      name: 'Existing Model',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      model: 'demo-model',
      isDefault: true,
    } as any);

    const execManager = new ExecutionProfileManager(testDir, modelProfiles);
    const active = execManager.getActiveProfile();
    assertTrue(active.mode === 'api', 'Active profile should default to API mode');
    assertTrue((active as any).modelProfileId === 'prof-existing', 'Default API profile should reference the existing active model profile');
    assertTrue(fs.existsSync(path.join(testDir, 'execution.json')), 'execution.json should be created on first access');

    console.log('[Test 2/6] Existing API-mode behavior is unchanged after upgrade (no local-runtime profile yet)');
    const profiles = execManager.listProfiles();
    assertTrue(profiles.length === 1 && profiles[0].mode === 'api', 'Only the default API profile should exist before any local runtime is configured');

    console.log('[Test 3/6] Saving a local-runtime profile with a bogus executable path is rejected');
    const badSave = execManager.saveProfile(
      execManager.createDefaultLocalRuntimeProfile({ executablePath: path.join(testDir, 'does-not-exist') })
    );
    assertTrue(badSave.success === false, 'A non-existent executable path must fail validation');

    console.log('[Test 4/6] Saving a local-runtime profile with a real executable path succeeds and can be activated');
    const fakeExecutable = writeFakeExecutable(path.join(testDir, 'fake-codex'));
    const goodProfile = execManager.createDefaultLocalRuntimeProfile({ executablePath: fakeExecutable });
    const goodSave = execManager.saveProfile(goodProfile);
    assertTrue(goodSave.success === true, 'A valid local-runtime profile should save successfully');
    const setActive = execManager.setActiveProfile(goodSave.profile!.id);
    assertTrue(setActive === true, 'Should be able to switch the active execution profile to the new local-runtime profile');
    assertTrue(execManager.getActiveProfile().id === goodSave.profile!.id, 'Active profile should now be the local-runtime one');

    console.log('[Test 5/6] The last remaining profile cannot be deleted');
    const apiProfileId = execManager.listProfiles().find((p) => p.mode === 'api')!.id;
    execManager.deleteProfile(apiProfileId); // deletes the API one, one (local) profile remains
    const deleteLast = execManager.deleteProfile(goodSave.profile!.id);
    assertTrue(deleteLast === false, 'Deleting the only remaining execution profile must be refused');
    assertTrue(execManager.listProfiles().length === 1, 'Exactly one execution profile should remain');

    console.log('[Test 6/6] A corrupted execution.json is backed up rather than silently discarded');
    fs.writeFileSync(path.join(testDir, 'execution.json'), '{ this is not valid json');
    const recovered = new ExecutionProfileManager(testDir, modelProfiles).getActiveProfile();
    assertTrue(recovered.mode === 'api', 'A corrupted config should recover to a safe in-memory default rather than throwing');
    const backups = fs.readdirSync(testDir).filter((f) => f.startsWith('execution.json.corrupted-'));
    assertTrue(backups.length === 1, 'The corrupted file should be preserved as a timestamped backup, not overwritten silently');

    console.log('\n=== All ExecutionProfileManager tests passed ===\n');
  } finally {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('\n[ExecutionProfileManager tests FAILED]\n', err);
  process.exitCode = 1;
});
