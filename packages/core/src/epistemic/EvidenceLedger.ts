import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Provenance-typed evidence ledger: the one durable store that conclusions
 * are allowed to rest on across sessions.
 *
 * Model. Two kinds of entries -- evidence (what a tool returned) and claims
 * (statements that cite evidence as support or refutation) -- each in one of
 * six states. Entries only change state along ALLOWED_TRANSITIONS, and every
 * change is an event appended to a hash chain, so the history is complete
 * and any later edit of the file is detectable.
 *
 * Invariants (checkInvariants enforces them; tests exercise each):
 *  I1  A verified claim cites at least one supporting evidence entry, and
 *      every supporting entry is itself verified.
 *  I2  No verified evidence carries patient data without authorisation.
 *  I3  A superseded claim names an existing successor claim.
 *  I4  The event log is a valid hash chain and replays only legal
 *      transitions.
 *
 * I1 is kept true by a cascade, not by trust: when evidence leaves the
 * verified state (contested, quarantined, superseded or revoked), every
 * verified claim that rests on it is moved to contested in the same
 * operation. Belief revision is therefore non-monotonic but never silent:
 * a retracted paper takes the conclusions built on it down with it, and the
 * log records why. Restoring evidence does not restore claims; they must be
 * re-promoted, which re-checks I1.
 */

export type LedgerState = 'candidate' | 'verified' | 'contested' | 'quarantined' | 'superseded' | 'revoked';
export type LedgerKind = 'evidence' | 'claim';

export const LEDGER_STATES: LedgerState[] = ['candidate', 'verified', 'contested', 'quarantined', 'superseded', 'revoked'];

export const ALLOWED_TRANSITIONS: Record<LedgerState, LedgerState[]> = {
  candidate: ['verified', 'contested', 'quarantined', 'revoked'],
  verified: ['contested', 'quarantined', 'superseded', 'revoked'],
  contested: ['verified', 'quarantined', 'superseded', 'revoked'],
  quarantined: ['candidate', 'revoked'],
  superseded: ['revoked'],
  revoked: [],
};

export function isLegalTransition(from: LedgerState, to: LedgerState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export interface SourceIdentifiers {
  pmid?: string[];
  doi?: string[];
  nct?: string[];
  accession?: string[];
}

export interface EvidenceInput {
  toolName: string;
  category?: string;
  query: string;
  summary: string;
  identifiers?: SourceIdentifiers;
  /** Version/release of the source database or document, when the tool reports one. */
  sourceVersion?: string;
  /** When the tool retrieved the data (ISO 8601). Defaults to now. */
  retrievedAt?: string;
  /** After this instant the evidence is no longer valid (ISO 8601). */
  validUntil?: string;
  workspaceId?: string;
  sessionId?: string;
  /** The session-local id (EV-n) this entry was ingested from. */
  sessionEvidenceId?: string;
  containsPHI?: boolean;
  phiAuthorized?: boolean;
}

export interface ClaimInput {
  statement: string;
  supports: string[];
  refutes?: string[];
  workspaceId?: string;
  /** A claim this one is meant to replace once it is verified. */
  supersedes?: string;
}

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  state: LedgerState;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Evidence summary, or the claim's statement. */
  summary: string;
  lastReason?: string;
  workspaceId?: string;

  // evidence
  toolName?: string;
  category?: string;
  query?: string;
  identifiers?: SourceIdentifiers;
  sourceVersion?: string;
  retrievedAt?: string;
  validUntil?: string;
  sessionId?: string;
  sessionEvidenceId?: string;
  containsPHI?: boolean;
  phiAuthorized?: boolean;

  // claim
  supports?: string[];
  refutes?: string[];
  supersedes?: string;
  supersededBy?: string;
}

export type LedgerEventType = 'create' | 'transition' | 'link';

export interface LedgerEvent {
  seq: number;
  at: string;
  type: LedgerEventType;
  entityId: string;
  from?: LedgerState;
  to?: LedgerState;
  reason: string;
  actor: string;
  /** Snapshot of the entry, on create. */
  entity?: LedgerEntry;
  /** Field updates, on link (e.g. supersededBy, an added refutation). */
  data?: Partial<Pick<LedgerEntry, 'supersededBy' | 'refutes' | 'supports'>>;
  prevHash: string;
  hash: string;
}

export interface InvariantViolation {
  invariant: 'I1' | 'I2' | 'I3' | 'I4';
  entityId?: string;
  message: string;
}

