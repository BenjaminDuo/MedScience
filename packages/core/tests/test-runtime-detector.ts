import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn as realSpawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { RuntimeDetector, SpawnFn } from '../src/execution/local/RuntimeDetector';
import { isWindows, writeFakeExecutable } from './platform';

function assertTrue(cond: boolean, message: string) {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
}

/** A fake `spawn` that only understands `--version` and `app-server --help`, for probe tests without touching a real binary. */
function makeFakeSpawn(behavior: { version?: string; appServerOk?: boolean; timeoutOn?: string[] }): SpawnFn {
  return ((command: string, args: string[]) => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const fake: any = {
      stdout,
      stderr,
      kill: () => {},
      on: (event: string, cb: (...a: any[]) => void) => {
        if (behavior.timeoutOn?.includes(args[0])) return fake; // never fires close/exit -> caller's timeout wins
        if (event === 'close') {
          setTimeout(() => {
            if (args[0] === '--version') {
              stdout.emit('data', Buffer.from(`codex-cli ${behavior.version || '1.2.3'}\n`));
              cb(0);
            } else if (args[0] === 'app-server') {
              if (behavior.appServerOk === false) {
                stderr.emit('data', Buffer.from('unknown subcommand\n'));
                cb(1);
              } else {
                stdout.emit('data', Buffer.from('Usage: codex app-server [--listen <addr>]\n'));
                cb(0);
              }
            } else {
              cb(0);
            }
          }, 5);
        }
        return fake;
      },
    };
    return fake;
  }) as unknown as SpawnFn;
}

async function runTests() {
  console.log('\n=== Running RuntimeDetector Test Suite ===\n');
  const testDir = path.join(os.tmpdir(), `medscience-detector-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  const originalPath = process.env.PATH;
  const originalEnvVar = process.env.MEDSCIENCE_CODEX_PATH;

  try {
    console.log('[Test 1/6] Explicit configured path that does not exist is reported as invalid, not silently skipped');
    {
      const detector = new RuntimeDetector(makeFakeSpawn({}));
      const resolved = await detector.resolveExecutablePath(path.join(testDir, 'nope'));
      assertTrue(resolved.invalidConfigured === true, 'A bogus configured path should be flagged invalid');
      assertTrue(!resolved.path, 'No path should be returned for an invalid configured path');
    }

    console.log('[Test 2/6] Explicit configured path that exists is used as-is (highest priority)');
    {
      const realFile = path.join(testDir, 'my-codex');
      fs.writeFileSync(realFile, '#!/bin/sh\n', { mode: 0o755 });
      const detector = new RuntimeDetector(makeFakeSpawn({}));
      const resolved = await detector.resolveExecutablePath(realFile);
      assertTrue(resolved.path === realFile, 'Configured path should resolve to itself');
      assertTrue(resolved.source === 'configured', 'Source should be "configured"');
    }

    console.log('[Test 3/6] PATH scan finds an executable named codex before falling back to login shell');
    {
      const binDir = path.join(testDir, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      // RuntimeDetector looks for codex.exe/codex.cmd on Windows and plain
      // `codex` elsewhere, so the fixture has to be named the way the
      // platform would actually ship it.
      const codexPath = isWindows ? path.join(binDir, 'codex.cmd') : path.join(binDir, 'codex');
      writeFakeExecutable(isWindows ? path.join(binDir, 'codex') : codexPath);
      process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;
      delete process.env.MEDSCIENCE_CODEX_PATH;

      const detector = new RuntimeDetector(makeFakeSpawn({}));
      const resolved = await detector.resolveExecutablePath(undefined);
      assertTrue(resolved.path === codexPath, 'PATH scan should find the codex executable');
      assertTrue(resolved.source === 'path', 'Source should be "path"');
    }

    console.log('[Test 4/6] Nothing found anywhere reports not-found rather than throwing');
    {
      process.env.PATH = testDir; // a directory with no "codex" binary in it
      delete process.env.MEDSCIENCE_CODEX_PATH;
      // Fake login-shell spawn: always "not found" (exit 1, no stdout).
      const spawnFn: SpawnFn = ((command: string, args: string[]) => {
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const fake: any = {
          stdout,
          stderr,
          kill: () => {},
          on: (event: string, cb: (...a: any[]) => void) => {
            if (event === 'close') setTimeout(() => cb(1), 5);
            return fake;
          },
        };
        return fake;
      }) as unknown as SpawnFn;

      const detector = new RuntimeDetector(spawnFn);
      const resolved = await detector.resolveExecutablePath(undefined, { bypassLoginShellCache: true });
      assertTrue(!resolved.path, 'No executable should be found');
      const probe = await detector.probe(undefined, { bypassLoginShellCache: true });
      assertTrue(probe.available === false, 'probe() should report unavailable');
      assertTrue(probe.errorCode === 'RUNTIME_NOT_FOUND', 'probe() should report RUNTIME_NOT_FOUND');
    }

    console.log('[Test 5/6] probeVersion parses a semver-looking version string from stdout');
    {
      const detector = new RuntimeDetector(makeFakeSpawn({ version: '4.5.6' }));
      const result = await detector.probeVersion('/fake/path/codex');
      assertTrue(result.version === '4.5.6', `Expected version 4.5.6, got ${result.version}`);
    }

    console.log('[Test 6/6] probeAppServerCapability reports unavailable when the subcommand is unknown');
    {
      const detector = new RuntimeDetector(makeFakeSpawn({ appServerOk: false }));
      const result = await detector.probeAppServerCapability('/fake/path/codex');
      assertTrue(result.available === false, 'app-server capability should be reported as unavailable');
    }

    console.log('\n=== All RuntimeDetector tests passed ===\n');
  } finally {
    process.env.PATH = originalPath;
    if (originalEnvVar === undefined) delete process.env.MEDSCIENCE_CODEX_PATH;
    else process.env.MEDSCIENCE_CODEX_PATH = originalEnvVar;
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('\n[RuntimeDetector tests FAILED]\n', err);
  process.exitCode = 1;
});
