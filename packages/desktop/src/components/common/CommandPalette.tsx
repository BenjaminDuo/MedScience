import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  BookOpen,
  BarChart2,
  Moon,
  Sun,
  Terminal,
  Settings,
  FolderKanban,
  X,
} from 'lucide-react';
import { useNav } from '../../context/NavContext';
import { useTheme } from '../../context/ThemeContext';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';

interface CommandItem {
  id: string;
  label: string;
  labelZh: string;
  category: string;
  categoryZh: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
}

export const CommandPalette: React.FC = () => {
  const { isCommandPaletteOpen, setIsCommandPaletteOpen, setActiveSection, setIsSettingsOpen } = useNav();
  const { setDesktopTheme } = useTheme();
  const { resetSession, openSession } = useAgent();
  const { t, language } = useLanguage();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: CommandItem[] = [
    {
      id: 'cmd-new-chat',
      label: 'New Research Inquiry',
      labelZh: '新建研究问题',
      category: 'Actions',
      categoryZh: '操作',
      icon: Plus,
      shortcut: '⌘N',
      action: () => {
        resetSession();
        setActiveSection('home');
      },
    },
    {
      id: 'cmd-skills',
      label: 'Browse 19 Scientific Skills (SOPs)',
      labelZh: '浏览 19 项科研技能 (SOP)',
      category: 'Navigation',
      categoryZh: '导航',
      icon: Plus,
      action: () => setActiveSection('skills'),
    },
    {
      id: 'cmd-sessions',
      label: 'View Research Sessions & History',
      labelZh: '查看研究会话与历史',
      category: 'Navigation',
      categoryZh: '导航',
      icon: FolderKanban,
      action: () => setActiveSection('sessions'),
    },
    {
      id: 'cmd-evidence',
      label: 'Open Evidence & Citations Registry',
      labelZh: '打开证据与引用库',
      category: 'Navigation',
      categoryZh: '导航',
      icon: BookOpen,
      action: () => setActiveSection('evidence'),
    },
    {
      id: 'cmd-files',
      label: 'Browse Workspace Files & Artifacts',
      labelZh: '浏览工作区文件与产物',
      category: 'Navigation',
      categoryZh: '导航',
      icon: BarChart2,
      action: () => setActiveSection('files'),
    },
    {
      id: 'cmd-dark',
      label: 'Switch to Desktop Dark Theme',
      labelZh: '切换到深色主题',
      category: 'Appearance',
      categoryZh: '外观',
      icon: Moon,
      action: () => setDesktopTheme('dark'),
    },
    {
      id: 'cmd-light',
      label: 'Switch to Desktop Light Theme',
      labelZh: '切换到浅色主题',
      category: 'Appearance',
      categoryZh: '外观',
      icon: Sun,
      action: () => setDesktopTheme('light'),
    },
    {
      id: 'cmd-settings',
      label: 'Open Workstation Settings',
      labelZh: '打开工作站设置',
      category: 'System',
      categoryZh: '系统',
      icon: Settings,
      shortcut: '⌘,',
      action: () => setIsSettingsOpen(true),
    },
  ];

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.labelZh.includes(query) ||
    c.category.toLowerCase().includes(query.toLowerCase()) ||
    c.categoryZh.includes(query)
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        setIsCommandPaletteOpen(false);
      }
    }
  };

  if (!isCommandPaletteOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm p-4 select-none">
      <div
        className="w-full max-w-[560px] rounded-2xl bg-bg-surface border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="flex items-center px-4 py-3 border-b border-border gap-3">
          <Search size={18} className="text-accent" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Type a command or search research...', '输入指令或搜索研究内容…')}
            className="w-full bg-transparent border-none outline-none text-[14.5px] text-text-primary placeholder:text-text-muted"
            autoFocus
          />
          <button
            onClick={() => setIsCommandPaletteOpen(false)}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Command List */}
        <div className="max-h-[340px] overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">
              {t(`No commands found for "${query}"`, `未找到与 "${query}" 匹配的指令`)}
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    setIsCommandPaletteOpen(false);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={16} className={isSelected ? 'text-accent' : 'text-text-muted'} />
                    <span>{language === 'zh' ? cmd.labelZh : cmd.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-text-muted opacity-75">
                      {language === 'zh' ? cmd.categoryZh : cmd.category}
                    </span>
                    {cmd.shortcut && (
                      <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted border border-border-subtle">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Hint */}
        <div className="flex items-center justify-between px-4 py-2 bg-bg-elevated border-t border-border-subtle text-[11px] text-text-muted font-mono">
          <span>{t('Navigate: ↑↓', '移动: ↑↓')}</span>
          <span>{t('Select: Enter ↵', '选择: Enter ↵')}</span>
          <span>{t('Close: Esc', '关闭: Esc')}</span>
        </div>
      </div>
    </div>
  );
};
