import { Readable, Writable } from 'node:stream';

const MAX_LINE_BYTES = 8 * 1024 * 1024; // 8 MiB guard against unbounded buffering

export interface JsonRpcRequestMessage {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotificationMessage {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcResponseMessage {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type JsonRpcInboundMessage =
  | JsonRpcResponseMessage
  | JsonRpcNotificationMessage
  | JsonRpcRequestMessage;

export type NotificationHandler = (message: JsonRpcNotificationMessage) => void;
/** A server-initiated request (e.g. an approval prompt). Return the result to reply with, or throw to send a JSON-RPC error. */
export type ServerRequestHandler = (message: JsonRpcRequestMessage) => Promise<unknown>;
export type FatalErrorHandler = (error: Error) => void;

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Pure JSON-RPC-over-JSONL transport. Knows nothing about Codex's own
 * methods (`thread/start`, `turn/start`, ...) -- that mapping belongs to
 * CodexAppServerClient. This class only guarantees: one JSON object per
 * line in, one JSON object per line out, request/response correlation,
 * and bounded memory use.
 */
export class JsonlRpcClient {
  private nextId = 1;
  private pending: Map<number | string, PendingEntry> = new Map();
  private buffer = '';
  private writeQueue: Promise<void> = Promise.resolve();
  private closed = false;
  private notificationHandler?: NotificationHandler;
  private serverRequestHandler?: ServerRequestHandler;
  private fatalErrorHandler?: FatalErrorHandler;

  private readonly handleStdoutData = (chunk: Buffer): void => this.onData(chunk);
  private readonly handleStdoutError = (err: Error): void => this.fail(err);
  private readonly handleStdoutClose = (): void => {
    if (!this.closed) this.fail(new Error('Codex app-server stdout closed unexpectedly.'));
  };

  constructor(private stdout: Readable, private stdin: Writable) {
    this.stdout.on('data', this.handleStdoutData);
    this.stdout.on('error', this.handleStdoutError);
    this.stdout.on('close', this.handleStdoutClose);
  }

  public onNotification(handler: NotificationHandler): void {
    this.notificationHandler = handler;
  }

  public onServerRequest(handler: ServerRequestHandler): void {
    this.serverRequestHandler = handler;
  }

  public onFatalError(handler: FatalErrorHandler): void {
    this.fatalErrorHandler = handler;
  }

  private onData(chunk: Buffer): void {
    if (this.closed) return;
    this.buffer += chunk.toString('utf-8');

    if (this.buffer.length > MAX_LINE_BYTES) {
      this.fail(new Error('Codex app-server produced a line exceeding the maximum buffer size.'));
      return;
    }

    let newlineIndex: number;
    // eslint-disable-next-line no-cond-assign
    while ((newlineIndex = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) continue;
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let message: JsonRpcInboundMessage;
    try {
      message = JSON.parse(line);
    } catch {
      this.fail(new Error('Received a malformed (non-JSON) line from Codex app-server.'));
      return;
    }

    if (typeof message !== 'object' || message === null) {
      this.fail(new Error('Received a non-object JSON-RPC message from Codex app-server.'));
      return;
    }

    // Response to one of our requests.
    if ('id' in message && ('result' in message || 'error' in message)) {
      const response = message as JsonRpcResponseMessage;
      const entry = this.pending.get(response.id);
      if (!entry) return; // stale/unknown id; ignore rather than crash
      this.pending.delete(response.id);
      clearTimeout(entry.timer);
      if (response.error) {
        entry.reject(new Error(response.error.message || `Codex app-server error ${response.error.code}`));
      } else {
        entry.resolve(response.result);
      }
      return;
    }

    // Server-initiated request (has id AND method, no result/error).
    if ('id' in message && 'method' in message) {
      const request = message as JsonRpcRequestMessage;
      if (this.serverRequestHandler) {
        this.serverRequestHandler(request)
          .then((result) => this.writeRaw({ jsonrpc: '2.0', id: request.id, result }))
          .catch((error: Error) =>
            this.writeRaw({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message } })
          );
      } else {
        this.writeRaw({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: `No handler registered for server-initiated method ${request.method}` },
        });
      }
      return;
    }

    // Plain notification.
    if ('method' in message) {
      this.notificationHandler?.(message as JsonRpcNotificationMessage);
      return;
    }

    // Unrecognized shape; do not crash the whole run over one bad message.
  }

  private writeRaw(payload: unknown): Promise<void> {
    const line = `${JSON.stringify(payload)}\n`;
    this.writeQueue = this.writeQueue.then(
      () =>
        new Promise<void>((resolve, reject) => {
          if (this.closed) {
            resolve();
            return;
          }
          this.stdin.write(line, (err) => (err ? reject(err) : resolve()));
        })
    );
    return this.writeQueue;
  }

  public request(method: string, params?: unknown, timeoutMs = 30000): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('JSON-RPC transport is closed.'));
    const id = this.nextId++;
    const payload: JsonRpcRequestMessage = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for response to "${method}" after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.writeRaw(payload).catch((error) => {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  public notify(method: string, params?: unknown): Promise<void> {
    const payload: JsonRpcNotificationMessage = { jsonrpc: '2.0', method, params };
    return this.writeRaw(payload);
  }

  private detachStreamListeners(): void {
    this.stdout.removeListener('data', this.handleStdoutData);
    this.stdout.removeListener('error', this.handleStdoutError);
    this.stdout.removeListener('close', this.handleStdoutClose);
  }

  private close(error: Error, notifyFatal: boolean): void {
    if (this.closed) return;
    this.closed = true;
    this.detachStreamListeners();
    this.buffer = '';
    this.pending.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.reject(error);
    });
    this.pending.clear();
    if (notifyFatal) this.fatalErrorHandler?.(error);
  }

  private fail(error: Error): void {
    this.close(error, true);
  }

  public dispose(): void {
    // Intentional teardown must not re-enter CodexRuntimeBackend's fatal-error
    // callback. Unexpected transport failure uses fail(), while backend-owned
    // disposal closes the transport quietly and lets the supervisor own the
    // child-process termination.
    this.close(new Error('JSON-RPC transport disposed.'), false);
    this.notificationHandler = undefined;
    this.serverRequestHandler = undefined;
    this.fatalErrorHandler = undefined;
    try {
      this.stdin.destroy();
    } catch {
      // best effort
    }
  }
}
