import React from 'react';
import { FolderKanban, FlaskConical, ShieldCheck, CheckCircle } from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';

export const ResearchStats: React.FC = () => {
  const { sessions } = useAgent();
  const { t } = useLanguage();

  const totalCitations = sessions.reduce((acc, s) => {
    return acc + (s.messages?.reduce((mAcc, m) => mAcc + (m.citations?.length || 0), 0) || 0);
  }, 0);

  const stats = [
    {
      id: 'stat-sessions',
      label: t('Research Sessions', '研究会话'),
      value: sessions.length.toString(),
      icon: FolderKanban,
      color: 'text-accent',
    },
    {
      id: 'stat-skills',
      label: t('Scientific Skills', '科研技能'),
      value: t('19 Loaded', '已加载 19 项'),
      icon: FlaskConical,
      color: 'text-purple-500',
    },
    {
      id: 'stat-evidence',
      label: t('Verified Evidence', '已验证证据'),
      value: t(`${totalCitations} Records`, `${totalCitations} 条记录`),
      icon: ShieldCheck,
      color: 'text-emerald-500',
    },
    {
      id: 'stat-guardrails',
      label: t('Guardrail Hooks', '防护钩子'),
      value: t('4 Enforced', '已启用 4 项'),
      icon: CheckCircle,
      color: 'text-blue-500',
    },
  ];

  return (
    <section className="mt-4 select-none text-left">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-bg-surface border border-border transition-all shadow-xs"
            >
              <div className={`p-2 rounded-lg bg-bg-elevated ${stat.color}`}>
                <Icon size={16} />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] text-text-muted leading-tight">
                  {stat.label}
                </span>
                <span className="text-[14.5px] font-bold text-text-primary tracking-tight mt-0.5 leading-none">
                  {stat.value}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
