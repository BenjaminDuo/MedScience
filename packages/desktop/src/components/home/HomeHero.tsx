import React from 'react';
import { ScientificVisual } from '../common/ScientificVisual';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';

export const HomeHero: React.FC = () => {
  const { desktopTheme } = useTheme();
  const { t } = useLanguage();

  return (
    <section className="relative flex items-center justify-between gap-8 pt-4 pb-6 select-none">
      {/* Left Text Block */}
      <div className="flex-1 max-w-[560px]">
        <h1 className="text-[38px] font-bold tracking-tight text-text-primary leading-tight">
          MedScience
        </h1>
        <h2 className="text-[22px] font-semibold tracking-tight text-accent mt-1 leading-snug">
          {t('Your AI Research Partner', '你的 AI 科研伙伴')}
        </h2>
        <p className="text-[14px] text-text-secondary mt-2.5 max-w-[460px] leading-relaxed">
          {t('Ask anything about science. Discover, analyze, and innovate.', '尽管提出你的科学问题，探索、分析、创新。')}
        </p>
      </div>

      {/* Right Scientific Motif Visual */}
      <div className="hidden md:flex flex-shrink-0 w-[240px] lg:w-[280px] h-[160px] items-center justify-end">
        <ScientificVisual theme={desktopTheme} className="w-full h-full" />
      </div>
    </section>
  );
};
