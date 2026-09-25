import React, { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, ShieldAlert, ShieldCheck, Trash2, X } from 'lucide-react';
import type { SkillInstallResult } from '@medscience/core';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Installing a scientific skill from a URL, with its security audit shown.
 *
 * This used to exist only as `medscience skill install <url>`. The skills page
 * is where someone actually goes looking for a skill, and the CLI that carried
 * this was removed, so it lives here now.
 *
 * The audit is the point, not a formality: SkillInstaller stages the source,
 * scans every file, and refuses to commit anything that trips a rule. A
 * refusal is rendered in full -- which file, which rule -- because "install
 * failed" with no reason is what makes people go looking for a way around it.
 */
export const SkillInstallPanel: React.FC = () => {
  const { t } = useLanguage();
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SkillInstallResult | undefined>();
  const [installed, setInstalled] = useState<{ skillId: string; name: string; path: string }[]>([]);

  const refresh = useCallback(() => {
    window.medscience?.skills
      ?.listInstalled()
      .then(setInstalled)
      .catch(() => undefined);
  }, []);

  useEffect(refresh, [refresh]);

  const install = async () => {
    const trimmed = source.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setResult(undefined);
    try {
      const outcome = await window.medscience!.skills!.install(trimmed);
      setResult(outcome);
      if (outcome.success) {
        setSource('');
        refresh();
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : String(error),
        auditReport: { passed: false, totalFilesAudited: 0, violations: [] },
      });
    } finally {
      setBusy(false);
    }
  };

  const uninstall = async (skillId: string) => {
    await window.medscience?.skills?.uninstall(skillId).catch(() => undefined);
    refresh();
  };

  const audit = result?.auditReport;

  return (
    <div className="my-6 rounded-xl border border-border bg-bg-surface p-4">
      <div className="flex items-center gap-2 mb-1">
        <Download size={15} className="text-accent" />
        <h3 className="text-sm font-semibold text-text-primary">
          {t('Install a skill from a URL', '从 URL 安装技能')}
        </h3>
      </div>
      <p className="text-[11.5px] text-text-muted leading-relaxed mb-3">
        {t(
          'A Git URL or a local path. Every file is statically scanned before anything is written to ~/.medscience/skills, and an install that trips a rule is refused outright. A pattern scanner catches careless and obvious code, not a determined author — read the source of anything you install from a stranger.',
          '支持 Git URL 或本地路径。写入 ~/.medscience/skills 之前会逐文件做静态扫描，命中规则即直接拒绝安装。但模式扫描只能拦住粗心和明显的恶意代码，拦不住刻意规避的作者——来源不明的技能，装之前请自己读一遍源码。'
        )}
      </p>

      <div className="flex items-center gap-2">
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') install();
          }}
          placeholder="https://github.com/org/skill-repo"
          disabled={busy}
          className="flex-1 bg-bg-elevated border border-border-subtle rounded-lg px-2.5 py-1.5 text-[12.5px] text-text-primary outline-none focus:border-accent placeholder:text-text-muted font-mono"
        />
        <button
          onClick={install}
          disabled={busy || !source.trim()}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all flex items-center gap-1.5"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {busy ? t('Auditing…', '审查中…') : t('Install', '安装')}
        </button>
      </div>

      {result && (
        <div
          className={`mt-3 rounded-lg border p-3 ${
            result.success ? 'border-status-success/40 bg-status-success/5' : 'border-status-error/40 bg-status-error/5'
          }`}
        >
          <div className="flex items-start gap-2">
            {result.success ? (
              <ShieldCheck size={15} className="text-status-success shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert size={15} className="text-status-error shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] text-text-primary leading-snug">{result.message}</p>
              {audit && (
                <p className="text-[11px] text-text-muted mt-1">
                  {t(
                    `${audit.totalFilesAudited} file(s) audited · ${audit.violations.length} violation(s)`,
                    `已审查 ${audit.totalFilesAudited} 个文件 · ${audit.violations.length} 处违规`
                  )}
                </p>
              )}
            </div>
            <button
              onClick={() => setResult(undefined)}
              className="shrink-0 p-0.5 rounded text-text-muted hover:text-text-primary transition-colors"
            >
              <X size={13} />
            </button>
          </div>

          {audit && audit.violations.length > 0 && (
            <ul className="mt-2.5 space-y-1.5 max-h-48 overflow-y-auto">
              {audit.violations.map((violation, index) => (
                <li key={index} className="text-[11px] leading-snug pl-2 border-l-2 border-status-error/40">
                  <span className="text-status-error font-medium">{violation.severity}</span>
                  <span className="text-text-muted"> · {violation.ruleId}</span>
                  <span className="block font-mono text-text-secondary mt-0.5">
                    {violation.file}:{violation.line}
                  </span>
                  <span className="block text-text-muted mt-0.5">{violation.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {installed.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border-subtle">
          <div className="text-[10.5px] tracking-wide text-text-muted mb-1.5">
            {t(`Installed by you · ${installed.length}`, `你安装的技能 · ${installed.length} 项`)}
          </div>
          {installed.map((skill) => (
            <div key={skill.skillId} className="flex items-center gap-2 py-1">
              <span className="flex-1 min-w-0">
                <span className="text-[12px] text-text-primary">{skill.name}</span>
                <span className="block text-[10.5px] text-text-muted font-mono truncate">{skill.path}</span>
              </span>
              <button
                onClick={() => uninstall(skill.skillId)}
                className="shrink-0 p-1 rounded text-text-muted hover:text-status-error transition-colors"
                title={t('Uninstall', '卸载')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
