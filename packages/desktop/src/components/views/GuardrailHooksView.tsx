import React from 'react';
import { Shield } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Full sidebar page (formerly the Settings modal's "Guardrail Hooks" tab)
 * listing the deterministic lifecycle hooks that run around every tool
 * call -- credential redaction, evidence verification, clinical data
 * gating, and the pre-completion evidence-citation check.
 */
export const GuardrailHooksView: React.FC = () => {
  const { t } = useLanguage();

  const hooks = [
    {
      name: 'secret-redaction',
      event: 'PreToolUse',
      desc: t('Masks and blocks API keys and secrets in outbound queries.', '屏蔽并拦截外发请求中的 API 密钥与敏感信息。'),
    },
    {
      name: 'evidence-verifier',
      event: 'PostToolUse',
      desc: t('Validates physical boundary limits and mathematical consistency.', '校验物理边界限制与数学一致性。'),
    },
    {
      name: 'clinical-data-gate',
      event: 'PreToolUse',
      desc: t('Intercepts EHR and DICOM transmissions to air-gapped sandboxes.', '拦截 EHR 与 DICOM 数据向隔离沙盒之外的传输。'),
    },
    {
      name: 'evidence-completeness-check',
      event: 'Stop',
      desc: t('Ensures all syntheses cite valid Evidence IDs before closing.', '确保结束前所有综述均引用了有效的证据编号。'),
    },
  ];

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 sm:p-10 max-w-[1100px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-2.5 pb-6 border-b border-border">
        <div className="p-2 rounded-lg bg-accent/10 text-accent">
          <Shield size={22} />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-text-primary">{t('Guardrail Hooks', '防护钩子')}</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            {t(
              'Formal lifecycle hooks that automatically protect credentials, verify physical numbers, and prevent data leakage.',
              '形式化的生命周期钩子会自动保护凭证、校验物理数值，并防止数据泄露。'
            )}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/20">
          <h4 className="text-xs font-semibold text-accent mb-1">
            {t('4 Active Deterministic Guardrails', '4 项已启用的确定性防护')}
          </h4>
          <p className="text-[11px] text-text-muted">
            {t(
              'Formal lifecycle hooks automatically protect credentials, verify physical numbers, and prevent data leakage.',
              '形式化的生命周期钩子会自动保护凭证、校验物理数值，并防止数据泄露。'
            )}
          </p>
        </div>

        <div className="space-y-2">
          {hooks.map((hook, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-bg-elevated/40 border border-border">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-text-primary">{hook.name}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/15 text-accent">{hook.event}</span>
                </div>
                <p className="text-[11px] text-text-muted mt-1">{hook.desc}</p>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-xs" title={t('Active', '已启用')} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
