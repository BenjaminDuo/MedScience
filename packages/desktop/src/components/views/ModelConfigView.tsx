import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Server,
  Key,
  Plus,
  Trash2,
  Activity,
  Eye,
  EyeOff,
  Terminal,
  RefreshCw,
  CheckCircle2,
  PlugZap,
  ChevronDown,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type {
  ModelProfile,
  ConnectionTestResult,
  ProtocolType,
  LocalRuntimeExecutionProfile,
  ActiveLocalRuntimeSession,
  DiscoverableRuntime,
  LocalRuntimeKind,
  RuntimeUsageRecord,
} from '@medscience/core';

/** Display label for each local runtime kind -- same across en/zh since these are product names. */
const RUNTIME_LABELS: Record<LocalRuntimeKind, string> = {
  codex: 'Codex',
  'claude-code': 'Claude Code',
  opencode: 'OpenCode',
  cursor: 'Cursor Agent',
  copilot: 'GitHub Copilot CLI',
  qwen: 'Qwen Code',
  qwenpaw: 'QwenPaw',
  grok: 'Grok CLI',
  kimi: 'Kimi CLI',
  codebuddy: 'CodeBuddy',
  codearts: 'CodeArts',
  deveco: 'DevEco Code',
  openclaw: 'OpenClaw',
  hermes: 'Hermes',
  pi: 'Pi',
  omp: 'Oh-My-Pi',
  reasonix: 'Reasonix',
  dsh: 'DeepSeek Harness',
  kiro: 'Kiro CLI',
  antigravity: 'Antigravity',
  qoder: 'Qoder CLI',
  qoderclicn: 'Qoder CLI (CN)',
  traecli: 'TRAE CLI',
  dim: 'Dim',
  mcode: 'MiniMax Code',
  zeroclaw: 'ZeroClaw',
};

// Every tool MedScience can detect, in the order shown on the Runtime
// settings page's "supports detecting" line -- mirrors Multica's own
// documented 26-tool list.
const ALL_RUNTIME_NAMES_LIST = Object.values(RUNTIME_LABELS).join(', ');

/**
 * Compact token-count formatting for the Bound Runtimes list -- "0" for
 * nothing yet, exact "###" below 1,000 (small counts are more useful exact
 * than rounded), then "12.3K" / "4.5M" above that. Undefined (no usage
 * record at all yet, e.g. a runtime that has never executed a turn) is
 * treated the same as zero -- there's no meaningful difference to show.
 */
