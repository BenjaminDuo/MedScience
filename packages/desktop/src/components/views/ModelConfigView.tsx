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
  XCircle,
  FolderCog,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type {
  ModelProfile,
  ConnectionTestResult,
  ProtocolType,
  LocalRuntimeExecutionProfile,
  RuntimeProbeResult,
} from '@medscience/core';

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
  return {
    id: override?.id || `exec-codex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: override?.name || 'Local Codex',
    mode: 'local-runtime',
    runtime: 'codex',
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
  const [detectResult, setDetectResult] = useState<RuntimeProbeResult | undefined>();
  const [detecting, setDetecting] = useState(false);
  const [runtimeSaveMsg, setRuntimeSaveMsg] = useState('');

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
      const existingLocal = list.find((p): p is LocalRuntimeExecutionProfile => p.mode === 'local-runtime');
      const existingApi = list.find((p) => p.mode === 'api');
      if (existingLocal) setEditingLocalProfile(existingLocal);
      if (existingApi) setActiveApiExecProfileId(existingApi.id);
      setExecutionMode(active?.mode === 'local-runtime' ? 'local-runtime' : 'api');
      if (active?.mode === 'local-runtime') {
        void runDetect(active.executablePath);
      }
    } catch (err) {
      console.error('Failed to load execution profiles:', err);
    }
  };

  const runDetect = async (executablePath?: string) => {
    if (!window.medscience?.runtime) return;
    setDetecting(true);
    try {
      const result = await window.medscience.runtime.detect(executablePath || editingLocalProfile.executablePath);
      setDetectResult(result);
    } catch (err: any) {
      setDetectResult({
        runtime: 'codex',
        available: false,
        errorCode: 'RUNTIME_START_FAILED',
        message: err?.message || String(err),
      });
    } finally {
      setDetecting(false);
    }
  };

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
      {/* Header */}
      <div className="flex items-center gap-2.5 pb-6 border-b border-border">
        <div className="p-2 rounded-lg bg-accent/10 text-accent">
          <Cpu size={22} />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-text-primary">{t('Model Configuration', '模型配置')}</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            {t('Which model answers your research, and what executes it.', '选择由哪个模型回答你的研究问题，以及由什么来执行它。')}
          </p>
        </div>
      </div>

      {/* ---- Section: Model / API ---- */}
      <div className="mt-6 space-y-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">{t('Model API', '模型 API')}</h3>

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
            className="px-4 py-2 bg-accent text-accent-foreground font-semibold rounded-lg text-xs hover:bg-accent/90 transition-colors shadow-xs"
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
      </div>

      {/* ---- Section: Execution Runtime ---- */}
      <div className="mt-10 space-y-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">{t('Runtime', '运行时')}</h3>

        <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/20">
          <h4 className="text-xs font-semibold text-accent mb-1">
            {t('How MedScience executes your research turns', 'MedScience 执行研究任务的方式')}
          </h4>
          <p className="text-[11px] text-text-muted">
            {t(
              'API mode calls the model configured above. Local Codex mode instead runs your own locally-installed Codex CLI, which can read/write files and run commands in a working directory you choose.',
              'API 模式调用上方配置的模型。本地 Codex 模式则运行你本机安装的 Codex CLI，它可以在你指定的工作目录中读写文件并执行命令。'
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setExecutionMode('api')}
            className={`text-left p-3.5 rounded-xl border transition-colors ${
              executionMode === 'api' ? 'border-accent bg-accent/10' : 'border-border bg-bg-elevated/30 hover:border-text-muted'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Cpu size={14} className={executionMode === 'api' ? 'text-accent' : 'text-text-muted'} />
              <span className="text-xs font-semibold text-text-primary">{t('API Research', 'API 研究')}</span>
            </div>
            <p className="text-[11px] text-text-muted">
              {t('Default. Uses the model configured above.', '默认方式，使用上方配置的模型。')}
            </p>
          </button>
          <button
            onClick={() => setExecutionMode('local-runtime')}
            className={`text-left p-3.5 rounded-xl border transition-colors ${
              executionMode === 'local-runtime'
                ? 'border-accent bg-accent/10'
                : 'border-border bg-bg-elevated/30 hover:border-text-muted'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Terminal size={14} className={executionMode === 'local-runtime' ? 'text-accent' : 'text-text-muted'} />
              <span className="text-xs font-semibold text-text-primary">{t('Local Codex', '本地 Codex')}</span>
            </div>
            <p className="text-[11px] text-text-muted">
              {t(
                'Runs your local Codex CLI. Asks for approval before running commands or editing files.',
                '运行本机 Codex CLI，执行命令或编辑文件前会请求你的批准。'
              )}
            </p>
          </button>
        </div>

        {executionMode === 'local-runtime' && (
          <div className="space-y-4">
            <div className="bg-bg-elevated/30 p-4 rounded-xl border border-border">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-text-secondary">{t('Codex CLI Status', 'Codex CLI 状态')}</span>
                <button
                  onClick={() => runDetect(editingLocalProfile.executablePath)}
                  disabled={detecting}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-[11px] font-semibold text-text-secondary hover:text-text-primary hover:border-text-muted transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={11} className={detecting ? 'animate-spin' : ''} />
                  {t('Re-detect', '重新检测')}
                </button>
              </div>

              {!detectResult && !detecting && (
                <p className="text-[11px] text-text-muted">{t('Not checked yet.', '尚未检测。')}</p>
              )}
              {detecting && <p className="text-[11px] text-text-muted">{t('Checking for Codex CLI...', '正在检测 Codex CLI...')}</p>}
              {detectResult && !detecting && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    {detectResult.available ? (
                      <CheckCircle2 size={13} className="text-emerald-400" />
                    ) : (
                      <XCircle size={13} className="text-red-400" />
                    )}
                    <span className={`text-xs font-semibold ${detectResult.available ? 'text-emerald-300' : 'text-red-300'}`}>
                      {detectResult.available
                        ? t('Codex CLI found', '已找到 Codex CLI')
                        : t('Codex CLI not available', '未找到可用的 Codex CLI')}
                    </span>
                  </div>
                  <div className="text-[11px] text-text-muted space-y-0.5 font-mono">
                    {detectResult.executablePath && <div>{t('Path', '路径')}: {detectResult.executablePath}</div>}
                    {detectResult.version && <div>{t('Version', '版本')}: {detectResult.version}</div>}
                    {detectResult.source && <div>{t('Source', '来源')}: {detectResult.source}</div>}
                    {detectResult.protocolAvailable === false && (
                      <div className="text-amber-400">
                        {t('app-server protocol not available -- please upgrade Codex.', '未检测到 app-server 协议，请升级 Codex。')}
                      </div>
                    )}
                    {detectResult.message && !detectResult.available && (
                      <div className="text-red-300">{detectResult.message}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  {t('Codex Executable Path (optional)', 'Codex 可执行文件路径（可选）')}
                </label>
                <input
                  type="text"
                  value={editingLocalProfile.executablePath || ''}
                  onChange={(e) =>
                    setEditingLocalProfile((prev) => ({ ...prev, executablePath: e.target.value || undefined }))
                  }
                  placeholder={t('Leave blank to auto-detect from PATH', '留空以从 PATH 自动检测')}
                  className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  {t('Model Override (optional)', '模型覆盖（可选）')}
                </label>
                <input
                  type="text"
                  value={editingLocalProfile.model || ''}
                  onChange={(e) => setEditingLocalProfile((prev) => ({ ...prev, model: e.target.value || undefined }))}
                  placeholder={t('Use Codex CLI default', '使用 Codex CLI 默认模型')}
                  className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1 flex items-center gap-1.5">
                  <FolderCog size={12} />
                  {t('Working Directory', '工作目录')}
                </label>
                <select
                  value={editingLocalProfile.workingDirectoryMode}
                  onChange={(e) =>
                    setEditingLocalProfile((prev) => ({
                      ...prev,
                      workingDirectoryMode: e.target.value as 'project' | 'session-workspace',
                    }))
                  }
                  className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
                >
                  <option value="project">{t('Current project folder', '当前项目文件夹')}</option>
                  <option value="session-workspace">{t('Isolated per-session workspace', '按会话隔离的工作区')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">{t('Sandbox', '沙箱级别')}</label>
                <select
                  value={editingLocalProfile.sandboxPreset}
                  onChange={(e) =>
                    setEditingLocalProfile((prev) => ({
                      ...prev,
                      sandboxPreset: e.target.value as 'read-only' | 'workspace-write',
                    }))
                  }
                  className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
                >
                  <option value="read-only">{t('Read-only', '只读')}</option>
                  <option value="workspace-write">{t('Read & write in workspace', '工作区内可读写')}</option>
                </select>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-bg-elevated/30 border border-border text-[11px] text-text-muted">
              {t(
                'Every command Codex wants to run and every file it wants to change will ask for your approval first. Nothing is auto-approved.',
                'Codex 想要执行的每个命令、想要修改的每个文件都会先请求你的批准，不会自动批准任何操作。'
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          {runtimeSaveMsg && <span className="text-xs text-emerald-400 font-medium">{runtimeSaveMsg}</span>}
          <button
            onClick={() => handleSaveExecutionMode(executionMode)}
            className="ml-auto px-4 py-2 bg-accent text-accent-foreground font-semibold rounded-lg text-xs hover:bg-accent/90 transition-colors shadow-xs"
          >
            {t('Save Execution Settings', '保存执行设置')}
          </button>
        </div>
      </div>
    </div>
  );
};
