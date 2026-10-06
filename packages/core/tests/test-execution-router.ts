import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { ExecutionRouter } from '../src/execution/ExecutionRouter';
import { ApiResearchBackend } from '../src/execution/ApiResearchBackend';
import { CodexRuntimeBackend } from '../src/execution/local/CodexRuntimeBackend';
import { ExecutionProfileManager } from '../src/config/ExecutionProfileManager';
import { RuntimeDetector } from '../src/execution/local/RuntimeDetector';
import { SessionManager } from '../src/core/SessionManager';
import { EventBus } from '../src/core/EventBus';
import { LocalRuntimeExecutionProfile, RuntimeApprovalRequest, RuntimeApprovalDecision } from '../src/execution/types';
import { RuntimeEvent } from '../src/types/events';
import { canSpawnScriptAsRuntime, spawnableScript } from './platform';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'fake-codex-app-server.mjs');

function assertTrue(cond: boolean, message: string) {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
}

interface ProcessResourceInspection {
  _getActiveHandles?: () => unknown[];
  _getActiveRequests?: () => unknown[];
}

function describeActiveResource(resource: unknown): string {
  if (!resource || typeof resource !== 'object') return typeof resource;
  const value = resource as { constructor?: { name?: string }; pid?: number; exitCode?: number | null; destroyed?: boolean; readable?: boolean; writable?: boolean };
  const type = value.constructor?.name || 'object';
  const details = [
    value.pid !== undefined ? `pid=${value.pid}` : undefined,
    value.exitCode !== undefined ? `exitCode=${value.exitCode}` : undefined,
    value.destroyed !== undefined ? `destroyed=${value.destroyed}` : undefined,
    value.readable !== undefined ? `readable=${value.readable}` : undefined,
    value.writable !== undefined ? `writable=${value.writable}` : undefined,
  ].filter((detail): detail is string => detail !== undefined);
  return details.length > 0 ? `${type}(${details.join(',')})` : type;
}

async function debugActiveResources(label: string): Promise<void> {
  if (process.env.MEDSCIENCE_DEBUG_ACTIVE_HANDLES !== '1') return;
  // ChildProcess objects can remain visible in Node's diagnostic snapshot for
  // one or two event-loop turns after the close event; let that bookkeeping
  // settle so this opt-in report describes persistent resources, not a stale
  // same-tick object reference.
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  const inspection = process as unknown as ProcessResourceInspection;
  const handles = inspection._getActiveHandles?.() || [];
  const requests = inspection._getActiveRequests?.() || [];
  console.log(`[active-resources:${label}] handles=${handles.map(describeActiveResource).join(', ') || '(none)'} requests=${requests.map(describeActiveResource).join(', ') || '(none)'}`);
}

/** Fresh, isolated ExecutionRouter (+ backing managers) so tests never touch a real ~/.medscience. */
function makeRig(testDir: string) {
  const executionProfileManager = new ExecutionProfileManager(path.join(testDir, 'exec-config'));
  const sessionManager = new SessionManager(path.join(testDir, 'sessions'));
  const eventBus = new EventBus();
  const detector = new RuntimeDetector(); // real spawn, but we always pass an explicit executablePath so PATH/login-shell resolution is never exercised here.
  const codexBackend = new CodexRuntimeBackend(executionProfileManager, detector, sessionManager, eventBus);
  const apiBackend = new ApiResearchBackend();
  const router = new ExecutionRouter(executionProfileManager, apiBackend, codexBackend);

  const profile: LocalRuntimeExecutionProfile = executionProfileManager.createDefaultLocalRuntimeProfile({
    executablePath: spawnableScript(FIXTURE_PATH, testDir),
    workingDirectoryMode: 'project',
    sandboxPreset: 'workspace-write',
  });
  const saved = executionProfileManager.saveProfile(profile);
  assertTrue(saved.success, `Fixture profile should save cleanly: ${JSON.stringify(saved.errors)}`);
  executionProfileManager.setActiveProfile(saved.profile!.id);

  return { router, executionProfileManager, sessionManager, eventBus, codexBackend, profileId: saved.profile!.id };
}