function formatTokenCount(n?: number): string {
  const value = n || 0;
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}K`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function createDefaultProfile(override?: Partial<ModelProfile>): ModelProfile {
  return {
    id: override?.id || `prof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: override?.name || 'Primary Model',
    protocol: override?.protocol || 'openai-compatible',
    baseUrl: override?.baseUrl || 'https://api.openai.com/v1',
    model: override?.model || 'gpt-4o',
    contextWindow: override?.contextWindow || 128000,
    temperature: override?.temperature ?? 0.2,
    maxTokens: override?.maxTokens || 4096,
    streaming: override?.streaming ?? true,
    toolCalling: override?.toolCalling ?? true,
    headers: override?.headers || {},
    apiKey: override?.apiKey || '',
    isDefault: override?.isDefault ?? true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createDefaultLocalRuntimeProfile(override?: Partial<LocalRuntimeExecutionProfile>): LocalRuntimeExecutionProfile {
  const now = new Date().toISOString();
  const runtime = override?.runtime || 'codex';
  return {
    id: override?.id || `exec-${runtime}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: override?.name || `Local ${RUNTIME_LABELS[runtime] || runtime}`,
    mode: 'local-runtime',
    runtime,
    executablePath: override?.executablePath,
    model: override?.model,
    workingDirectoryMode: override?.workingDirectoryMode || 'project',
    sandboxPreset: override?.sandboxPreset || 'workspace-write',
    approvalPreset: 'prompt',
    networkAccess: override?.networkAccess ?? false,
    createdAt: now,
    updatedAt: now,
  };
}

const LOCAL_STORAGE_PROFILES_KEY = 'medscience_model_profiles_v1';
const LOCAL_STORAGE_ACTIVE_PROFILE_KEY = 'medscience_active_profile_v1';

/**
 * Full sidebar page (not a modal tab) covering everything needed to make a
 * research turn actually run: which model/API answers it, and which
 * runtime (that same API, or a local Codex CLI) executes it. These used to
 * be two separate Settings-modal tabs ("Model & API" / "Execution
 * Runtime") -- merged into one page per the user's request, since picking
 * a model and picking how it runs are really one decision.
 */
export const ModelConfigView: React.FC = () => {
  const { t } = useLanguage();

  // --- Model / API profile state -------------------------------------
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [editingProfile, setEditingProfile] = useState<ModelProfile>(createDefaultProfile());
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<{ testing: boolean; result?: ConnectionTestResult }>({
    testing: false,
  });
  const [saveMessage, setSaveMessage] = useState<string>('');

  // --- Execution runtime state (API vs local Codex) -------------------
  const [executionMode, setExecutionMode] = useState<'api' | 'local-runtime'>('api');
  const [editingLocalProfile, setEditingLocalProfile] = useState<LocalRuntimeExecutionProfile>(
    createDefaultLocalRuntimeProfile()
  );
  const [activeApiExecProfileId, setActiveApiExecProfileId] = useState<string>('');
  const [activeSessions, setActiveSessions] = useState<ActiveLocalRuntimeSession[]>([]);
  const [runtimeSaveMsg, setRuntimeSaveMsg] = useState('');

  // --- Multi-runtime bind (Codex + Claude Code + OpenCode, ...) -------
  // CLI status (path/version/found-or-not) for every bound runtime now
  // lives inline in each horizontal card via discoverableRuntimes, rather
  // than a separate stacked "<Runtime> CLI Status" panel -- so there is no
  // more per-tool detectResult/detecting pair, just this one list plus a
  // single detecting/summary pair for the "Bind Local Runtime" action.
  const [localProfiles, setLocalProfiles] = useState<LocalRuntimeExecutionProfile[]>([]);
  const [discoverableRuntimes, setDiscoverableRuntimes] = useState<DiscoverableRuntime[]>([]);
  // Cumulative token usage per bound execution profile (see
  // RuntimeUsageStore.ts on the core side) -- keyed by profile id, same
  // as localProfiles. Only ever non-zero for Codex today, since it's the
  // only local runtime that can actually execute turns.
  const [usageByProfile, setUsageByProfile] = useState<Record<string, RuntimeUsageRecord>>({});
  // Modal state for "Bind Local Runtime": the modal stays open through
  // scan -> review -> per-tool bind -> the user closes it by hand (X or
  // the Close button) -- nothing auto-binds and nothing auto-closes, per
  // the user's explicit request, so a slow/unavailable tool's message
  // (e.g. OpenCode not resolving) stays on screen to actually read.
  const [bindModalOpen, setBindModalOpen] = useState(false);
  const [bindScanning, setBindScanning] = useState(false);
  const [bindingRuntime, setBindingRuntime] = useState<LocalRuntimeKind | undefined>();
  const [bindSummary, setBindSummary] = useState('');
  // Model API is opt-in and collapsed by default -- MedScience defaults to
  // a bound local runtime, per the user's request, and only shows the API
  // configuration once someone explicitly asks for it (or it was already
  // the active execution mode when this page loaded).
  const [showApiSection, setShowApiSection] = useState(false);

  useEffect(() => {
    loadProfiles();
    loadExecutionProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfiles = async () => {
    if (window.medscience?.model) {
      try {
        const list = await window.medscience.model.getProfiles();
        const active = await window.medscience.model.getActiveProfile();
        setProfiles(list);
        if (list.length > 0) {
          const current = active || list[0];
          setSelectedProfileId(current.id);
          setEditingProfile({ ...current });
        } else {
          const fresh = createDefaultProfile({ name: 'Primary Model' });
          setEditingProfile(fresh);
          setSelectedProfileId(fresh.id);
        }
      } catch (err) {
        console.error('Failed to load profiles over IPC:', err);
      }
    } else {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_PROFILES_KEY);
        const savedActive = localStorage.getItem(LOCAL_STORAGE_ACTIVE_PROFILE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setProfiles(parsed);
            const active = parsed.find((p) => p.id === savedActive) || parsed[0];
            setSelectedProfileId(active.id);
            setEditingProfile(active);
            return;
          }
        }
      } catch {}

      const defaultProf = createDefaultProfile({
        name: 'Demo Mode (Mock)',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        apiKey: '',
      });
      setProfiles([defaultProf]);
      setSelectedProfileId(defaultProf.id);
      setEditingProfile(defaultProf);
    }
  };

  const handleSelectProfile = (id: string) => {
    setSelectedProfileId(id);
    const target = profiles.find((p) => p.id === id);
    if (target) {
      setEditingProfile({ ...target });
      setTestStatus({ testing: false });
      setSaveMessage('');
    }
  };

  const handleCreateNewProfile = () => {
    const newProf = createDefaultProfile({
      id: `prof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `Custom Model ${profiles.length + 1}`,
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      protocol: 'openai-compatible',
      apiKey: '',
      isDefault: false,
    });
    setEditingProfile(newProf);
    setSelectedProfileId(newProf.id);
    setTestStatus({ testing: false });
    setSaveMessage('');
  };

  const handleSaveProfile = async () => {
    setSaveMessage('');
    if (window.medscience?.model) {
      const res = await window.medscience.model.saveProfile(editingProfile);
      if (res.success && res.profile) {
        setSaveMessage(t('Profile saved successfully!', '配置已保存成功！'));
        await loadProfiles();
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        setSaveMessage(`Error: ${res.errors?.join(', ')}`);
      }
    } else {
      const updatedList = profiles.some((p) => p.id === editingProfile.id)
        ? profiles.map((p) => (p.id === editingProfile.id ? editingProfile : p))
        : [...profiles, editingProfile];
      setProfiles(updatedList);
      try {
        const sanitizedStorageList = updatedList.map((p) => ({
          ...p,
          apiKey: p.apiKey ? '••••••••' : '',
        }));
        localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(sanitizedStorageList));
        localStorage.setItem(LOCAL_STORAGE_ACTIVE_PROFILE_KEY, editingProfile.id);
      } catch {}
      setSaveMessage(
        t(
          'Profile saved! (API keys kept in secure memory, not persisted to localStorage)',
          '配置已保存！（API 密钥仅保留在安全内存中，不会写入本地存储）'
        )
      );
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  const handleDeleteProfile = async () => {
    if (profiles.length <= 1) {
      alert(t('Cannot delete the only remaining profile.', '无法删除最后一个配置。'));
      return;
    }
    if (confirm(t(`Delete profile "${editingProfile.name}"?`, `确定删除配置 "${editingProfile.name}"？`))) {
      if (window.medscience?.model) {
        await window.medscience.model.deleteProfile(editingProfile.id);
        await loadProfiles();
      } else {
        const nextList = profiles.filter((p) => p.id !== editingProfile.id);
        setProfiles(nextList);
        setSelectedProfileId(nextList[0].id);
        setEditingProfile(nextList[0]);
        try {
          const sanitizedStorageList = nextList.map((p) => ({
            ...p,
            apiKey: p.apiKey ? '••••••••' : '',
          }));
          localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(sanitizedStorageList));
          localStorage.setItem(LOCAL_STORAGE_ACTIVE_PROFILE_KEY, nextList[0].id);
        } catch {}
      }
    }
  };

  const handleTestConnection = async () => {
    setTestStatus({ testing: true });
    setSaveMessage('');
    if (window.medscience?.model) {
      try {
        const result = await window.medscience.model.testConnection(editingProfile);
        setTestStatus({ testing: false, result });
      } catch (err: any) {
        setTestStatus({
          testing: false,
          result: {
            success: false,
            latencyMs: 0,
            message: t('Probe failed', '探测失败'),
            error: err?.message || String(err),
          },
        });
      }
    } else {
      setTimeout(() => {
        setTestStatus({
          testing: false,
          result: {
            success: true,
            latencyMs: 42,
            message: t('Simulated connection test passed (Web Preview Mode).', '模拟连接测试通过（网页预览模式）。'),
          },
        });
      }, 500);
    }
  };

  const loadExecutionProfiles = async () => {
    if (!window.medscience?.runtime) return;
    try {
      const [list, active] = await Promise.all([
        window.medscience.runtime.listProfiles(),
        window.medscience.runtime.getActiveProfile(),
      ]);
      const allLocal = list.filter((p): p is LocalRuntimeExecutionProfile => p.mode === 'local-runtime');
      const existingApi = list.find((p) => p.mode === 'api');
      setLocalProfiles(allLocal);
      const currentLocal =
        (active?.mode === 'local-runtime' ? (active as LocalRuntimeExecutionProfile) : undefined) || allLocal[0];
      if (currentLocal) setEditingLocalProfile(currentLocal);
      if (existingApi) setActiveApiExecProfileId(existingApi.id);
      setExecutionMode(active?.mode === 'local-runtime' ? 'local-runtime' : 'api');
      // Only auto-expand the Model API section if it's already what's
      // actually running -- otherwise it stays collapsed by default.
      if (active?.mode === 'api') setShowApiSection(true);
      if (allLocal.length > 0) {
        void refreshDiscoverableRuntimes();
        void loadUsage();
      }
    } catch (err) {
      console.error('Failed to load execution profiles:', err);
    }
  };

  // Silent variant of handleDetectAndBind's scan -- populates discoverableRuntimes
  // (used for each bound-runtime card's status dot, Multica's HealthDot
  // pattern from its runtime settings page) without opening the bind panel.
  // Only called when at least one local runtime is already bound, so a user
  // who has never touched local runtimes never pays for a login-shell probe
  // just from opening this settings page.
  const refreshDiscoverableRuntimes = async () => {
    if (!window.medscience?.runtime?.discoverAll) return;
    try {
      const results = await window.medscience.runtime.discoverAll();
      setDiscoverableRuntimes(results);
    } catch (err) {
      console.error('Failed to refresh runtime status:', err);
    }
  };

  // Selecting a bound runtime immediately makes it the active execution
  // profile -- there is no separate "Save" step for switching between
  // already-bound local runtimes, since Local Runtime is the default,
  // always-on section of this page now (the old API-vs-local-runtime
  // toggle is gone; API is the opt-in one, see showApiSection).
  const handleSelectLocalProfile = async (profile: LocalRuntimeExecutionProfile) => {
    setEditingLocalProfile(profile);
    if (window.medscience?.runtime) {
      await window.medscience.runtime.setActiveProfile(profile.id);
      setExecutionMode('local-runtime');
    }
  };

  // Runs the actual scan (discoverAll) and stores its results -- shared by
  // the modal's initial open and its manual "Rescan" button.
  const runDiscoveryScan = async () => {
    if (!window.medscience?.runtime?.discoverAll) return;
    setBindScanning(true);
    setBindSummary('');
    try {
      const results = await window.medscience.runtime.discoverAll();
      setDiscoverableRuntimes(results);
    } catch (err: any) {
      setBindSummary(`${t('Error', '错误')}: ${err?.message || String(err)}`);
    } finally {
      setBindScanning(false);
    }
  };

  // Click "Bind Local Runtime" -> open the modal and start scanning right
  // away. Unlike the old flow, nothing is bound automatically once the
  // scan finishes -- the modal just switches from "detecting..." to a
  // list of every catalog tool with its status, and stays open so the
  // user can read it and decide what to bind, one at a time.
  const handleOpenBindModal = () => {
    setBindModalOpen(true);
    void runDiscoveryScan();
  };

  // Re-scan without closing the modal -- e.g. after installing a tool or
  // fixing its PATH, to check again in place.
  const handleRescan = () => {
    void runDiscoveryScan();
  };

  // Binds exactly the one runtime the user clicked "Bind" for. The modal
  // stays open afterwards (success or failure) -- that row just flips to
  // "Bound" (or bindSummary shows the error) so the user can keep going
  // through the rest of the list.
  const handleBindOneRuntime = async (d: DiscoverableRuntime) => {
    if (!window.medscience?.runtime?.bindTool) return;
    const hadNoBoundRuntimesBefore = localProfiles.length === 0;
    setBindingRuntime(d.runtime);
    setBindSummary('');
    try {
      const result = await window.medscience.runtime.bindTool(d.runtime);
      if (result.success && result.profile) {
        await loadExecutionProfiles();
        if (hadNoBoundRuntimesBefore) {
          // Nothing was bound/active before -- make this the active one so
          // the page isn't left showing a default, unbound Codex profile.
          setEditingLocalProfile(result.profile);
          setExecutionMode('local-runtime');
          await window.medscience.runtime.setActiveProfile(result.profile.id);
        }
      } else {
        setBindSummary(`${t('Error', '错误')}: ${result.errors?.join(', ') || t('Bind failed.', '绑定失败。')}`);
      }
    } catch (err: any) {
      setBindSummary(`${t('Error', '错误')}: ${err?.message || String(err)}`);
    } finally {
      setBindingRuntime(undefined);
    }
  };

  // Only the user closes this modal now -- no auto-close on scan finish or
  // on a successful bind, per the user's explicit request.
  const handleCloseBindModal = () => {
    setBindModalOpen(false);
    setBindSummary('');
  };

  const handleDeleteLocalProfile = async (profile: LocalRuntimeExecutionProfile) => {
    if (!window.medscience?.runtime) return;
    if (!confirm(t(`Unbind "${profile.name}"?`, `确定要解绑 "${profile.name}" 吗？`))) return;
    await window.medscience.runtime.deleteProfile(profile.id);
    await loadExecutionProfiles();
  };

  // "Daemon status" for a single-process runtime: since CodexRuntimeBackend
  // keeps each session's Codex child process alive for as long as this
  // `npm run web`/Electron main process itself is alive (see its handles
  // map), this list of active sessions IS the closest local equivalent to
  // `multica daemon status` -- there is no separate daemon process to ask,
  // this process is effectively it. Polled lightly while the local-runtime
  // panel is visible so it reads as "live" rather than a one-shot snapshot.
  const loadActiveSessions = async () => {
    if (!window.medscience?.runtime?.activeSessions) return;
    try {
      const sessions = await window.medscience.runtime.activeSessions();
      setActiveSessions(sessions);
    } catch (err) {
      console.error('Failed to load active local-runtime sessions:', err);
    }
  };

  // Polled alongside active sessions (same 5s cadence) rather than only on
  // page load, so a token count keeps climbing in the UI while a Codex
  // turn is actually running, not just after the page is reopened.
  const loadUsage = async () => {
    if (!window.medscience?.runtime?.getUsage) return;
    try {
      const usage = await window.medscience.runtime.getUsage();
      setUsageByProfile(usage);
    } catch (err) {
      console.error('Failed to load runtime token usage:', err);
    }
  };

  useEffect(() => {
    if (executionMode !== 'local-runtime') return;
    void loadActiveSessions();
    void loadUsage();
    const interval = setInterval(() => {
      void loadActiveSessions();
      void loadUsage();
    }, 5000);
    return () => clearInterval(interval);
  }, [executionMode]);

  const handleSaveExecutionMode = async (mode: 'api' | 'local-runtime') => {
    setRuntimeSaveMsg('');
    if (!window.medscience?.runtime) {
      setRuntimeSaveMsg(t('Not available in this preview.', '预览模式下不可用。'));
      return;
    }
    try {
      if (mode === 'local-runtime') {
        const res = await window.medscience.runtime.saveProfile(editingLocalProfile);
        if (!res.success || !res.profile) {
          setRuntimeSaveMsg(`${t('Error', '错误')}: ${res.errors?.join(', ')}`);
          return;
        }
        await window.medscience.runtime.setActiveProfile(res.profile.id);
        setEditingLocalProfile(res.profile as LocalRuntimeExecutionProfile);
      } else if (activeApiExecProfileId) {
        await window.medscience.runtime.setActiveProfile(activeApiExecProfileId);
      }
      setExecutionMode(mode);
      setRuntimeSaveMsg(t('Execution settings saved.', '运行设置已保存。'));
      setTimeout(() => setRuntimeSaveMsg(''), 3000);
    } catch (err: any) {
      setRuntimeSaveMsg(`${t('Error', '错误')}: ${err?.message || String(err)}`);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 sm:p-10 max-w-[1100px] mx-auto w-full">
      {/* "Bind Local Runtime" opens this modal and starts scanning right
          away. It deliberately does NOT auto-close when the scan finishes
          or when a tool gets bound -- the user asked to see the full
          result list (bound / available-to-bind / not-found-with-reason)
          and close it themselves once they're done, rather than have it
          vanish the instant detection completes. */}
      {bindModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="flex flex-col bg-bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
              <h3 className="text-sm font-semibold text-text-primary">{t('Local Runtimes', '本地运行时')}</h3>
              <button
                onClick={handleCloseBindModal}
                title={t('Close', '关闭')}
                className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              {bindScanning ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <PlugZap size={26} className="text-accent animate-pulse" />
                  <p className="text-sm font-semibold text-text-primary">{t('Detecting local runtimes...', '正在检测本地运行时…')}</p>
                  <p className="text-[11px] text-text-muted leading-relaxed max-w-xs">
                    {t(
                      'Scanning this machine for installed CLIs (Codex, Claude Code, OpenCode, ...).',
                      '正在扫描本机已安装的 CLI（Codex、Claude Code、OpenCode 等）。'
                    )}
                  </p>
                </div>
              ) : discoverableRuntimes.length === 0 ? (
                <p className="text-[11px] text-text-muted text-center py-6">{t('No scan results yet.', '暂无检测结果。')}</p>
              ) : (
                <div className="space-y-1.5">
                  {discoverableRuntimes
                    .slice()
                    .sort((a, b) => {
                      // Bound first (nothing to do there), then things you
                      // actually could bind, then not-found last -- so the
                      // actionable rows aren't buried below ~20 "not found"
                      // entries from the full catalog.
                      const rank = (d: DiscoverableRuntime) =>
                        localProfiles.some((p) => p.runtime === d.runtime) ? 0 : d.probe.available ? 1 : 2;
                      return rank(a) - rank(b) || a.displayName.localeCompare(b.displayName);
                    })
                    .map((d) => {
                      const bound = localProfiles.some((p) => p.runtime === d.runtime);
                      const isThisBinding = bindingRuntime === d.runtime;
                      return (
                        <div key={d.runtime} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-bg-elevated/30 border border-border">
                          <Terminal size={13} className={`shrink-0 ${d.probe.available ? 'text-text-secondary' : 'text-text-muted/40'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-text-primary truncate">{d.displayName}</div>
                            <div
                              className={`text-[10px] truncate ${d.probe.available ? 'text-text-muted' : 'text-text-muted/60'}`}
                              title={d.probe.message || d.probe.executablePath}
                            >
                              {d.probe.available
                                ? d.probe.version
                                  ? `v${d.probe.version}`
                                  : t('Found', '已找到')
                                : d.probe.message || t('Not found', '未找到')}
                            </div>
                          </div>
                          {bound ? (
                            <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-emerald-400 px-2 py-1">
                              <CheckCircle2 size={12} />
                              {t('Bound', '已绑定')}
                            </span>
                          ) : d.probe.available ? (
                            <button
                              onClick={() => void handleBindOneRuntime(d)}
                              disabled={isThisBinding}
                              className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 transition-colors disabled:opacity-60 disabled:cursor-wait"
                            >
                              {isThisBinding ? t('Binding...', '绑定中…') : t('Bind', '绑定')}
                            </button>
                          ) : (
                            <span className="shrink-0 text-[10px] text-text-muted/50">{t('Not installed', '未安装')}</span>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
              {bindSummary && <p className="text-[11px] text-red-400 mt-3">{bindSummary}</p>}
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0">
              <button
                onClick={handleRescan}
                disabled={bindScanning}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
              >
                <RefreshCw size={11} className={bindScanning ? 'animate-spin' : ''} />
                {t('Rescan', '重新检测')}
              </button>
              <button
                onClick={handleCloseBindModal}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-bg-elevated hover:bg-bg-hover text-text-primary border border-border transition-colors"
              >
                {t('Close', '关闭')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-2.5 pb-6 border-b border-border">
        <div className="p-2 rounded-lg bg-accent/10 text-accent">
          <Cpu size={22} />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-text-primary">{t('Runtime (Model Configuration)', '运行时（模型配置）')}</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            {t('Which model answers your research, and what executes it.', '选择由哪个模型回答你的研究问题，以及由什么来执行它。')}
          </p>
        </div>
      </div>
      {/* ---- Section: Execution Runtime ---- */}
      <div className="mt-6 space-y-5">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">{t('Runtime', '运行时')}</h3>
          <span className="text-[10px] font-bold uppercase tracking-wider text-accent bg-accent/10 border border-accent/20 rounded-full px-2 py-0.5">
            {t('Recommended', '推荐使用')}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/20">
          <h4 className="text-xs font-semibold text-accent mb-1">
            {t('Recommended: bind a local runtime', '推荐使用运行时')}
          </h4>
          <p className="text-[11px] text-text-muted">
            {t(
              'A local runtime (Codex, Claude Code, OpenCode...) runs your own locally-installed CLI, which can read/write files and run commands in a working directory you choose, and always asks for your approval first. API mode below only calls the model configured over the network.',
              '本地运行时（Codex、Claude Code、OpenCode 等）运行你本机安装的 CLI，它可以在你指定的工作目录中读写文件并执行命令，并且始终会先征得你的批准。下方的 API 模式仅通过网络调用所配置的模型。'
            )}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">
              {t('Bound Runtimes', '已绑定的运行时')}
            </label>
            {localProfiles.length > 0 && (
              <button
                onClick={() => void refreshDiscoverableRuntimes()}
                title={t('Re-check status', '重新检测状态')}
                className="flex items-center gap-1 text-[10px] font-semibold text-text-muted hover:text-text-primary transition-colors"
              >
                <RefreshCw size={10} />
                {t('Refresh status', '刷新状态')}
              </button>
            )}
          </div>
          {localProfiles.length === 0 ? (
            <p className="text-[11px] text-text-muted mb-2.5">
              {t('No local runtime bound yet.', '尚未绑定任何本地运行时。')}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 mb-2.5">
              {/* Column header, aligned with each row's columns below. No
                  "selected" column anymore -- which runtime answers a given
                  conversation is chosen per-conversation in the composer's
                  ExecutionProfilePicker, not pinned here, so this list is
                  purely for managing what's bound. */}
              <div className="flex items-center gap-3 px-3 text-[9px] font-semibold uppercase tracking-wider text-text-muted/70">
                <div className="shrink-0 w-[13px]" />
                <div className="shrink-0 w-[150px]">{t('Runtime', '运行时')}</div>
                <div className="flex-1 min-w-0" />
                <div className="shrink-0 w-[70px] text-right">{t('Version', '版本')}</div>
                <div className="shrink-0 w-[90px] text-right">{t('Status', '状态')}</div>
                <div className="shrink-0 w-[56px] text-right">{t('Active', '会话')}</div>
                <div className="shrink-0 w-[110px] text-right">{t('Tokens Used', '已用 Token')}</div>
                <div className="shrink-0 w-[24px]" />
              </div>
              {localProfiles.map((p) => {
                const liveProbe = discoverableRuntimes.find((d) => d.runtime === p.runtime)?.probe;
                // The CLI-status column, merged directly into this row --
                // previously a separate "<Runtime> CLI Status" panel shown
                // below the whole bound-runtimes list. Now every row carries
                // its own status inline, in the same list.
                const statusLine =
                  liveProbe === undefined
                    ? t('Not checked', '尚未检测')
                    : liveProbe.available
                    ? liveProbe.version
                      ? `v${liveProbe.version}`
                      : t('Found', '已找到')
                    : liveProbe.message || t('Not found', '未找到');
                // Online/offline replaces the old colored dot -- a green
                // Wifi glyph + "Online"/"在线" is a more legible signal than
                // a bare dot for "this CLI resolved on this machine right
                // now and can be used", per the user's explicit request.
                const isOnline = liveProbe?.available === true;
                const isChecked = liveProbe !== undefined;
                const onlineLabel = !isChecked ? t('Unknown', '未知') : isOnline ? t('Online', '在线') : t('Offline', '离线');
                const onlineTitle = !isChecked
                  ? t('Not checked yet', '尚未检测')
                  : isOnline
                  ? t('Reachable on this machine -- this runtime can be used', '本机可访问 -- 该运行时可用')
                  : t('No longer found on this machine', '本机已找不到');
                const onlineTextClass = !isChecked ? 'text-text-muted/50' : isOnline ? 'text-emerald-400' : 'text-red-400';
                // Active-session count for THIS bound profile specifically
                // (RuntimeUsageStore's sibling concept -- see
                // ActiveLocalRuntimeSession.profileId on the core side),
                // replacing the old single stacked "Active Runtime
                // Sessions" panel with one number per row.
                const sessionCount = activeSessions.filter((s) => s.profileId === p.id).length;
                // Cumulative token usage (see RuntimeUsageStore.ts) -- real
                // and persisted for Codex, since it's the only local
                // runtime that can actually execute turns today. Other
                // runtimes have no usage record yet, so this just reads as
                // "0 tokens" (formatTokenCount treats undefined as 0)
                // rather than a separate "not tracked" note.
                const usage = usageByProfile[p.id];
                const usageLabel = t(
                  `${formatTokenCount(usage?.totalTokens)} tokens`,
                  `${formatTokenCount(usage?.totalTokens)} token`
                );
                return (
                  <div
                    key={p.id}
                    className="group relative flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-xl border border-border bg-bg-elevated/30 hover:border-text-muted transition-colors"
                  >
                    <button onClick={() => handleSelectLocalProfile(p)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                      <Terminal size={13} className="shrink-0 text-text-muted" />
                      <div className="shrink-0 w-[150px]">
                        <span className="text-xs font-semibold text-text-primary truncate block">{RUNTIME_LABELS[p.runtime] || p.runtime}</span>
                      </div>
                      <div className="text-[10px] text-text-muted truncate flex-1 min-w-0">{p.name}</div>
                      <div
                        className={`shrink-0 w-[70px] text-right text-[10px] font-mono truncate ${
                          liveProbe?.available === false ? 'text-red-400' : 'text-text-muted'
                        }`}
                        title={liveProbe?.executablePath || statusLine}
                      >
                        {statusLine}
                      </div>
                      <div className="shrink-0 w-[90px] flex items-center justify-end gap-1" title={onlineTitle}>
                        {isOnline ? (
                          <Wifi size={12} className="text-emerald-400" />
                        ) : (
                          <WifiOff size={12} className={isChecked ? 'text-red-400' : 'text-text-muted/40'} />
                        )}
                        <span className={`text-[10px] font-semibold truncate ${onlineTextClass}`}>{onlineLabel}</span>
                      </div>
                      <div
                        className="shrink-0 w-[56px] flex items-center justify-end gap-1 text-[10px] font-mono text-text-muted"
                        title={t('Conversations currently running on this runtime', '当前正在使用该运行时的会话数')}
                      >
                        <Activity size={11} className={sessionCount > 0 ? 'text-emerald-400' : 'text-text-muted/40'} />
                        {sessionCount}
                      </div>
                      <div
                        className="shrink-0 w-[110px] text-right text-[10px] font-mono text-text-muted truncate"
                        title={t('Cumulative tokens used through MedScience', '通过 MedScience 累计使用的 token 量')}
                      >
                        {usageLabel}
                      </div>
                    </button>
                    <button
                      onClick={() => handleDeleteLocalProfile(p)}
                      title={t('Unbind', '解绑')}
                      className="shrink-0 p-1 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {(() => {
            const selectedProbe = discoverableRuntimes.find((d) => d.runtime === editingLocalProfile.runtime)?.probe;
            return selectedProbe?.protocolAvailable === false ? (
              <div className="mb-2.5 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                {t('app-server protocol not available -- please upgrade Codex.', '未检测到 app-server 协议，请升级 Codex。')}
              </div>
            ) : null;
          })()}

          <div className="flex flex-col items-center text-center gap-1.5 mt-1">
            <button
              onClick={handleOpenBindModal}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-accent/15 hover:bg-accent/25 text-accent rounded-lg text-xs font-medium border border-accent/30 transition-colors"
            >
              <PlugZap size={13} />
              {t('Bind Local Runtime', '绑定本地运行时')}
            </button>
            <p className="text-[10px] text-text-muted leading-relaxed max-w-md">
              {t(
                `Detects: ${ALL_RUNTIME_NAMES_LIST}.`,
                `支持检测：${ALL_RUNTIME_NAMES_LIST}。`
              )}
            </p>
            {bindSummary && (
              <p className="text-[11px] text-text-secondary">{bindSummary}</p>
            )}
          </div>
        </div>

        {/* The old "API Research vs Local Runtime" two-card toggle is gone --
            a bound local runtime is now the default, unconditional path
            (selecting one above activates it immediately, see
            handleSelectLocalProfile), and Model API is the opt-in section
            below (collapsed unless the user clicks into it). */}
        {localProfiles.length > 0 && (
          <div className="space-y-4">
            {editingLocalProfile.runtime === 'codex' ? (
              <div className="p-3 rounded-xl bg-bg-elevated/30 border border-border text-[11px] text-text-muted">
                {t(
                  'Every command your local runtime wants to run and every file it wants to change will ask for your approval first. Nothing is auto-approved.',
                  '本地运行时想要执行的每个命令、想要修改的每个文件都会先请求你的批准，不会自动批准任何操作。'
                )}
              </div>
            ) : (
              (() => {
                const rt = editingLocalProfile.runtime;
                // Only Claude Code's non-interactive flags are confirmed
                // against real vendor docs; OpenCode's are a documented
                // guess at an existing (but unverified) CLI subcommand;
                // every other catalog tool falls back to a generic,
                // unverified `-p <prompt>` guess. See runtimeCatalog.ts's
                // nonInteractiveArgs doc comment for the full reasoning.
                const confidence =
                  rt === 'claude-code'
                    ? {
                        en: 'invoked with flags confirmed against Claude Code’s official headless-mode docs',
                        zh: '调用参数已对照 Claude Code 官方无头模式文档确认',
                      }
                    : rt === 'opencode'
                    ? {
                        en: 'invoked with a best-effort guess at its CLI ("opencode run <prompt>") -- not yet verified against a real install',
                        zh: '调用参数是最佳猜测（opencode run <prompt>），尚未在真实安装环境中验证',
                      }
                    : {
                        en: 'invoked with a generic, unverified guess at its CLI ("-p <prompt>")',
                        zh: '调用参数是通用猜测（-p <prompt>），尚未针对该工具验证',
                      };
                return (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                    {t(
                      `${RUNTIME_LABELS[rt]} is bound and runs research turns directly as a one-shot CLI process, ${confidence.en}. Unlike Local Codex, there is no per-command or per-file approval step here -- whatever it decides to do, it does, governed only by that tool's own default behavior when run non-interactively. If it hangs, mishandles the prompt, or uses the wrong flag, tell us so the invocation can be corrected.`,
                      `${RUNTIME_LABELS[rt]} 已绑定，会直接以一次性 CLI 进程的方式执行研究任务，${confidence.zh}。与本地 Codex 不同，这里没有逐条命令 / 逐个文件的审批环节 -- 它决定做什么就会直接执行，仅受该工具自身在非交互模式下默认行为的约束。如果出现卡住、误解提示词或参数不对的情况，请告诉我们以便修正调用方式。`
                    )}
                  </div>
                );
              })()
            )}
            {runtimeSaveMsg && <p className="text-xs text-emerald-400 font-medium">{runtimeSaveMsg}</p>}
          </div>
        )}
      </div>

      {/* ---- Section: Model / API (opt-in, collapsed by default) ---- */}
      <div className="mt-10 space-y-5">
        <button
          type="button"
          onClick={() => setShowApiSection((v) => !v)}
          className="w-full flex items-center justify-between gap-2 group"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted group-hover:text-text-secondary transition-colors">
            {t('Model API (optional)', '模型 API（可选）')}
          </h3>
          <ChevronDown
            size={14}
            className={`text-text-muted transition-transform ${showApiSection ? 'rotate-180' : ''}`}
          />
        </button>

        {!showApiSection && (
          <button
            type="button"
            onClick={() => setShowApiSection(true)}
            className="w-full text-left p-3.5 rounded-xl border border-dashed border-border hover:border-accent/40 bg-bg-elevated/20 transition-colors"
          >
            <p className="text-xs text-text-secondary">
              {t(
                'MedScience defaults to a bound local runtime. Click here to configure a model API and switch to calling it over the network instead.',
                'MedScience 默认使用已绑定的本地运行时。点击此处配置模型 API，改为通过网络调用模型。'
              )}
            </p>
          </button>
        )}

        {showApiSection && (
        <>
        <div className="flex items-center justify-between gap-3 bg-bg-elevated p-3 rounded-xl border border-border">
          <div className="flex-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">
              {t('Active Profile', '当前配置')}
            </label>
            <select
              value={selectedProfileId}
              onChange={(e) => handleSelectProfile(e.target.value)}
              className="w-full bg-bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isDefault ? t('(Default)', '（默认）') : ''} — {p.model}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 pt-4">
            <button
              onClick={handleCreateNewProfile}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-accent/15 hover:bg-accent/25 text-accent rounded-lg text-xs font-medium border border-accent/30 transition-colors"
            >
              <Plus size={13} />
              <span>{t('New', '新建')}</span>
            </button>
            {profiles.length > 1 && (
              <button
                onClick={handleDeleteProfile}
                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg border border-red-500/20 transition-colors"
                title={t('Delete profile', '删除配置')}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3.5 bg-bg-elevated/30 p-4 rounded-xl border border-border">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                {t('Profile Label', '配置名称')}
              </label>
              <input
                type="text"
                value={editingProfile.name}
                onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                placeholder="e.g. DeepSeek V3 (Production)"
                className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">{t('Protocol', '协议')}</label>
              <select
                value={editingProfile.protocol}
                onChange={(e) =>
                  setEditingProfile({
                    ...editingProfile,
                    protocol: e.target.value as ProtocolType,
                  })
                }
                className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="openai-compatible">{t('OpenAI Compatible (Default)', 'OpenAI 兼容（默认）')}</option>
                <option value="anthropic-compatible">{t('Anthropic Claude', 'Anthropic Claude')}</option>
                <option value="mock">{t('Mock Provider (Air-gapped Sandbox)', '模拟提供方（隔离沙盒）')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1 flex items-center gap-1.5">
                <Server size={13} className="text-text-muted" />
                <span>{t('Base URL', 'API 地址')}</span>
              </label>
              <input
                type="text"
                value={editingProfile.baseUrl}
                onChange={(e) => setEditingProfile({ ...editingProfile, baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                {t('Model Identifier', '模型标识')}
              </label>
              <input
                type="text"
                value={editingProfile.model}
                onChange={(e) => setEditingProfile({ ...editingProfile, model: e.target.value })}
                placeholder="gpt-4o, claude-3-7-sonnet, deepseek-chat"
                className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Key size={13} className="text-text-muted" />
                <span>{t('API Secret Key', 'API 密钥')}</span>
              </span>
              <button
                type="button"
                onClick={() => setShowApiKey((prev) => !prev)}
                className="text-[11px] text-accent hover:underline flex items-center gap-1"
              >
                {showApiKey ? <EyeOff size={12} /> : <Eye size={12} />}
                <span>{showApiKey ? t('Hide', '隐藏') : t('Show', '显示')}</span>
              </button>
            </label>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={editingProfile.apiKey || ''}
              onChange={(e) => setEditingProfile({ ...editingProfile, apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
            />
            <p className="text-[11px] text-text-muted mt-1">
              {t('API keys are protected and never echoed to telemetry or logs.', 'API 密钥会被妥善保护，不会出现在日志或遥测数据中。')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                {t('Context Window (tokens)', '上下文窗口（tokens）')}
              </label>
              <input
                type="number"
                value={editingProfile.contextWindow}
                onChange={(e) =>
                  setEditingProfile({ ...editingProfile, contextWindow: parseInt(e.target.value) || 128000 })
                }
                className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                {t('Max Completion Tokens', '最大生成 Tokens')}
              </label>
              <input
                type="number"
                value={editingProfile.maxTokens}
                onChange={(e) =>
                  setEditingProfile({ ...editingProfile, maxTokens: parseInt(e.target.value) || 4096 })
                }
                className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editingProfile.streaming}
                onChange={(e) => setEditingProfile({ ...editingProfile, streaming: e.target.checked })}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-xs text-text-secondary">{t('Enable SSE Streaming', '启用流式传输 (SSE)')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editingProfile.toolCalling}
                onChange={(e) => setEditingProfile({ ...editingProfile, toolCalling: e.target.checked })}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-xs text-text-secondary">{t('Function / Tool Calling Support', '支持函数 / 工具调用')}</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <button
              onClick={handleTestConnection}
              disabled={testStatus.testing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:border-accent/40 bg-bg-elevated hover:bg-bg-hover text-xs font-medium text-text-primary transition-colors disabled:opacity-50"
            >
              <Activity size={13} className={testStatus.testing ? 'animate-spin text-accent' : 'text-accent'} />
              <span>{testStatus.testing ? t('Probing endpoint...', '正在探测接口…') : t('Test Connection', '测试连接')}</span>
            </button>
            {saveMessage && <span className="text-xs text-emerald-400 font-medium">{saveMessage}</span>}
          </div>

          <button
            onClick={handleSaveProfile}
            className="px-4 py-2 bg-bg-elevated border border-border text-text-primary font-semibold rounded-lg text-xs hover:border-accent/40 transition-colors"
          >
            {t('Save Profile', '保存配置')}
          </button>
        </div>

        {testStatus.result && (
          <div
            className={`p-3 rounded-xl border text-xs ${
              testStatus.result.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            <div className="flex items-center justify-between font-semibold mb-1">
              <span>{testStatus.result.success ? t('Probe Succeeded', '探测成功') : t('Probe Failed', '探测失败')}</span>
              {testStatus.result.latencyMs !== undefined && (
                <span className="font-mono text-[11px] opacity-80">{testStatus.result.latencyMs}ms</span>
              )}
            </div>
            <p className="text-[11px] opacity-90">{testStatus.result.message || testStatus.result.error}</p>
          </div>
        )}

        {/* The explicit "switch execution to API" action -- separate from
            "Save Profile" above, which only saves the model connection
            details. This is what actually flips execution away from the
            default local runtime. */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          {runtimeSaveMsg && <span className="text-xs text-emerald-400 font-medium">{runtimeSaveMsg}</span>}
          <button
            onClick={() => handleSaveExecutionMode('api')}
            className={`ml-auto px-4 py-2 font-semibold rounded-lg text-xs transition-colors shadow-xs ${
              executionMode === 'api'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-accent text-accent-foreground hover:bg-accent/90'
            }`}
          >
            {executionMode === 'api' ? t('Currently Active', '当前正在使用') : t('Use Model API', '使用模型 API')}
          </button>
        </div>
        </>
        )}
      </div>

    </div>
  );
};
