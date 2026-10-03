import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollText,
  Search,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  FileWarning,
  Gauge,
  X,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Link2,
} from 'lucide-react';
import type {
  LedgerEntry,
  LedgerEvent,
  LedgerKind,
  LedgerState,
  RuntimeEvent,
  SourceIdentifiers,
} from '@medscience/core';
import type { LedgerOverview } from '../../runtime/apiClient';
import { useLanguage } from '../../context/LanguageContext';
import { useWorkspaces } from '../../context/WorkspaceContext';

/**
 * The evidence ledger: every result that has passed (or failed) the
 * admission gate, every claim built on them, and the full, hash-chained
 * history of how each got to its current state. Unlike the per-workspace
 * Evidence Registry, which lists citations from conversations, this is the
 * durable store conclusions rest on, so it also carries the maintenance
 * actions: chain verification, retraction import and sweep, and classifier
 * calibration.
 */

const STATE_STYLE: Record<LedgerState, string> = {
  candidate: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20',
  verified: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  contested: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  quarantined: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  superseded: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  revoked: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
};

const STATES: LedgerState[] = ['candidate', 'verified', 'contested', 'quarantined', 'superseded', 'revoked'];

function useStateLabel() {
  const { t } = useLanguage();
  return (s: LedgerState) =>
    ({
      candidate: t('Candidate', '候选'),
      verified: t('Verified', '已验证'),
      contested: t('Contested', '有争议'),
      quarantined: t('Quarantined', '已隔离'),
      superseded: t('Superseded', '已取代'),
      revoked: t('Revoked', '已撤销'),
    })[s];
}

const StateBadge: React.FC<{ state: LedgerState }> = ({ state }) => {
  const label = useStateLabel();
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${STATE_STYLE[state]}`}>{label(state)}</span>
  );
};

function identifierLinks(ids?: SourceIdentifiers): { label: string; url?: string }[] {
  if (!ids) return [];
  return [
    ...(ids.pmid ?? []).map((p) => ({ label: `PMID ${p}`, url: `https://pubmed.ncbi.nlm.nih.gov/${p}/` })),
    ...(ids.doi ?? []).map((d) => ({ label: `DOI ${d}`, url: `https://doi.org/${d}` })),
    ...(ids.nct ?? []).map((n) => ({ label: n, url: `https://clinicaltrials.gov/study/${n}` })),
    ...(ids.accession ?? []).map((a) => ({ label: a })),
  ];
}

const formatTime = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '');

