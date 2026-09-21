import React from 'react';
import { useAgent } from '../../context/AgentContext';
import { useNav } from '../../context/NavContext';
import { useLanguage } from '../../context/LanguageContext';
import { Clock, ArrowRight, FolderKanban } from 'lucide-react';

export const RecentProjects: React.FC = () => {
  const { sessions, openSession } = useAgent();
  const { setActiveSection } = useNav();
  const { t, language } = useLanguage();

  const recentFour = sessions.slice(0, 4);

  if (sessions.length === 0) {
    return (
      <section className="mt-8 select-none text-left">
        <div className="p-5 rounded-2xl bg-bg-surface border border-border border-dashed flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
              <FolderKanban size={18} />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-primary">{t('No Previous Research Sessions', '暂无历史研究会话')}</h4>
              <p className="text-[11.5px] text-text-secondary mt-0.5">
                {t(
                  'Type an inquiry in the prompt bar above to start your first autonomous scientific investigation.',
                  '在上方输入框中提出问题，开启你的第一次自主科研探索。'
                )}
              </p>
            </div>
          </div>

          <button
            onClick={() => setActiveSection('skills')}
            className="flex items-center gap-1.5 text-xs font-medium text-accent hover:underline self-start sm:self-center shrink-0"
          >
            <span>{t('Explore 19 Scientific Skills', '探索 19 项科研技能')}</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 select-none text-left">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold tracking-tight text-text-primary">
          {t('Recent Research Sessions', '最近的研究会话')}
        </h3>
        <button
          onClick={() => setActiveSection('sessions')}
          className="text-[12px] font-medium text-accent hover:underline transition-colors"
        >
          {t(`View All (${sessions.length})`, `查看全部 (${sessions.length})`)}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {recentFour.map((session) => (
          <div
            key={session.id}
            onClick={() => openSession(session.id)}
            className="group flex flex-col justify-between p-3.5 rounded-xl bg-bg-surface border border-border hover:border-accent/40 hover:bg-bg-hover cursor-pointer transition-all shadow-xs"
          >
            <div>
              <h4 className="text-[13px] font-medium text-text-primary group-hover:text-accent transition-colors leading-snug truncate">
                {session.title}
              </h4>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-text-muted">
              <span className="flex items-center gap-1 font-mono">
                <Clock size={11} />
                <span>{new Date(session.updatedAt || session.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}</span>
              </span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-accent text-[11px] font-semibold">
                {t('Open →', '打开 →')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
