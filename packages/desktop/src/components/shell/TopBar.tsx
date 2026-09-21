import React from 'react';
import { Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useNav } from '../../context/NavContext';

interface TopBarProps {
  className?: string;
}

export const TopBar: React.FC<TopBarProps> = ({ className = '' }) => {
  const { t } = useLanguage();
  const { setIsCommandPaletteOpen } = useNav();

  return (
    <header
      className={`flex items-center justify-between px-6 h-[52px] bg-bg-surface border-b border-border select-none z-10 ${className}`}
    >
      {/* Left: Static workspace badge -- no longer shows the current
          session's title here (that's already visible in the workspace
          view itself and in the sidebar's session list). */}
      <div className="flex items-center gap-2 max-w-[280px] overflow-hidden text-left">
        <span className="text-[11px] font-mono uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
          {t('Workstation', '工作站')}
        </span>
        <span className="text-[13px] font-medium text-text-secondary truncate">
          {t('MedScience Trusted Research Workstation', 'MedScience 可信科研工作台')}
        </span>
      </div>

      {/* Center: Global Search Bar */}
      <div className="flex-1 max-w-[420px] mx-4">
        <div
          onClick={() => setIsCommandPaletteOpen(true)}
          className="flex items-center justify-between w-full h-[34px] px-3 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-border hover:border-accent/40 text-text-muted hover:text-text-secondary cursor-pointer transition-all shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <Search size={15} className="text-text-muted" />
            <span className="text-[13px]">{t('Search skills, evidence, papers...', '搜索技能、证据、文献…')}</span>
          </div>
          <kbd className="flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-surface text-text-muted border border-border-subtle">
            <span>⌘</span>
            <span>K</span>
          </kbd>
        </div>
      </div>

      {/* Right: intentionally empty -- Settings/Appearance/Language moved
          into the sidebar's "配置" (Configuration) section and the
          Model Configuration / Guardrail Hooks pages. */}
      <div className="flex items-center gap-1.5 min-w-[1px]" />
    </header>
  );
};
