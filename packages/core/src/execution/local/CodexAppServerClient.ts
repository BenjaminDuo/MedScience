import { JsonlRpcClient, JsonRpcNotificationMessage, JsonRpcRequestMessage } from './JsonlRpcClient.js';
import { RuntimeApprovalDecision, RuntimeApprovalRequest, LocalRuntimeExecutionProfile, RuntimeUsageDelta } from '../types.js';

/**
 * Adapter over the Codex App Server JSON-RPC protocol
 * (https://developers.openai.com/codex/app-server/). ONLY this file should
 * know Codex method/field names -- everything above it deals in MedScience's
 * own stable types (see ../types.ts and ../../types/events.ts).
 *
 * The protocol is young and evolves between Codex CLI releases. Where the
 * public docs leave a field's exact enum values unconfirmed (approval
 * policy / sandbox mode spelling in particular), this client asks the
 * server itself via `configRequirements/read` rather than hardcoding a
 * guess, and falls back to a conservative default if that call is
 * unavailable. If Codex changes a method name outright, the error surfaces
 * as RUNTIME_PROTOCOL_ERROR rather than hanging or crashing the app.
 */

export interface CodexThreadHandle {
  threadId: string;
}

export interface CodexTurnHandle {
  turnId: string;
}

export interface CodexEventCallbacks {
  onAgentMessageDelta?: (itemId: string, delta: string) => void;
  onItemStarted?: (item: { type?: string; id?: string; [key: string]: unknown }) => void;
  onItemCompleted?: (item: { type?: string; id?: string; [key: string]: unknown }) => void;
  onCommandOutputDelta?: (itemId: string, text: string) => void;
  onTurnStarted?: (turn: { id?: string }) => void;
  onTurnCompleted?: (turn: { id?: string; status?: string; error?: { message?: string } }) => void;
  /**
   * Fires on the app-server's `thread/tokenUsage/updated` notification
   * (https://developers.openai.com/codex/app-server/, "usage updates for
   * the active thread"). The delta passed here is the *per-turn* usage
   * (Codex's own `tokenUsage.last`, the same series it bills against) --
   * not the thread's running cumulative context-window occupancy
   * (`tokenUsage.total`), which is a different number that can shrink
   * after context compaction and would double-count across turns if
   * summed. See extractTokenUsage() below for exactly which raw fields
   * this is read from.
   */
  onTokenUsageUpdated?: (usage: RuntimeUsageDelta) => void;
  onApprovalRequest?: (request: RuntimeApprovalRequest) => Promise<RuntimeApprovalDecision>;
  onUnknownNotification?: (method: string) => void;
  /**
   * The underlying JSON-RPC transport died (process crash, malformed line,
   * oversized line, stdout closed unexpectedly, ...). Any request the caller
   * is currently waiting on -- most importantly a still-running turn -- is
   * NOT automatically failed by that alone: a fatal transport error only
   * rejects requests that are still *pending* at that instant, and a turn
   * waiting purely on notifications (agentMessage/delta, turn/completed)
   * has no pending request to reject, so without this hook it would hang
   * forever instead of surfacing an error.
   */
  onFatalError?: (error: Error) => void;
}

interface ConfigRequirements {
  allowedApprovalPolicies?: string[];
  allowedSandboxModes?: string[];
}

