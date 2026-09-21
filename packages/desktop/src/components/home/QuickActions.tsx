import React from 'react';
import { BookOpen, BarChart2, FlaskConical, Code2, ChevronDown } from 'lucide-react';
import { mockQuickActions } from '../../data/mockTools';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';

const iconMap: Record<string, React.ElementType> = {
  BookOpen,
  BarChart2,
  FlaskConical,
  Code: Code2,
};

const labelZhMap: Record<string, string> = {
  'qa-lit': '文献综述',
  'qa-data': '数据分析',
  'qa-exp': '实验设计',
  'qa-code': '代码助手',
  'qa-more': '更多',
};

export const QuickActions: React.FC = () => {
  const { submitPrompt } = useAgent();
  const { language } = useLanguage();

  return (
    <div className="flex flex-wrap items-center gap-2.5 mt-3 select-none">
      {mockQuickActions.map((action) => {
        const Icon = iconMap[action.iconName] || BookOpen;
        const isMore = action.id === 'qa-more';
        const label = language === 'zh' ? labelZhMap[action.id] || action.label : action.label;

        return (
          <button
            key={action.id}
            onClick={() => submitPrompt(action.prompt)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-bg-surface hover:bg-bg-hover hover:border-accent/40 text-text-secondary hover:text-text-primary text-[12.5px] font-medium transition-all group shadow-sm"
          >
            {!isMore ? (
              <Icon size={14} className="text-text-muted group-hover:text-accent transition-colors" />
            ) : null}
            <span>{label}</span>
            {isMore && <ChevronDown size={13} className="text-text-muted" />}
          </button>
        );
      })}
    </div>
  );
};
