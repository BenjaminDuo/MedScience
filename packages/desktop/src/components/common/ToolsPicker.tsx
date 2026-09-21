import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Database, ChevronDown } from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';

interface ToolsPickerProps {
  selected: string[];
  onChange: (names: string[]) => void;
}

/**
 * Lets the user prioritize specific registered databases/tools for the next
 * question. There's no per-request tool restriction in the single-agent
 * engine today (unlike the Team engine's capabilityOverrides), so this is
 * honestly a priority hint folded into the prompt text -- not a hard
 * allow-list -- and is labeled that way rather than implying an enforced
 * restriction the engine doesn't actually have.
 */
export const ToolsPicker: React.FC<ToolsPickerProps> = ({ selected, onChange }) => {
  const { availableTools } = useAgent();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, { name: string; description: string }[]>();
    for (const tool of availableTools) {
      const list = byCategory.get(tool.category) || [];
      list.push(tool);
      byCategory.set(tool.category, list);
    }
    return Array.from(byCategory.entries());
  }, [availableTools]);

  const toggle = (name: string) => {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  };

  if (availableTools.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`p-1 rounded hover:bg-bg-hover transition-colors ${
          selected.length > 0 ? 'text-accent' : 'text-text-muted hover:text-text-secondary'
        }`}
        title={t('Prioritize specific databases/tools', '优先使用指定的数据库/工具')}
      >
        <Database size={14} />
        {selected.length > 0 && <span className="ml-0.5 text-[10px] align-top">{selected.length}</span>}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-72 max-h-80 overflow-y-auto rounded-lg border border-border bg-bg-surface shadow-lg z-30">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-text-muted border-b border-border-subtle sticky top-0 bg-bg-surface">
            {t('Prioritize these tools (hint, not a hard restriction)', '优先使用这些工具（提示性，非硬性限制）')}
          </div>
          {grouped.map(([category, tools]) => (
            <div key={category} className="py-1">
              <div className="px-3 py-0.5 text-[10px] font-medium text-text-muted capitalize">{category}</div>
              {tools.map((tool) => (
                <label
                  key={tool.name}
                  className="flex items-start gap-2 px-3 py-1.5 text-xs hover:bg-bg-hover cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(tool.name)}
                    onChange={() => toggle(tool.name)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-text-primary">{tool.name}</div>
                    <div className="truncate text-[10.5px] text-text-muted">{tool.description}</div>
                  </div>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