export const EvidenceLedgerView: React.FC = () => {
  const { t } = useLanguage();
  const stateLabel = useStateLabel();
  const { activeWorkspaceId, workspaces } = useWorkspaces();
  const api = window.medscience?.ledger;

  const [overview, setOverview] = useState<LedgerOverview>();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [kind, setKind] = useState<LedgerKind | 'all'>('all');
  const [stateFilter, setStateFilter] = useState<LedgerState | 'all'>('all');
  const [scopeToWorkspace, setScopeToWorkspace] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string>();
  const [showMaintenance, setShowMaintenance] = useState(false);

  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      const [ov, list] = await Promise.all([
        api.overview(),
        api.list({
          kind: kind === 'all' ? undefined : kind,
          state: stateFilter === 'all' ? undefined : stateFilter,
          workspaceId: scopeToWorkspace ? activeWorkspaceId : undefined,
          search: search.trim() || undefined,
          limit: 500,
        }),
      ]);
      setOverview(ov);
      setEntries(list);
      setError(undefined);
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }, [api, kind, stateFilter, scopeToWorkspace, activeWorkspaceId, search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Runs, sweeps and curator actions announce themselves; refresh on each.
  useEffect(() => {
    const unsubscribe = window.medscience?.agent.onEvent((event: RuntimeEvent) => {
      if (event.type === 'evidence.ledger.updated') void refresh();
    });
    return () => unsubscribe?.();
  }, [refresh]);

  const workspaceTitle = workspaces.find((w) => w.id === activeWorkspaceId)?.title;

  if (!api) {
    return (
      <div className="flex-1 p-10 text-sm text-text-secondary">
        {t('The evidence ledger is not available in this build.', '当前版本不提供证据账本。')}
      </div>
    );
  }

  const totals = overview
    ? (['evidence', 'claim'] as LedgerKind[]).map((k) => ({
        kind: k,
        total: STATES.reduce((n, s) => n + overview.stats[k][s], 0),
        verified: overview.stats[k].verified,
        flagged: overview.stats[k].contested + overview.stats[k].quarantined + overview.stats[k].revoked,
      }))
    : [];

  return (
    <div className="flex-1 h-full flex overflow-hidden">
      <div className="flex-1 h-full overflow-y-auto p-6 sm:p-10 max-w-[1100px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
          <div className="flex items-center gap-2.5 text-left">
            <div className="p-2 rounded-lg bg-accent/10 text-accent">
              <ScrollText size={22} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-text-primary">{t('Evidence Ledger', '证据账本')}</h2>
              <p className="text-sm text-text-secondary mt-0.5">
                {t(
                  'Durable, hash-chained record of admitted evidence and the claims that rest on it.',
                  '持久化、哈希链式的证据与结论记录：每条证据经准入门禁，每个结论都可追溯。'
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            {overview && (
              <span
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
                  overview.chain.ok
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                }`}
                title={overview.chain.headHash}
              >
                {overview.chain.ok ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                {overview.chain.ok
                  ? t(`Chain intact · ${overview.chain.events} events`, `哈希链完整 · ${overview.chain.events} 个事件`)
                  : t(`Chain broken at event ${overview.chain.brokenAt}`, `哈希链在第 ${overview.chain.brokenAt} 个事件处断裂`)}
              </span>
            )}
            {overview && (
              <span
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
                  overview.calibration.calibrated
                    ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
                    : 'bg-bg-elevated text-text-muted border-border-subtle'
                }`}
              >
                <Gauge size={13} />
                {overview.calibration.calibrated
                  ? t(`Conformal, α=${overview.calibration.alpha}`, `共形校准 α=${overview.calibration.alpha}`)
                  : t('Uncalibrated (no coverage guarantee)', '未校准（无覆盖率保证）')}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs">{error}</div>
        )}

        {overview && overview.violations.length > 0 && (
          <div className="mt-4 p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400 space-y-1">
            <div className="font-semibold">{t('Invariant violations', '不变量违例')}</div>
            {overview.violations.map((v, i) => (
              <div key={i} className="font-mono">
                [{v.invariant}] {v.entityId ? `${v.entityId}: ` : ''}
                {v.message}
              </div>
            ))}
          </div>
        )}

        {/* Totals */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-6">
          {totals.map((row) => (
            <div key={row.kind} className="p-4 rounded-xl bg-bg-surface border border-border text-left">
              <div className="text-xs text-text-muted">{row.kind === 'evidence' ? t('Evidence', '证据') : t('Claims', '结论')}</div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="text-2xl font-bold text-text-primary">{row.total}</span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  {row.verified} {t('verified', '已验证')}
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {row.flagged} {t('contested / quarantined / revoked', '有争议 / 已隔离 / 已撤销')}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'evidence', 'claim'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  kind === k
                    ? 'bg-accent text-white shadow-xs font-semibold'
                    : 'bg-bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                }`}
              >
                {k === 'all' ? t('All', '全部') : k === 'evidence' ? t('Evidence', '证据') : t('Claims', '结论')}
              </button>
            ))}
            <span className="w-px h-5 bg-border mx-1" />
            {(['all', ...STATES] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStateFilter(s)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                  stateFilter === s ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-secondary hover:bg-bg-hover'
                }`}
              >
                {s === 'all' ? t('Any state', '任意状态') : stateLabel(s)}
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
              <input type="checkbox" checked={scopeToWorkspace} onChange={(e) => setScopeToWorkspace(e.target.checked)} />
              {workspaceTitle
                ? t(`Only workspace "${workspaceTitle}"`, `仅工作区「${workspaceTitle}」`)
                : t('Only the active workspace', '仅当前工作区')}
            </label>
            <div className="relative max-w-xs w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder={t('Search ids, PMIDs, DOIs, text...', '搜索编号、PMID、DOI、内容…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-bg-surface border border-border focus:border-accent text-xs text-text-primary placeholder:text-text-muted"
              />
            </div>
          </div>
        </div>

        {/* Entries */}
        {entries.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-bg-surface border border-border border-dashed text-xs text-text-secondary">
            {t(
              'Nothing here yet. Evidence from research turns, hypothesis trees and team runs is committed here once it passes the admission gate.',
              '暂无记录。研究对话、假设树与科研小队运行中获得的证据，通过准入门禁后会记录在此。'
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                className={`w-full p-3.5 rounded-xl bg-bg-surface border text-left transition-all flex flex-col gap-1.5 ${
                  selectedId === e.id ? 'border-accent/60' : 'border-border hover:border-accent/30'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-text-muted">{e.id}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-bg-elevated border border-border-subtle text-text-muted">
                    {e.kind === 'evidence' ? (e.toolName ?? t('evidence', '证据')) : t('claim', '结论')}
                  </span>
                  <StateBadge state={e.state} />
                  <span className="text-[11px] text-text-muted ml-auto">{formatTime(e.updatedAt)}</span>
                </div>
                <div className="text-[13px] text-text-primary leading-snug line-clamp-2">{e.summary}</div>
                {e.lastReason && <div className="text-[11px] text-text-muted line-clamp-1">{e.lastReason}</div>}
              </button>
            ))}
          </div>
        )}

        {/* Maintenance */}
        <div className="mt-8 rounded-xl border border-border bg-bg-surface text-left">
          <button
            onClick={() => setShowMaintenance((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-text-primary"
          >
            {showMaintenance ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {t('Integrity, retractions & calibration', '完整性、撤稿与校准')}
          </button>
          {showMaintenance && overview && <MaintenancePanel overview={overview} onChanged={refresh} />}
        </div>
      </div>

      {selectedId && <EntryDetail id={selectedId} onClose={() => setSelectedId(undefined)} onNavigate={setSelectedId} onChanged={refresh} />}
    </div>
  );
};

const EntryDetail: React.FC<{ id: string; onClose: () => void; onNavigate: (id: string) => void; onChanged: () => void }> = ({
  id,
  onClose,
  onNavigate,
  onChanged,
}) => {
  const { t } = useLanguage();
  const stateLabel = useStateLabel();
  const api = window.medscience!.ledger;
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof api.get>>>();
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string>();

  const load = useCallback(async () => {
    setDetail(await api.get(id));
  }, [api, id]);

  useEffect(() => {
    setMessage(undefined);
    setReason('');
    void load();
  }, [load]);

  if (!detail) return null;
  const { entry, history, dependents, cites, allowedTransitions } = detail;

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; cascaded?: { id: string }[] }>) => {
    const res = await fn();
    setMessage(
      res.ok
        ? res.cascaded?.length
          ? t(`Done; ${res.cascaded.length} dependent entr${res.cascaded.length === 1 ? 'y' : 'ies'} updated.`, `已完成；${res.cascaded.length} 个依赖条目随之更新。`)
          : t('Done.', '已完成。')
        : res.error || t('Refused.', '已拒绝。')
    );
    setReason('');
    await load();
    onChanged();
  };

  // Verifying a claim goes through promotion (which checks its support);
  // re-admitting goes back through the gate. Everything else is a plain,
  // reasoned transition.
  const manual = allowedTransitions.filter((s) => s !== 'verified' && s !== 'superseded' && s !== 'candidate');
  const supportIds = new Set(entry.supports ?? []);

  return (
    <aside className="w-[420px] shrink-0 h-full overflow-y-auto border-l border-border bg-bg-surface p-5 text-left space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5">
          <div className="font-mono text-xs text-text-muted">{entry.id}</div>
          <StateBadge state={entry.state} />
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-bg-hover text-text-muted">
          <X size={16} />
        </button>
      </div>

      <div className="text-sm text-text-primary leading-relaxed">{entry.summary}</div>

      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs">
        {entry.kind === 'evidence' && (
          <>
            <dt className="text-text-muted">{t('Tool', '工具')}</dt>
            <dd className="font-mono">{entry.toolName}</dd>
            <dt className="text-text-muted">{t('Query', '查询')}</dt>
            <dd className="break-words">{entry.query}</dd>
            <dt className="text-text-muted">{t('Retrieved', '获取时间')}</dt>
            <dd>{formatTime(entry.retrievedAt)}</dd>
            <dt className="text-text-muted">{t('Source version', '来源版本')}</dt>
            <dd>{entry.sourceVersion || t('not reported', '未提供')}</dd>
            {entry.validUntil && (
              <>
                <dt className="text-text-muted">{t('Valid until', '有效期至')}</dt>
                <dd>{formatTime(entry.validUntil)}</dd>
              </>
            )}
          </>
        )}
        <dt className="text-text-muted">{t('Version', '版本')}</dt>
        <dd>v{entry.version}</dd>
        {entry.sessionEvidenceId && (
          <>
            <dt className="text-text-muted">{t('From session', '来自会话')}</dt>
            <dd className="font-mono">{entry.sessionEvidenceId}</dd>
          </>
        )}
      </dl>

      {identifierLinks(entry.identifiers).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {identifierLinks(entry.identifiers).map((l) =>
            l.url ? (
              <a
                key={l.label}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border border-border hover:border-accent/40"
              >
                {l.label}
                <ExternalLink size={10} />
              </a>
            ) : (
              <span key={l.label} className="text-[11px] font-mono px-2 py-0.5 rounded border border-border">
                {l.label}
              </span>
            )
          )}
        </div>
      )}

      {cites.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold text-text-primary">{t('Cites', '引用的证据')}</h4>
          {cites.map((c) => (
            <button key={c.id} onClick={() => onNavigate(c.id)} className="w-full flex items-center gap-2 text-xs text-left hover:underline">
              <Link2 size={12} className="text-text-muted shrink-0" />
              <span className={supportIds.has(c.id) ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                {supportIds.has(c.id) ? t('supports', '支持') : t('refutes', '反驳')}
              </span>
              <span className="font-mono text-text-muted">{c.id}</span>
              <StateBadge state={c.state} />
            </button>
          ))}
        </section>
      )}

      {dependents.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold text-text-primary">{t('Claims resting on this', '依赖此证据的结论')}</h4>
          {dependents.map((c) => (
            <button key={c.id} onClick={() => onNavigate(c.id)} className="w-full flex items-center gap-2 text-xs text-left hover:underline">
              <span className="font-mono text-text-muted">{c.id}</span>
              <StateBadge state={c.state} />
              <span className="truncate text-text-secondary">{c.summary}</span>
            </button>
          ))}
        </section>
      )}

      {/* Curator actions */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-text-primary">{t('Actions', '操作')}</h4>
        {entry.kind === 'claim' && (entry.state === 'candidate' || entry.state === 'contested') && (
          <button
            onClick={() => act(() => api.promoteClaim(entry.id))}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent-hover"
          >
            {t('Re-check support and promote', '复核支持证据并提升')}
          </button>
        )}
        {entry.kind === 'evidence' && entry.state === 'quarantined' && (
          <button
            onClick={() => act(() => api.readmit(entry.id))}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent-hover"
          >
            {t('Send back through the admission gate', '重新经过准入门禁')}
          </button>
        )}
        {manual.length > 0 && (
          <div className="space-y-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('Reason (required, kept in the history)', '原因（必填，将写入历史）')}
              className="w-full px-3 py-1.5 rounded-lg bg-bg-primary border border-border text-xs"
            />
            <div className="flex flex-wrap gap-1.5">
              {manual.map((s) => (
                <button
                  key={s}
                  disabled={!reason.trim()}
                  onClick={() => act(() => api.transition(entry.id, s, reason))}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border disabled:opacity-40 ${STATE_STYLE[s]}`}
                >
                  {t('Mark ', '标记为')}
                  {stateLabel(s)}
                </button>
              ))}
            </div>
          </div>
        )}
        {allowedTransitions.length === 0 && (
          <p className="text-[11px] text-text-muted">{t('Final state: no further changes are possible.', '终态：不能再变更。')}</p>
        )}
        {message && <p className="text-[11px] text-text-secondary">{message}</p>}
      </section>

      {/* History */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-text-primary">{t('History', '历史')}</h4>
        <ol className="space-y-2 border-l border-border pl-3">
          {history.map((ev: LedgerEvent) => (
            <li key={ev.seq} className="text-[11px] space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-text-muted">#{ev.seq}</span>
                {ev.type === 'transition' && ev.from ? (
                  <>
                    <StateBadge state={ev.from} />
                    <span className="text-text-muted">→</span>
                    <StateBadge state={ev.to!} />
                  </>
                ) : ev.type === 'create' ? (
                  <span className="text-text-secondary">{t('created', '创建')}</span>
                ) : (
                  <span className="text-text-secondary">{t('linked', '关联')}</span>
                )}
                <span className="text-text-muted">· {ev.actor}</span>
              </div>
              <div className="text-text-secondary">{ev.reason}</div>
              <div className="font-mono text-text-muted" title={ev.hash}>
                {formatTime(ev.at)} · {ev.hash.slice(0, 12)}…
              </div>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
};

const MaintenancePanel: React.FC<{ overview: LedgerOverview; onChanged: () => void }> = ({ overview, onChanged }) => {
  const { t } = useLanguage();
  const api = window.medscience!.ledger;
  const [retractionPath, setRetractionPath] = useState('');
  const [calibrationPath, setCalibrationPath] = useState('');
  const [alpha, setAlpha] = useState('0.1');
  const [busy, setBusy] = useState<string>();
  const [log, setLog] = useState<string[]>([]);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    try {
      const line = await fn();
      setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 20));
      onChanged();
    } catch (err: any) {
      setLog((l) => [`${new Date().toLocaleTimeString()} ✗ ${err?.message || String(err)}`, ...l].slice(0, 20));
    } finally {
      setBusy(undefined);
    }
  };

  const importFromFile = async (file: File) => {
    // Small files go over the wire as text; the full Retraction Watch file
    // is far over the web host's 1 MiB request limit, so it is imported by path.
    if (file.size > 900 * 1024) {
      setLog((l) => [t(`${file.name} is too large to upload here; enter its path instead.`, `${file.name} 过大，无法在此上传；请改为填写文件路径。`), ...l]);
      return;
    }
    const text = await file.text();
    await run('upload', async () => {
      const r = await api.importRetractionsCsv(text, file.name);
      return t(`Imported ${r.imported} notices (${r.skipped} without identifiers skipped).`, `已导入 ${r.imported} 条撤稿记录（跳过 ${r.skipped} 条无标识符记录）。`);
    });
  };

  const button = 'px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-bg-elevated hover:bg-bg-hover disabled:opacity-40';
  const input = 'flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-bg-primary border border-border text-xs font-mono';

  const retractionInfo = useMemo(
    () =>
      overview.retractions.size
        ? t(
            `${overview.retractions.size} notice${overview.retractions.size === 1 ? '' : 's'} from ${overview.retractions.source ?? 'import'} (${new Date(overview.retractions.importedAt ?? '').toLocaleDateString()})`,
            `已载入 ${overview.retractions.size} 条（来源 ${overview.retractions.source ?? '导入'}，${new Date(overview.retractions.importedAt ?? '').toLocaleDateString()}）`
          )
        : t('No retraction index imported.', '尚未导入撤稿索引。'),
    [overview.retractions, t]
  );

  return (
    <div className="px-4 pb-4 space-y-5 text-xs">
      <div className="space-y-2">
        <div className="font-semibold text-text-primary flex items-center gap-1.5">
          <ShieldCheck size={14} /> {t('Hash chain and invariants', '哈希链与不变量')}
        </div>
        <button
          className={button}
          disabled={!!busy}
          onClick={() =>
            run('verify', async () => {
              const r = await api.verify();
              return r.chain.ok && r.violations.length === 0
                ? t(`Chain verified (${r.chain.events} events); all invariants hold.`, `哈希链校验通过（${r.chain.events} 个事件）；所有不变量成立。`)
                : t(`Problems found: ${r.violations.map((v) => v.invariant).join(', ') || r.chain.message}`, `发现问题：${r.violations.map((v) => v.invariant).join('、') || r.chain.message}`);
            })
          }
        >
          <RefreshCw size={12} className="inline mr-1" />
          {t('Re-verify from the first event', '从首个事件重新校验')}
        </button>
      </div>

      <div className="space-y-2">
        <div className="font-semibold text-text-primary flex items-center gap-1.5">
          <FileWarning size={14} /> {t('Retractions', '撤稿')}
        </div>
        <p className="text-text-secondary">
          {retractionInfo}{' '}
          {t(
            'Import the Retraction Watch CSV (distributed by Crossref) or any CSV with doi / pmid columns.',
            '可导入 Crossref 发布的 Retraction Watch CSV，或任何含 doi / pmid 列的 CSV。'
          )}
        </p>
        <div className="flex gap-2">
          <input className={input} value={retractionPath} onChange={(e) => setRetractionPath(e.target.value)} placeholder="/path/to/retraction_watch.csv" />
          <button
            className={button}
            disabled={!!busy || !retractionPath.trim()}
            onClick={() =>
              run('import', async () => {
                const r = await api.importRetractionsFromPath(retractionPath.trim());
                return t(`Imported ${r.imported} notices (${r.skipped} skipped).`, `已导入 ${r.imported} 条（跳过 ${r.skipped} 条）。`);
              })
            }
          >
            {t('Import', '导入')}
          </button>
          <label className={`${button} cursor-pointer`}>
            {t('Upload small CSV', '上传小型 CSV')}
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importFromFile(e.target.files[0])} />
          </label>
        </div>
        <button
          className={button}
          disabled={!!busy || overview.retractions.size === 0}
          onClick={() =>
            run('sweep', async () => {
              const changes = await api.sweepRetractions();
              const cascaded = changes.reduce((n, c) => n + c.cascaded.length, 0);
              return t(
                `Sweep: ${changes.length} evidence entries changed, ${cascaded} dependent claims contested.`,
                `扫描完成：${changes.length} 条证据状态改变，${cascaded} 个依赖结论被标为有争议。`
              );
            })
          }
        >
          {t('Sweep the ledger against the index', '用撤稿索引扫描账本')}
        </button>
      </div>

      <div className="space-y-2">
        <div className="font-semibold text-text-primary flex items-center gap-1.5">
          <Gauge size={14} /> {t('Hypothesis classifier calibration', '假设分类器校准')}
        </div>
        <p className="text-text-secondary">
          {overview.calibration.calibrated
            ? t(
                `Calibrated at α=${overview.calibration.alpha} on ${overview.calibration.counts.supported} supported / ${overview.calibration.counts.refuted} refuted examples (dataset ${overview.calibration.datasetHash.slice(0, 10)}…).`,
                `已在 ${overview.calibration.counts.supported} 个支持 / ${overview.calibration.counts.refuted} 个反驳样本上以 α=${overview.calibration.alpha} 校准（数据集 ${overview.calibration.datasetHash.slice(0, 10)}…）。`
              )
            : t(
                'Not calibrated: hypothesis decisions use the prior scorer and claim no coverage. Provide labelled examples (JSON or JSONL, {"features":[5 numbers],"label":"supported"|"refuted"}) to calibrate.',
                '未校准：假设判定使用先验打分器，不声称覆盖率。提供带标签样本（JSON 或 JSONL，{"features":[5 个数],"label":"supported"|"refuted"}）即可校准。'
              )}
        </p>
        <div className="flex gap-2">
          <input className={input} value={calibrationPath} onChange={(e) => setCalibrationPath(e.target.value)} placeholder="/path/to/labelled.jsonl" />
          <input className="w-16 px-2 py-1.5 rounded-lg bg-bg-primary border border-border text-xs font-mono" value={alpha} onChange={(e) => setAlpha(e.target.value)} title="alpha" />
          <button
            className={button}
            disabled={!!busy || !calibrationPath.trim() || !(Number(alpha) > 0 && Number(alpha) < 1)}
            onClick={() =>
              run('calibrate', async () => {
                const r = await api.calibrateFromFile(calibrationPath.trim(), Number(alpha));
                return t(
                  `Calibrated: ${r.train} examples fitted the scorer, ${r.calibrationSize} set the thresholds. ${r.note}`,
                  `校准完成：${r.train} 个样本用于拟合，${r.calibrationSize} 个用于设定阈值。请在独立的留出集上报告覆盖率。`
                );
              })
            }
          >
            {t('Calibrate', '校准')}
          </button>
        </div>
      </div>

      {log.length > 0 && (
        <div className="p-3 rounded-lg bg-bg-primary border border-border font-mono text-[11px] text-text-secondary space-y-1">
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
};
