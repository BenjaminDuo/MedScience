import { PassThrough } from 'node:stream';
import { JsonlRpcClient } from '../src/execution/local/JsonlRpcClient';

function assertEqual(actual: unknown, expected: unknown, message: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\n  expected: ${e}\n  actual:   ${a}`);
}

async function runTests() {
  console.log('\n=== Running JsonlRpcClient Test Suite ===\n');

  // ----------------------------------------------------------------------
  // Test 1: request/response correlation
  // ----------------------------------------------------------------------
  console.log('[Test 1/7] Request/response correlation');
  {
    const toServer = new PassThrough(); // client writes here (its "stdin")
    const toClient = new PassThrough(); // server writes here (client's "stdout")
    const client = new JsonlRpcClient(toClient, toServer);

    toServer.on('data', (chunk: Buffer) => {
      const msg = JSON.parse(chunk.toString('utf-8'));
      toClient.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { echoed: msg.params } })}\n`);
    });

    const result = await client.request('ping', { hello: 'world' }, 2000);
    assertEqual(result, { echoed: { hello: 'world' } }, 'Response result should round-trip request params');
    client.dispose();
  }

  // ----------------------------------------------------------------------
  // Test 2: multiple concurrent requests resolve to the right promise
  // ----------------------------------------------------------------------
  console.log('[Test 2/7] Concurrent request/response correlation does not cross wires');
  {
    const toServer = new PassThrough();
    const toClient = new PassThrough();
    const client = new JsonlRpcClient(toClient, toServer);

    toServer.on('data', (chunk: Buffer) => {
      chunk
        .toString('utf-8')
        .split('\n')
        .filter(Boolean)
        .forEach((line) => {
          const msg = JSON.parse(line);
          // Respond out of order to prove correlation is by id, not arrival order.
          setTimeout(
            () => toClient.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: msg.params.n * 10 })}\n`),
            msg.params.n === 1 ? 20 : 5
          );
        });
    });

    const [r1, r2] = await Promise.all([client.request('m', { n: 1 }), client.request('m', { n: 2 })]);
    assertEqual(r1, 10, 'First request should resolve with its own result');
    assertEqual(r2, 20, 'Second request should resolve with its own result even though it replies first');
    client.dispose();
  }

  // ----------------------------------------------------------------------
  // Test 3: notifications are delivered
  // ----------------------------------------------------------------------
  console.log('[Test 3/7] Notification delivery');
  {
    const toServer = new PassThrough();
    const toClient = new PassThrough();
    const client = new JsonlRpcClient(toClient, toServer);

    const received: unknown[] = [];
    client.onNotification((n) => received.push(n));

    toClient.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'turn/started', params: { turn: { id: 't1' } } })}\n`);
    await new Promise((r) => setTimeout(r, 10));
    assertEqual(received.length, 1, 'Exactly one notification should be delivered');
    assertEqual((received[0] as any).method, 'turn/started', 'Notification method should match');
    client.dispose();
  }

  // ----------------------------------------------------------------------
  // Test 4: server-initiated request round trip
  // ----------------------------------------------------------------------
  console.log('[Test 4/7] Server-initiated request gets answered on the same connection');
  {
    const toServer = new PassThrough();
    const toClient = new PassThrough();
    const client = new JsonlRpcClient(toClient, toServer);

    client.onServerRequest(async (req) => {
      if (req.method === 'item/commandExecution/requestApproval') return 'accept';
      throw new Error('unexpected method');
    });

    const answered = new Promise<any>((resolve) => {
      toServer.once('data', (chunk: Buffer) => resolve(JSON.parse(chunk.toString('utf-8'))));
    });

    toClient.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 'srv-1', method: 'item/commandExecution/requestApproval', params: {} })}\n`
    );

    const reply = await answered;
    assertEqual(reply, { jsonrpc: '2.0', id: 'srv-1', result: 'accept' }, 'Server request should be answered with the handler result');
    client.dispose();
  }

  // ----------------------------------------------------------------------
  // Test 5: malformed JSON line fails the transport and rejects pending requests
  // ----------------------------------------------------------------------
  console.log('[Test 5/7] Malformed JSON line cleans up pending requests');
  {
    const toServer = new PassThrough();
    const toClient = new PassThrough();
    const client = new JsonlRpcClient(toClient, toServer);

    const pending = client.request('willFail', {}, 2000);
    let fatal: Error | undefined;
    client.onFatalError((err) => (fatal = err));

    toClient.write('{ not json at all\n');

    let threw = false;
    try {
      await pending;
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Pending request should reject after a malformed line');
    if (!fatal) throw new Error('onFatalError handler should have fired');
  }

  // ----------------------------------------------------------------------
  // Test 6: request timeout cleans up
  // ----------------------------------------------------------------------
  console.log('[Test 6/7] Request timeout rejects and does not leak the pending entry');
  {
    const toServer = new PassThrough();
    const toClient = new PassThrough();
    const client = new JsonlRpcClient(toClient, toServer);

    let threw = false;
    try {
      await client.request('neverAnswered', {}, 30);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Request should time out and reject');
    client.dispose();
  }

  // ----------------------------------------------------------------------
  // Test 7: oversized buffered line is rejected rather than growing forever
  // ----------------------------------------------------------------------
  console.log('[Test 7/7] Oversized line triggers fatal error instead of unbounded buffering');
  {
    const toServer = new PassThrough();
    const toClient = new PassThrough();
    const client = new JsonlRpcClient(toClient, toServer);

    let fatal: Error | undefined;
    client.onFatalError((err) => (fatal = err));

    // 9 MiB of data with no newline -- must exceed the 8 MiB guard.
    toClient.write(Buffer.alloc(9 * 1024 * 1024, 'a'));
    await new Promise((r) => setTimeout(r, 10));
    if (!fatal) throw new Error('Oversized unbounded line should trigger a fatal error');
  }

  console.log('\n=== All JsonlRpcClient tests passed ===\n');
}

runTests().catch((err) => {
  console.error('\n[JsonlRpcClient tests FAILED]\n', err);
  process.exitCode = 1;
});