export interface ChainStatus {
  ok: boolean;
  events: number;
  headHash: string;
  /** seq of the first event whose hash does not verify. */
  brokenAt?: number;
  message?: string;
}

export interface LedgerFilter {
  kind?: LedgerKind;
  state?: LedgerState;
  workspaceId?: string;
  search?: string;
  limit?: number;
}

export interface TransitionResult {
  ok: boolean;
  entry?: LedgerEntry;
  /** Entries moved as a consequence (the dependency cascade). */
  cascaded: { id: string; from: LedgerState; to: LedgerState }[];
  error?: string;
}

const GENESIS = '0'.repeat(64);

/** JSON with object keys sorted at every level, so hashing does not depend on insertion order. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>)
    .filter((k) => (value as any)[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as any)[k])}`).join(',')}}`;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function hashEvent(event: Omit<LedgerEvent, 'hash'>): string {
  return sha256(event.prevHash + canonicalJson(event));
}

function sortedIds(ids?: SourceIdentifiers): SourceIdentifiers | undefined {
  if (!ids) return undefined;
  const out: SourceIdentifiers = {};
  for (const key of ['pmid', 'doi', 'nct', 'accession'] as const) {
    const list = ids[key];
    if (list && list.length) out[key] = [...new Set(list)].sort();
  }
  return Object.keys(out).length ? out : undefined;
}

export function defaultLedgerDir(): string {
  const base = process.env.MEDSCIENCE_HOME || path.join(os.homedir(), '.medscience');
  return path.join(base, 'ledger');
}

export class EvidenceLedger {
  private entries = new Map<string, LedgerEntry>();
  private events: LedgerEvent[] = [];
  private headHash = GENESIS;
  private file?: string;
  private chain: ChainStatus = { ok: true, events: 0, headHash: GENESIS };
  /** Set when the file on disk failed to replay; never cleared in-process. */
  private loadFailure?: ChainStatus;
  private now: () => Date;

  constructor(options: { dir?: string; persist?: boolean; now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date());
    if (options.persist !== false) {
      const dir = options.dir ?? defaultLedgerDir();
      fs.mkdirSync(dir, { recursive: true });
      this.file = path.join(dir, 'events.jsonl');
      this.load();
    }
  }

  // ---------------------------------------------------------------- reading

  public get(id: string): LedgerEntry | undefined {
    const e = this.entries.get(id);
    return e ? structuredClone(e) : undefined;
  }

  public list(filter: LedgerFilter = {}): LedgerEntry[] {
    const q = filter.search?.trim().toLowerCase();
    let out = [...this.entries.values()].filter((e) => {
      if (filter.kind && e.kind !== filter.kind) return false;
      if (filter.state && e.state !== filter.state) return false;
      if (filter.workspaceId && e.workspaceId !== filter.workspaceId) return false;
      if (q) {
        const hay = [e.id, e.summary, e.query, e.toolName, ...Object.values(e.identifiers ?? {}).flat()].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    if (filter.limit) out = out.slice(0, filter.limit);
    return out.map((e) => structuredClone(e));
  }

  public history(id: string): LedgerEvent[] {
    return this.events.filter((ev) => ev.entityId === id).map((ev) => structuredClone(ev));
  }

  /** Claims that cite this evidence as support. */
  public dependents(evidenceId: string): LedgerEntry[] {
    return [...this.entries.values()]
      .filter((e) => e.kind === 'claim' && e.supports?.includes(evidenceId))
      .map((e) => structuredClone(e));
  }

  public stats(): Record<LedgerKind, Record<LedgerState, number>> {
    const blank = () => Object.fromEntries(LEDGER_STATES.map((s) => [s, 0])) as Record<LedgerState, number>;
    const out = { evidence: blank(), claim: blank() };
    for (const e of this.entries.values()) out[e.kind][e.state]++;
    return out;
  }

  public chainStatus(): ChainStatus {
    return { ...this.chain };
  }

  /** Recomputes every hash from the start of the log. */
  public verifyChain(): ChainStatus {
    let prev = GENESIS;
    for (const ev of this.events) {
      const { hash, ...rest } = ev;
      if (ev.prevHash !== prev || hashEvent(rest) !== hash) {
        this.chain = { ok: false, events: this.events.length, headHash: this.headHash, brokenAt: ev.seq, message: `Event ${ev.seq} does not verify` };
        return this.chainStatus();
      }
      prev = hash;
    }
    // A log that failed to replay stays broken even though the events that
    // did load verify: the part after the break is what was tampered with.
    this.chain = this.loadFailure ? { ...this.loadFailure } : { ok: true, events: this.events.length, headHash: prev };
    return this.chainStatus();
  }

  public checkInvariants(): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    for (const e of this.entries.values()) {
      if (e.kind === 'claim' && e.state === 'verified') {
        if (!e.supports || e.supports.length === 0) {
          violations.push({ invariant: 'I1', entityId: e.id, message: 'Verified claim cites no supporting evidence.' });
        }
        for (const sid of e.supports ?? []) {
          const s = this.entries.get(sid);
          if (!s || s.state !== 'verified') {
            violations.push({ invariant: 'I1', entityId: e.id, message: `Supporting evidence ${sid} is ${s ? s.state : 'missing'}.` });
          }
        }
      }
      if (e.kind === 'evidence' && e.state === 'verified' && e.containsPHI && !e.phiAuthorized) {
        violations.push({ invariant: 'I2', entityId: e.id, message: 'Verified evidence carries unauthorised patient data.' });
      }
      if (e.kind === 'claim' && e.state === 'superseded' && (!e.supersededBy || !this.entries.has(e.supersededBy))) {
        violations.push({ invariant: 'I3', entityId: e.id, message: 'Superseded claim has no existing successor.' });
      }
    }
    if (!this.chain.ok) violations.push({ invariant: 'I4', message: this.chain.message ?? 'Hash chain broken.' });
    return violations;
  }

  // ---------------------------------------------------------------- writing

  /**
   * Adds evidence as a candidate. Ids are content-derived, so recording the
   * same result twice returns the existing entry instead of a duplicate.
   */
  public recordEvidence(input: EvidenceInput, actor = 'system'): { entry: LedgerEntry; created: boolean } {
    const identifiers = sortedIds(input.identifiers);
    const id =
      'evd_' +
      sha256(
        canonicalJson({
          toolName: input.toolName,
          query: input.query,
          summary: input.summary,
          identifiers,
          sourceVersion: input.sourceVersion,
          workspaceId: input.workspaceId,
        })
      ).slice(0, 16);
    const existing = this.entries.get(id);
    if (existing) return { entry: structuredClone(existing), created: false };

    const at = this.now().toISOString();
    const entry: LedgerEntry = {
      id,
      kind: 'evidence',
      state: 'candidate',
      version: 1,
      createdAt: at,
      updatedAt: at,
      summary: input.summary,
      toolName: input.toolName,
      category: input.category,
      query: input.query,
      identifiers,
      sourceVersion: input.sourceVersion,
      retrievedAt: input.retrievedAt ?? at,
      validUntil: input.validUntil,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      sessionEvidenceId: input.sessionEvidenceId,
      containsPHI: input.containsPHI || undefined,
      phiAuthorized: input.phiAuthorized || undefined,
    };
    this.append({ type: 'create', entityId: id, to: 'candidate', reason: 'recorded', actor, entity: entry });
    return { entry: structuredClone(this.entries.get(id)!), created: true };
  }

  public createClaim(input: ClaimInput, actor = 'system'): { entry: LedgerEntry; created: boolean } {
    const supports = [...new Set(input.supports)].sort();
    const refutes = [...new Set(input.refutes ?? [])].sort();
    for (const ref of [...supports, ...refutes]) {
      const target = this.entries.get(ref);
      if (!target || target.kind !== 'evidence') throw new Error(`Claim cites ${ref}, which is not evidence in this ledger.`);
    }
    if (input.supersedes && this.entries.get(input.supersedes)?.kind !== 'claim') {
      throw new Error(`Claim supersedes ${input.supersedes}, which is not a claim in this ledger.`);
    }
    const id =
      'clm_' +
      sha256(canonicalJson({ statement: input.statement.trim(), supports, refutes, workspaceId: input.workspaceId, supersedes: input.supersedes })).slice(0, 16);
    const existing = this.entries.get(id);
    if (existing) return { entry: structuredClone(existing), created: false };

    const at = this.now().toISOString();
    const entry: LedgerEntry = {
      id,
      kind: 'claim',
      state: 'candidate',
      version: 1,
      createdAt: at,
      updatedAt: at,
      summary: input.statement.trim(),
      supports,
      refutes: refutes.length ? refutes : undefined,
      supersedes: input.supersedes,
      workspaceId: input.workspaceId,
    };
    this.append({ type: 'create', entityId: id, to: 'candidate', reason: 'claim proposed', actor, entity: entry });
    return { entry: structuredClone(this.entries.get(id)!), created: true };
  }

  /**
   * Moves a claim out of candidate (or back from contested) after checking
   * I1. A claim whose support holds but which also cites verified refuting
   * evidence becomes contested rather than verified: the disagreement is
   * kept, not resolved by fiat.
   */
  public promoteClaim(id: string, actor = 'system'): TransitionResult {
    const claim = this.entries.get(id);
    if (!claim || claim.kind !== 'claim') return { ok: false, cascaded: [], error: `${id} is not a claim` };
    const supports = claim.supports ?? [];
    if (supports.length === 0) return { ok: false, cascaded: [], error: 'A claim needs at least one supporting evidence entry.' };
    const unverified = supports.filter((s) => this.entries.get(s)?.state !== 'verified');
    if (unverified.length) {
      return { ok: false, cascaded: [], error: `Supporting evidence not verified: ${unverified.join(', ')}` };
    }
    const liveRefutations = (claim.refutes ?? []).filter((r) => this.entries.get(r)?.state === 'verified');
    const target: LedgerState = liveRefutations.length ? 'contested' : 'verified';
    if (claim.state === target) return { ok: true, entry: structuredClone(claim), cascaded: [] };
    const reason = liveRefutations.length
      ? `support verified, but refuted by verified evidence ${liveRefutations.join(', ')}`
      : `all ${supports.length} supporting evidence entr${supports.length === 1 ? 'y is' : 'ies are'} verified`;
    const result = this.transition(id, target, reason, actor);
    // A verified successor retires the claim it was written to replace.
    if (result.ok && target === 'verified' && claim.supersedes) {
      const old = this.entries.get(claim.supersedes);
      if (old && (old.state === 'verified' || old.state === 'contested')) {
        const oldState = old.state;
        this.append({ type: 'link', entityId: old.id, reason: `superseded by ${id}`, actor, data: { supersededBy: id } });
        const sup = this.transition(old.id, 'superseded', `superseded by ${id}`, actor);
        if (sup.ok) result.cascaded.push({ id: old.id, from: oldState, to: 'superseded' }, ...sup.cascaded);
      }
    }
    return result;
  }

  /** Cites new evidence against a claim; a verified claim becomes contested when that evidence is verified. */
  public addRefutation(claimId: string, evidenceId: string, actor = 'system'): TransitionResult {
    const claim = this.entries.get(claimId);
    const ev = this.entries.get(evidenceId);
    if (!claim || claim.kind !== 'claim') return { ok: false, cascaded: [], error: `${claimId} is not a claim` };
    if (!ev || ev.kind !== 'evidence') return { ok: false, cascaded: [], error: `${evidenceId} is not evidence` };
    if (claim.refutes?.includes(evidenceId)) return { ok: true, entry: structuredClone(claim), cascaded: [] };
    const refutes = [...new Set([...(claim.refutes ?? []), evidenceId])].sort();
    this.append({ type: 'link', entityId: claimId, reason: `refuted by ${evidenceId}`, actor, data: { refutes } });
    if (claim.state === 'verified' && ev.state === 'verified') {
      return this.transition(claimId, 'contested', `refuted by verified evidence ${evidenceId}`, actor);
    }
    return { ok: true, entry: structuredClone(this.entries.get(claimId)!), cascaded: [] };
  }

  /**
   * The only way any entry changes state. Illegal transitions are refused;
   * verifying a claim goes through promoteClaim so I1 is checked; evidence
   * leaving `verified` cascades to the claims resting on it.
   */
  public transition(id: string, to: LedgerState, reason: string, actor = 'system'): TransitionResult {
    if (!this.chain.ok) return { ok: false, cascaded: [], error: 'Ledger hash chain is broken; it is read-only until repaired.' };
    const entry = this.entries.get(id);
    if (!entry) return { ok: false, cascaded: [], error: `No ledger entry ${id}` };
    const from = entry.state;
    if (!isLegalTransition(from, to)) return { ok: false, cascaded: [], error: `Illegal transition ${from} -> ${to} for ${id}` };
    if (entry.kind === 'claim' && to === 'verified') {
      const unverified = (entry.supports ?? []).filter((s) => this.entries.get(s)?.state !== 'verified');
      if (!entry.supports?.length || unverified.length) {
        return { ok: false, cascaded: [], error: 'A claim can only be verified when all of its supporting evidence is verified (I1).' };
      }
    }
    if (entry.kind === 'evidence' && to === 'verified' && entry.containsPHI && !entry.phiAuthorized) {
      return { ok: false, cascaded: [], error: 'Evidence carrying unauthorised patient data cannot be verified (I2).' };
    }
    if (entry.kind === 'claim' && to === 'superseded' && !entry.supersededBy) {
      return { ok: false, cascaded: [], error: 'Use a successor claim with `supersedes` to supersede a claim (I3).' };
    }

    this.append({ type: 'transition', entityId: id, from, to, reason, actor });
    const cascaded: TransitionResult['cascaded'] = [];
    if (entry.kind === 'evidence' && from === 'verified' && to !== 'verified') {
      for (const claim of this.entries.values()) {
        if (claim.kind !== 'claim' || claim.state !== 'verified' || !claim.supports?.includes(id)) continue;
        this.append({ type: 'transition', entityId: claim.id, from: 'verified', to: 'contested', reason: `supporting evidence ${id} became ${to}: ${reason}`, actor });
        cascaded.push({ id: claim.id, from: 'verified', to: 'contested' });
      }
    }
    return { ok: true, entry: structuredClone(this.entries.get(id)!), cascaded };
  }

  // ------------------------------------------------------------ persistence

  private append(partial: Omit<LedgerEvent, 'seq' | 'at' | 'prevHash' | 'hash'>): LedgerEvent {
    if (!this.chain.ok) throw new Error('Ledger hash chain is broken; refusing to extend it.');
    const unsigned: Omit<LedgerEvent, 'hash'> = {
      seq: this.events.length + 1,
      at: this.now().toISOString(),
      ...partial,
      prevHash: this.headHash,
    };
    const event: LedgerEvent = { ...unsigned, hash: hashEvent(unsigned) };
    this.apply(event);
    this.events.push(event);
    this.headHash = event.hash;
    this.chain = { ok: true, events: this.events.length, headHash: this.headHash };
    if (this.file) fs.appendFileSync(this.file, JSON.stringify(event) + '\n', 'utf8');
    return event;
  }

  private apply(event: LedgerEvent): void {
    if (event.type === 'create') {
      if (!event.entity) throw new Error(`create event ${event.seq} has no entity`);
      this.entries.set(event.entityId, structuredClone(event.entity));
      return;
    }
    const entry = this.entries.get(event.entityId);
    if (!entry) throw new Error(`event ${event.seq} references unknown entry ${event.entityId}`);
    if (event.type === 'link') {
      Object.assign(entry, structuredClone(event.data ?? {}));
      entry.updatedAt = event.at;
      return;
    }
    if (!event.to || event.from !== entry.state || !isLegalTransition(entry.state, event.to)) {
      throw new Error(`event ${event.seq} is an illegal transition ${event.from} -> ${event.to} (entry is ${entry.state})`);
    }
    entry.state = event.to;
    entry.version += 1;
    entry.updatedAt = event.at;
    entry.lastReason = event.reason;
  }

  /**
   * Replays the log. Replay stops at the first event that fails its hash or
   * is not a legal transition; everything before it is kept, and the ledger
   * becomes read-only so a tampered log is never extended.
   */
  private load(): void {
    if (!this.file || !fs.existsSync(this.file)) return;
    const lines = fs.readFileSync(this.file, 'utf8').split('\n').filter((l) => l.trim());
    let prev = GENESIS;
    for (let i = 0; i < lines.length; i++) {
      let event: LedgerEvent;
      try {
        event = JSON.parse(lines[i]);
      } catch {
        this.chain = { ok: false, events: this.events.length, headHash: prev, brokenAt: i + 1, message: `Line ${i + 1} is not valid JSON` };
        this.loadFailure = { ...this.chain };
        return;
      }
      const { hash, ...rest } = event;
      if (event.seq !== i + 1 || event.prevHash !== prev || hashEvent(rest) !== hash) {
        this.chain = { ok: false, events: this.events.length, headHash: prev, brokenAt: i + 1, message: `Event ${i + 1} does not verify (tampered or reordered)` };
        this.loadFailure = { ...this.chain };
        return;
      }
      try {
        this.apply(event);
      } catch (err: any) {
        this.chain = { ok: false, events: this.events.length, headHash: prev, brokenAt: i + 1, message: err.message };
        this.loadFailure = { ...this.chain };
        return;
      }
      this.events.push(event);
      prev = hash;
    }
    this.headHash = prev;
    this.chain = { ok: true, events: this.events.length, headHash: prev };
  }
}

let globalLedger: EvidenceLedger | undefined;

/** The profile's ledger, opened on first use (so MEDSCIENCE_HOME is read when it is needed). */
export function getGlobalEvidenceLedger(): EvidenceLedger {
  if (!globalLedger) globalLedger = new EvidenceLedger();
  return globalLedger;
}
