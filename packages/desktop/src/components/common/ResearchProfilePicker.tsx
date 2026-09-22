import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Workflow } from 'lucide-react';
import { RESEARCH_PROFILE_OPTIONS as RESEARCH_PROFILES } from '../../data/researchProfiles';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';

/**
 * The research-workflow ("Profile") choice for a brand-new, not-yet-started
 * research session -- lives in the composer next to SessionModeToggle
 * rather than a sidebar dropdown (an earlier design was rejected for
 * exactly that placement). Only meaningful once sessionType is 'research'
 * (ChatEngine ignores researchProfileId entirely), and locks in (renders
 * nothing) the moment the conversation has any turns, same rule as
 * SessionModeToggle/RuntimeSession.researchProfileId: chosen once at
 * creation, never inferred or changed per-message.
 */
export const ResearchProfilePicker: React.FC = () => {
  const { currentSession, setResearchProfile } = useAgent();
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (currentSession.messages.length > 0 || currentSession.sessionType !== 'research') return null;

  const activeId = currentSession.researchProfileId || 'general';
  const active = RESEARCH_PROFILES.find((p) => p.id === activeId) || RESEARCH_PROFILES[0];
  const activeLabel = language === 'zh' ? active.nameZh : active.nameEn;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-bg-elevated border border-border-subtle text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
        title={t('Research workflow for this session', '本次会话使用的研究工作流')}
      >
        <Workflow size={12} className="text-accent" />
        <span>{activeLabel}</span>
        <ChevronDown size={11} className="text-text-muted" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-72 rounded-lg border border-border bg-bg-surface shadow-lg z-30 overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-text-muted border-b border-border-subtle">
            {t('Research Workflow', '研究工作流')}
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {RESEARCH_PROFILES.map((p) => {
              const isActive = p.id === activeId;
              const label = language === 'zh' ? p.nameZh : p.nameEn;
              const desc = language === 'zh' ? p.descriptionZh : p.descriptionEn;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setResearchProfile(p.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-bg-hover transition-colors ${
                    isActive ? 'bg-accent-soft' : ''
                  }`}
                >
                  {isActive ? (
                    <Check size={13} className="text-accent shrink-0 mt-0.5" />
                  ) : (
                    <span className="w-[13px] shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-text-primary">{label}</span>
                    <span className="block text-[11px] text-text-muted leading-snug mt-0.5">{desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