async function runTests() {
  if (!canSpawnScriptAsRuntime()) {
    // Not a failure and not a silent pass: say why, and leave the suite green
    // so a real regression elsewhere still stands out.
    console.log(
      '\n=== ExecutionRouter suite skipped on Windows ===\n' +
        'The fake app-server is a Node script, and Node refuses to spawn .cmd/.bat without a\n' +
        'shell (CVE-2024-27980), which ChildProcessSupervisor deliberately does not use. A real\n' +
        'Windows install runs codex.exe; the protocol behaviour covered here is platform-independent.\n'
    );
    return;
  }

  console.log('\n=== Running ExecutionRouter / CodexRuntimeBackend Integration Test Suite (fake Codex app-server) ===\n');
  const rootTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medscience-execrouter-test-'));
  const originalMode = process.env.FAKE_CODEX_MODE;

  try {
    console.log('[Test 1/6] Happy path: a full turn completes with the expected agent response and persists session metadata');
    {
      delete process.env.FAKE_CODEX_MODE;
      const dir = path.join(rootTestDir, 't1');
      fs.mkdirSync(dir, { recursive: true });
      const { router, sessionManager, codexBackend } = makeRig(dir);
      const sessionId = 'sess-happy-1';
      const events: RuntimeEvent[] = [];

      try {
        const result = await router.execute(
          { prompt: 'Say hello', sessionId, cwd: dir },
          { onEvent: (e) => events.push(e) }
        );

        assertTrue(result.backend === 'local-runtime', `Expected backend local-runtime, got ${result.backend}`);
        assertTrue(
          result.turn.agentResponse === 'Hello from fake Codex.',
          `Expected agent response "Hello from fake Codex.", got "${result.turn.agentResponse}"`
        );
        assertTrue(result.turn.status === 'completed', `Expected turn status completed, got ${result.turn.status}`);
        assertTrue(!!result.runtimeThreadId, 'Expected a runtimeThreadId to be assigned');

        const persisted = sessionManager.getSession(sessionId);
        assertTrue(!!persisted, 'The session record should exist under the id we asked for (not a different, silently-minted id)');
        assertTrue(persisted!.turns.length === 1, `Expected exactly 1 persisted turn, got ${persisted!.turns.length}`);
        assertTrue(persisted!.executionMode === 'local-runtime', 'Session should be tagged with executionMode local-runtime');
        assertTrue(!!persisted!.runtimeThreadId, 'Session should have a persisted runtimeThreadId');

        const turnCompletedEvents = events.filter((e) => e.type === 'runtime.turn.completed');
        assertTrue(turnCompletedEvents.length === 1, `Expected exactly 1 runtime.turn.completed event, got ${turnCompletedEvents.length}`);
      } finally {
        await codexBackend.dispose();
        assertTrue(codexBackend.listActiveSessions().length === 0, 'dispose() should release the happy-path runtime handle');
      }
    }

    console.log('[Test 2/6] Thread resume: a second turn in the same session reuses the thread rather than starting fresh');
    {
      delete process.env.FAKE_CODEX_MODE;
      const dir = path.join(rootTestDir, 't2');
      fs.mkdirSync(dir, { recursive: true });
      const { router, codexBackend } = makeRig(dir);
      const sessionId = 'sess-resume-1';
      try {
        const first = await router.execute({ prompt: 'First turn', sessionId, cwd: dir });
        // Dispose the backend to force a brand new subprocess+client on the next call,
        // simulating an app restart mid-session; thread/resume should carry the
        // previously-assigned thread id across that boundary.
        await codexBackend.dispose();
        assertTrue(codexBackend.listActiveSessions().length === 0, 'dispose() should release the first resumable runtime handle');

        const second = await router.execute({ prompt: 'Second turn', sessionId, cwd: dir });
        assertTrue(
          second.runtimeThreadId === first.runtimeThreadId,
          `Expected resumed turn to keep threadId ${first.runtimeThreadId}, got ${second.runtimeThreadId}`
        );
      } finally {
        await codexBackend.dispose();
        assertTrue(codexBackend.listActiveSessions().length === 0, 'dispose() should release the resumed runtime handle');
      }
    }

    console.log('[Test 3/6] Approval flow: a mid-turn command-approval request round-trips through respondApproval');
    {
      process.env.FAKE_CODEX_MODE = 'approval';
      const dir = path.join(rootTestDir, 't3');
      fs.mkdirSync(dir, { recursive: true });
      const { router, codexBackend } = makeRig(dir);
      const sessionId = 'sess-approval-1';
      let sawApproval: RuntimeApprovalRequest | undefined;
      try {
        const result = await router.execute(
          { prompt: 'Run a command', sessionId, cwd: dir },
          {
            onApprovalRequest: (request) => {
              sawApproval = request;
              // Respond asynchronously, the way a real UI would after the person clicks "Allow".
              setTimeout(() => {
                router.respondApproval(sessionId, request.id, 'accept' as RuntimeApprovalDecision);
              }, 10);
            },
          }
        );
        assertTrue(!!sawApproval, 'onApprovalRequest should have fired');
        assertTrue(sawApproval!.kind === 'command', `Expected approval kind "command", got ${sawApproval!.kind}`);
        assertTrue(
          result.turn.agentResponse.includes('(approval: accept)'),
          `Expected agent response to reflect the accepted approval, got "${result.turn.agentResponse}"`
        );
      } finally {
        await codexBackend.dispose();
        assertTrue(codexBackend.listActiveSessions().length === 0, 'dispose() should release the approval runtime handle');
        delete process.env.FAKE_CODEX_MODE;
      }
    }

    console.log('[Test 4/6] Cancellation before the turn ever starts (still handshaking) tears the process down and rejects the run');
    {
      process.env.FAKE_CODEX_MODE = 'hang'; // turn/start is never answered
      const dir = path.join(rootTestDir, 't4');
      fs.mkdirSync(dir, { recursive: true });
      const { router, codexBackend } = makeRig(dir);
      const sessionId = 'sess-cancel-1';
      try {
        let runIdSeen: string | undefined;
        const execPromise = router
          .execute(
            { prompt: 'This will hang', sessionId, cwd: dir, runId: 'run-cancel-test-1' },
            {
              onEvent: (e) => {
                if (e.type === 'runtime.turn.started') runIdSeen = (e.payload as any).runId;
              },
            }
          )
          .catch((error: Error) => ({ rejected: true, error }));
        runIdSeen = 'run-cancel-test-1'; // we passed it explicitly, no need to wait on the event

        // Give the fake server a brief moment to accept the connection and answer initialize/thread-start.
        await new Promise((r) => setTimeout(r, 150));

        const cancelled = await router.cancel(runIdSeen!);
        assertTrue(cancelled === true, 'cancel() should report true for a run that was actually torn down');
        assertTrue(codexBackend.listActiveSessions().length === 0, 'cancellation should release the owned runtime handle');

        const outcome = (await execPromise) as any;
        assertTrue(outcome?.rejected === true, 'The hung execute() call should reject once its process is terminated mid-handshake');
        await debugActiveResources('after-cancellation');
      } finally {
        await codexBackend.dispose();
        assertTrue(codexBackend.listActiveSessions().length === 0, 'final cancellation cleanup should leave no active runtime sessions');
        delete process.env.FAKE_CODEX_MODE;
      }
    }

    console.log('[Test 5/6] A crash between initialize and thread/start does not leave a dead handle cached for the session');
    {
      process.env.FAKE_CODEX_MODE = 'crash'; // exits the process ~20ms after answering initialize
      const dir = path.join(rootTestDir, 't5');
      fs.mkdirSync(dir, { recursive: true });
      const { router, codexBackend } = makeRig(dir);
      const sessionId = 'sess-crash-1';
      try {
        let firstError: Error | undefined;
        try {
          await router.execute({ prompt: 'Will crash', sessionId, cwd: dir });
        } catch (error) {
          firstError = error as Error;
        }
        assertTrue(!!firstError, 'The first call should surface the crash as a rejection, not silently succeed');
        assertTrue(codexBackend.listActiveSessions().length === 0, 'fatal handshake cleanup should remove the dead runtime handle');
        await debugActiveResources('after-crash-recovery');

        // Recovering: switch back to the happy path and confirm a retry for the
        // *same* sessionId spawns a fresh process rather than reusing a dead handle
        // (which would fail immediately with "transport is closed").
        delete process.env.FAKE_CODEX_MODE;
        const retry = await router.execute({ prompt: 'Retry after crash', sessionId, cwd: dir });
        assertTrue(
          retry.turn.agentResponse === 'Hello from fake Codex.',
          `Expected the retry to succeed against a fresh process, got "${retry.turn.agentResponse}"`
        );
      } finally {
        await codexBackend.dispose();
        assertTrue(codexBackend.listActiveSessions().length === 0, 'final crash-recovery cleanup should leave no active runtime sessions');
        delete process.env.FAKE_CODEX_MODE;
      }
    }

    console.log('[Test 6/6] A failed turn is recorded with status error, and a malformed line from the server does not crash the client');
    {
      process.env.FAKE_CODEX_MODE = 'fail-turn';
      const dir = path.join(rootTestDir, 't6');
      fs.mkdirSync(dir, { recursive: true });
      const { router, sessionManager, codexBackend } = makeRig(dir);
      const sessionId = 'sess-fail-1';
      try {
        const result = await router.execute({ prompt: 'This will fail server-side', sessionId, cwd: dir });
        assertTrue(result.turn.status === 'error', `Expected turn status "error", got ${result.turn.status}`);
        const persisted = sessionManager.getSession(sessionId);
        assertTrue(persisted!.status === 'error', `Expected session status "error", got ${persisted!.status}`);
      } finally {
        await codexBackend.dispose();
        assertTrue(codexBackend.listActiveSessions().length === 0, 'failed-turn dispose should release the runtime handle');
        delete process.env.FAKE_CODEX_MODE;
      }

      // bad-json: the fake server emits one unparsable line right after turn/started,
      // then never completes the turn. The transport should fail cleanly (fatal
      // error -> rejected pending requests) rather than throwing an uncaught
      // exception that would take down the whole process.
      process.env.FAKE_CODEX_MODE = 'bad-json';
      const dir2 = path.join(rootTestDir, 't6b');
      fs.mkdirSync(dir2, { recursive: true });
      const rig2 = makeRig(dir2);
      try {
        let threw = false;
        try {
          await rig2.router.execute({ prompt: 'Will see malformed JSON', sessionId: 'sess-badjson-1', cwd: dir2 });
        } catch {
          threw = true;
        }
        assertTrue(threw, 'A malformed line from the server should surface as a rejected run, not hang or crash the test process');
      } finally {
        await rig2.codexBackend.dispose();
        assertTrue(rig2.codexBackend.listActiveSessions().length === 0, 'fatal bad-json cleanup should remove the dead runtime handle');
        await debugActiveResources('after-bad-json');
        delete process.env.FAKE_CODEX_MODE;
      }
    }

    console.log('\n=== All ExecutionRouter / CodexRuntimeBackend integration tests passed ===\n');
  } finally {
    if (originalMode === undefined) delete process.env.FAKE_CODEX_MODE;
    else process.env.FAKE_CODEX_MODE = originalMode;
    fs.rmSync(rootTestDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('\n[ExecutionRouter integration tests FAILED]\n', err);
  process.exitCode = 1;
});