function decodeBase64Delta(deltaBase64?: string): string {
  if (!deltaBase64) return '';
  try {
    return Buffer.from(deltaBase64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Extracts a per-turn token-usage delta from a `thread/tokenUsage/updated`
 * notification's params. The app-server protocol is young and its exact
 * payload shape is not fully nailed down in the public docs at the time
 * this was written -- independent reports of real payloads describe a
 * `tokenUsage` (or `usage`) object with `last` (this turn's delta, used
 * for billing) and `total` (the thread's running context-window
 * occupancy) sub-objects, each with snake_case fields like
 * `total_tokens`/`input_tokens`/`output_tokens`/`cached_input_tokens`/
 * `reasoning_output_tokens`. This function deliberately checks several
 * plausible shapes/casings rather than trusting one exact path, so a
 * Codex build with slightly different field naming still gets *something*
 * captured instead of silently reporting zero -- prefer `last` (the
 * per-turn delta we want to sum across turns) over `total` (a snapshot,
 * not a delta, which would double-count if summed the same way).
 */
export function extractTokenUsage(params: Record<string, unknown>): RuntimeUsageDelta | undefined {
  const container =
    (params.tokenUsage as Record<string, unknown> | undefined) ||
    (params.usage as Record<string, unknown> | undefined) ||
    params;
  const bucket =
    (container.last as Record<string, unknown> | undefined) ||
    (container.total as Record<string, unknown> | undefined) ||
    container;
  if (!bucket || typeof bucket !== 'object') return undefined;

  const num = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const value = bucket[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return undefined;
  };

  const totalTokens = num('total_tokens', 'totalTokens');
  const inputTokens = num('input_tokens', 'inputTokens');
  const outputTokens = num('output_tokens', 'outputTokens');
  const cachedInputTokens = num('cached_input_tokens', 'cachedInputTokens');
  const reasoningOutputTokens = num('reasoning_output_tokens', 'reasoningOutputTokens');

  if (
    totalTokens === undefined &&
    inputTokens === undefined &&
    outputTokens === undefined &&
    cachedInputTokens === undefined &&
    reasoningOutputTokens === undefined
  ) {
    return undefined;
  }

  return { totalTokens, inputTokens, outputTokens, cachedInputTokens, reasoningOutputTokens };
}

export class CodexAppServerClient {
  private configRequirements?: ConfigRequirements;
  private runId: string;
  private sessionId: string;
  private callbacks: CodexEventCallbacks = {};

  constructor(private rpc: JsonlRpcClient, ids: { runId: string; sessionId: string }) {
    this.runId = ids.runId;
    this.sessionId = ids.sessionId;
    this.rpc.onNotification((message) => this.handleNotification(message));
    this.rpc.onServerRequest((message) => this.handleServerRequest(message));
    this.rpc.onFatalError((error) => this.callbacks.onFatalError?.(error));
  }

  public setCallbacks(callbacks: CodexEventCallbacks): void {
    this.callbacks = callbacks;
  }

  public async initialize(): Promise<unknown> {
    const result = await this.rpc.request(
      'initialize',
      {
        clientInfo: { name: 'medscience', title: 'MedScience', version: '1.4.0' },
      },
      10000
    );
    await this.rpc.notify('initialized', {});

    // Best-effort: not all Codex versions expose this, and its absence must
    // not fail startup.
    try {
      this.configRequirements = (await this.rpc.request('configRequirements/read', {}, 5000)) as ConfigRequirements;
    } catch {
      this.configRequirements = undefined;
    }

    return result;
  }

  /** Picks a real, server-accepted sandbox value for our stable preset, adapting to whatever enum spelling this Codex build uses. */
  private resolveSandboxMode(preset: LocalRuntimeExecutionProfile['sandboxPreset']): string {
    const allowed = this.configRequirements?.allowedSandboxModes;
    const wantReadOnly = preset === 'read-only';
    if (allowed && allowed.length > 0) {
      const match = allowed.find((v) =>
        wantReadOnly ? normalize(v).includes('readonly') : normalize(v).includes('workspacewrite')
      );
      if (match) return match;
      // Fall back to the first allowed value that is not full-access, rather
      // than one this build might reject.
      const safe = allowed.find((v) => !normalize(v).includes('dangerfullaccess') && !normalize(v).includes('fullaccess'));
      if (safe) return safe;
      return allowed[0];
    }
    return wantReadOnly ? 'read-only' : 'workspace-write';
  }

  /**
   * Our single supported preset is "prompt": ask for approval, never silently
   * auto-approve everything. Codex has renamed this enum's spelling across
   * versions (older builds: "unless-trusted"; current builds accept
   * "untrusted" | "on-request" | "granular" | "never" and reject the old
   * spelling outright), so prefer whatever this build's own
   * configRequirements/read reports, and fall back to the current spelling
   * -- not the retired one -- when that call is unsupported.
   */
  private resolveApprovalPolicy(): string {
    const allowed = this.configRequirements?.allowedApprovalPolicies;
    if (allowed && allowed.length > 0) {
      const preferenceOrder = ['untrusted', 'unlesstrusted', 'onrequest', 'granular', 'onfailure'];
      for (const pref of preferenceOrder) {
        const match = allowed.find((v) => normalize(v) === pref || normalize(v).includes(pref));
        if (match) return match;
      }
      // Last resort: anything that is not an always-approve / never-ask policy.
      const safe = allowed.find((v) => normalize(v) !== 'never' && !normalize(v).includes('full'));
      if (safe) return safe;
      return allowed[0];
    }
    return 'untrusted';
  }

  public async threadStart(params: {
    cwd: string;
    model?: string;
    sandboxPreset: LocalRuntimeExecutionProfile['sandboxPreset'];
  }): Promise<CodexThreadHandle> {
    const result = (await this.rpc.request(
      'thread/start',
      {
        cwd: params.cwd,
        model: params.model,
        sandbox: this.resolveSandboxMode(params.sandboxPreset),
        approvalPolicy: this.resolveApprovalPolicy(),
      },
      30000
    )) as { thread?: { id?: string } };

    const threadId = result?.thread?.id;
    if (!threadId) throw new Error('Codex app-server did not return a thread id from thread/start.');
    return { threadId };
  }

  public async threadResume(threadId: string): Promise<CodexThreadHandle> {
    const result = (await this.rpc.request('thread/resume', { threadId }, 30000)) as { thread?: { id?: string } };
    const resumedId = result?.thread?.id || threadId;
    return { threadId: resumedId };
  }

  public async turnStart(params: {
    threadId: string;
    text: string;
    cwd: string;
    sandboxPreset: LocalRuntimeExecutionProfile['sandboxPreset'];
  }): Promise<CodexTurnHandle> {
    const result = (await this.rpc.request(
      'turn/start',
      {
        threadId: params.threadId,
        input: [{ type: 'text', text: params.text }],
        cwd: params.cwd,
        sandbox: this.resolveSandboxMode(params.sandboxPreset),
        approvalPolicy: this.resolveApprovalPolicy(),
      },
      30000
    )) as { turn?: { id?: string } };

    const turnId = result?.turn?.id;
    if (!turnId) throw new Error('Codex app-server did not return a turn id from turn/start.');
    return { turnId };
  }

  public async turnInterrupt(threadId: string, turnId: string): Promise<void> {
    await this.rpc.request('turn/interrupt', { threadId, turnId }, 5000);
  }

  private handleNotification(message: JsonRpcNotificationMessage): void {
    const params = (message.params || {}) as Record<string, unknown>;
    switch (message.method) {
      case 'item/agentMessage/delta': {
        const itemId = String(params.itemId || '');
        const delta = String(params.delta || '');
        this.callbacks.onAgentMessageDelta?.(itemId, delta);
        return;
      }
      case 'item/started':
        this.callbacks.onItemStarted?.((params.item as Record<string, unknown>) || {});
        return;
      case 'item/completed':
        this.callbacks.onItemCompleted?.((params.item as Record<string, unknown>) || {});
        return;
      case 'item/commandExecution/outputDelta': {
        const itemId = String(params.itemId || '');
        const text = decodeBase64Delta(params.deltaBase64 as string | undefined);
        this.callbacks.onCommandOutputDelta?.(itemId, text);
        return;
      }
      case 'turn/started':
        this.callbacks.onTurnStarted?.((params.turn as Record<string, unknown>) || {});
        return;
      case 'turn/completed':
        this.callbacks.onTurnCompleted?.((params.turn as Record<string, unknown>) || {});
        return;
      case 'thread/tokenUsage/updated': {
        const usage = extractTokenUsage(params);
        if (usage) this.callbacks.onTokenUsageUpdated?.(usage);
        return;
      }
      default:
        // Deliberately not logging full payloads (may contain user content);
        // only the method name, per section 8.3 of the implementation guide.
        this.callbacks.onUnknownNotification?.(message.method);
    }
  }

  private async handleServerRequest(message: JsonRpcRequestMessage): Promise<unknown> {
    if (message.method === 'item/commandExecution/requestApproval' || message.method === 'item/fileChange/requestApproval') {
      const params = (message.params || {}) as Record<string, unknown>;
      const isCommand = message.method === 'item/commandExecution/requestApproval';
      const now = Date.now();
      const request: RuntimeApprovalRequest = {
        id: `appr-${now}-${Math.random().toString(36).slice(2, 8)}`,
        runId: this.runId,
        sessionId: this.sessionId,
        kind: isCommand ? 'command' : 'file-change',
        title: isCommand ? 'Command execution approval' : 'File change approval',
        summary: String(params.reason || (isCommand ? 'Codex wants to run a command.' : 'Codex wants to modify files.')),
        command: isCommand ? (params.command as string[] | undefined) : undefined,
        cwd: (params.cwd as string | undefined) || (params.grantRoot as string | undefined),
        files: !isCommand && params.grantRoot ? [String(params.grantRoot)] : undefined,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
      };

      if (!this.callbacks.onApprovalRequest) {
        // No UI wired up to answer -- default-deny per section 10.1/20.5.
        return 'decline';
      }

      const decision = await this.callbacks.onApprovalRequest(request);
      // availableDecisions on the real request tells us exactly which
      // strings this Codex build accepts; we only ever offer the three
      // simple decisions our UI supports (section 10.3: no blanket
      // "always allow" in the first version).
      const available = (params.availableDecisions as string[] | undefined) || ['accept', 'decline', 'cancel'];
      const wanted = decision === 'accept' ? 'accept' : decision === 'cancel' ? 'cancel' : 'decline';
      return available.includes(wanted) ? wanted : available.includes('decline') ? 'decline' : available[0];
    }

    throw new Error(`Unhandled server-initiated request: ${message.method}`);
  }
}
