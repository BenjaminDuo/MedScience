#!/usr/bin/env node
/**
 * A tiny stand-in for `codex app-server --listen stdio://`, used only by
 * packages/core/tests/test-execution-router.ts. It speaks just enough of
 * the real JSON-RPC-over-JSONL protocol (see developers.openai.com/codex/app-server)
 * to exercise CodexAppServerClient / CodexRuntimeBackend without needing a
 * real, authenticated Codex CLI install in CI.
 *
 * Behavior is controlled by environment variables so tests can select a
 * scenario:
 *   FAKE_CODEX_MODE=crash            exit(1) right after 'initialize'
 *   FAKE_CODEX_MODE=hang             never respond to turn/start
 *   FAKE_CODEX_MODE=bad-json         emit an unparsable line, then continue
 *   FAKE_CODEX_MODE=oversized-line   emit a single line far past normal size
 *   FAKE_CODEX_MODE=ignore-interrupt never respond to turn/interrupt
 *   FAKE_CODEX_MODE=approval         raise a command-approval request mid-turn
 *   FAKE_CODEX_MODE=fail-turn        turn/completed with status "failed"
 *   (unset / anything else)          plain happy path
 */
import readline from 'node:readline';

const mode = process.env.FAKE_CODEX_MODE || 'happy';
let nextServerRequestId = 1;
const pendingServerRequests = new Map();

function send(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function sendServerRequest(method, params) {
  const id = `srv-${nextServerRequestId++}`;
  return new Promise((resolve) => {
    pendingServerRequests.set(id, resolve);
    send({ jsonrpc: '2.0', id, method, params });
  });
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

let threadCounter = 1;
let turnCounter = 1;
let crashArmed = false; // set once 'initialize' has been answered in crash mode

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  // Deterministic crash: die before answering the *next* request after
  // initialize, rather than racing a fixed setTimeout against however fast
  // this particular IPC round-trip happens to be (a real spawned process is
  // often fast enough to finish the whole happy path well inside any small
  // fixed delay, which made this scenario flaky/unreproducible).
  if (crashArmed) {
    process.exit(1);
  }

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return; // ignore, mirrors a real server not talking back on garbage
  }

  // A response to one of OUR server-initiated requests (approvals).
  if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
    const resolver = pendingServerRequests.get(message.id);
    if (resolver) {
      pendingServerRequests.delete(message.id);
      resolver(message.result);
    }
    return;
  }

  const { id, method, params } = message;

  switch (method) {
    case 'initialize': {
      send({ jsonrpc: '2.0', id, result: { userAgent: 'fake-codex/0.0.0', platformFamily: 'test', platformOs: process.platform } });
      if (mode === 'crash') {
        crashArmed = true;
      }
      return;
    }
    case 'initialized':
      return; // notification, no response
    case 'configRequirements/read': {
      send({
        jsonrpc: '2.0',
        id,
        result: { allowedApprovalPolicies: ['unless-trusted', 'never'], allowedSandboxModes: ['read-only', 'workspace-write'] },
      });
      return;
    }
    case 'thread/start': {
      const threadId = `thr_fake_${threadCounter++}`;
      send({ jsonrpc: '2.0', id, result: { thread: { id: threadId, sessionId: threadId, createdAt: new Date().toISOString() } } });
      return;
    }
    case 'thread/resume': {
      if (params?.threadId === 'thr_missing') {
        send({ jsonrpc: '2.0', id, error: { code: -32001, message: 'thread not found' } });
        return;
      }
      send({ jsonrpc: '2.0', id, result: { thread: { id: params?.threadId, createdAt: new Date().toISOString() } } });
      return;
    }
    case 'turn/start': {
      if (mode === 'hang') return; // never respond; client should time out
      const turnId = `turn_fake_${turnCounter++}`;
      send({ jsonrpc: '2.0', id, result: { turn: { id: turnId, status: 'inProgress', items: [], error: null } } });
      send({ jsonrpc: '2.0', method: 'turn/started', params: { turn: { id: turnId } } });

      if (mode === 'bad-json') {
        process.stdout.write('{ this is not valid json\n');
        return;
      }
      if (mode === 'oversized-line') {
        process.stdout.write(`${'x'.repeat(9 * 1024 * 1024)}\n`);
        return;
      }

      const itemId = 'item-1';
      send({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { itemId, delta: 'Hello ' } });
      send({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { itemId, delta: 'from fake Codex.' } });

      if (mode === 'approval') {
        const decision = await sendServerRequest('item/commandExecution/requestApproval', {
          itemId: 'cmd-1',
          threadId: params?.threadId,
          turnId,
          reason: 'Fake command needs approval',
          command: ['echo', 'hi'],
          cwd: params?.cwd,
          availableDecisions: ['accept', 'decline', 'cancel'],
        });
        send({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { itemId, delta: ` (approval: ${decision})` } });
      }

      if (mode === 'fail-turn') {
        send({ jsonrpc: '2.0', method: 'turn/completed', params: { turn: { id: turnId, status: 'failed', error: { message: 'Simulated failure' } } } });
        return;
      }

      send({ jsonrpc: '2.0', method: 'turn/completed', params: { turn: { id: turnId, status: 'completed', error: null } } });
      return;
    }
    case 'turn/interrupt': {
      if (mode === 'ignore-interrupt') return; // never respond; client should time out and kill the process
      send({ jsonrpc: '2.0', id, result: {} });
      send({ jsonrpc: '2.0', method: 'turn/completed', params: { turn: { id: params?.turnId, status: 'interrupted', error: null } } });
      return;
    }
    default:
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `fake-codex: unhandled method ${method}` } });
  }
});
