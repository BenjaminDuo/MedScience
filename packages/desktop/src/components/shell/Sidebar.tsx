import React from 'react';
import {
  Sparkles,
  FolderKanban,
  Users,
  FlaskConical,
  ShieldCheck,
  Files,
  Plus,
  MessageCirclePlus,
  PanelLeftClose,
  PanelLeft,
  Settings,
  ChevronRight,
  Cpu,
  Shield,
} from 'lucide-react';
import { MedScienceLogo } from '../common/MedScienceLogo';
import { useNav } from '../../context/NavContext';
import { useAgent } from '../../context/AgentContext';
import { useUser } from '../../context/UserContext';
import { NavSection } from '../../types/navigation';
import { useLanguage } from '../../context/LanguageContext';

interface SidebarProps {
  className?: string;
}

interface NavItemConfig {
  id: NavSection;
  labelEn: string;
  labelZh: string;
  icon: React.ElementType;
}

const navItems: NavItemConfig[] = [
  { id: 'home', labelEn: 'Research Agent', labelZh: '研究智能体', icon: Sparkles },
  { id: 'sessions', labelEn: 'Research Sessions', labelZh: '研究会话', icon: FolderKanban },
  { id: 'teams', labelEn: 'Research Teams', labelZh: '科研小队', icon: Users },
  { id: 'skills', labelEn: 'Scientific Skills (19)', labelZh: '科研技能 (19)', icon: FlaskConical },
  { id: 'evidence', labelEn: 'Evidence Registry', labelZh: '证据库', icon: ShieldCheck },
  { id: 'files', labelEn: 'Workspace Files', labelZh: '工作区文件', icon: Files },
];

// "配置" group -- Model Configuration (merged Model API + Execution
// Runtime) and Guardrail Hooks used to be Settings-modal tabs; moved into
// the sidebar as their own navigable pages, under a light divider.
const configItems: NavItemConfig[] = [
  { id: 'model-config', labelEn: 'Model Configuration', labelZh: '模型配置', icon: Cpu },
  { id: 'guardrails', labelEn: 'Guardrail Hooks', labelZh: '防护钩子', icon: Shield },
];

export const Sidebar: React.FC<SidebarProps> = ({ className = '' }) => {
  const {
    activeSection,
    setActiveSection,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    setIsSettingsOpen,
  } = useNav();

  const { resetSession, sessions } = useAgent();
  const { user } = useUser();
  const { t, language } = useLanguage();

  const handleNewChat = () => {
    resetSession('chat');
    setActiveSection('home');
  };

  const handleNewResearch = () => {
    resetSession('research');
    setActiveSection('home');
  };

  const handleNavClick = (sectionId: NavSection) => {
    setActiveSection(sectionId);
  };

  return (
    <aside
      className={`relative flex flex-col h-full bg-bg-surface border-r border-border transition-all duration-200 select-none z-20 ${
        isSidebarCollapsed ? 'w-[68px]' : 'w-[240px]'
      } ${className}`}
    >
      {/* Top Header: Logo & Brand */}
      <div className="flex items-center justify-between px-4 h-[56px] border-b border-border-subtle">
        <div
          className="flex items-center gap-2.5 cursor-pointer overflow-hidden"
          onClick={() => {
            setActiveSection('home');
          }}
        >
          <MedScienceLogo size={28} />
          {!isSidebarCollapsed && (
            <span className="font-semibold text-[17px] tracking-tight text-text-primary whitespace-nowrap">
              MedScience
            </span>
          )}
        </div>

        <button
          onClick={() => setIsSidebarCollapsed((prev) => !prev)}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          title={isSidebarCollapsed ? t('Expand sidebar', '展开侧边栏') : t('Collapse sidebar', '收起侧边栏')}
        >
          {isSidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* New Chat / New Research -- two distinct session types, fixed at
          creation (see RuntimeSession.sessionType): a plain chat never
          forces tool calls or the evidence-verification pipeline, a
          research session always does. Not a per-message guess. */}
      <div className={`p-3 flex gap-2 ${isSidebarCollapsed ? 'flex-col' : ''}`}>
        <button
          onClick={handleNewChat}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-border hover:border-accent/40 bg-bg-elevated hover:bg-bg-hover text-text-primary transition-all group ${
            isSidebarCollapsed ? 'px-0' : ''
          }`}
          title={t('New Chat', '新建对话')}
        >
          <MessageCirclePlus size={15} className="text-accent group-hover:scale-110 transition-transform shrink-0" />
          {!isSidebarCollapsed && (
            <span className="text-[13px] font-medium tracking-tight">{t('New Chat', '新建对话')}</span>
          )}
        </button>
        <button
          onClick={handleNewResearch}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-border hover:border-accent/40 bg-bg-elevated hover:bg-bg-hover text-text-primary transition-all group ${
            isSidebarCollapsed ? 'px-0' : ''
          }`}
          title={t('New Research (⌘N)', '新建研究 (⌘N)')}
        >
          <Plus size={15} className="text-accent group-hover:scale-110 transition-transform shrink-0" />
          {!isSidebarCollapsed && (
            <span className="text-[13px] font-medium tracking-tight">{t('New Research', '新建研究')}</span>
          )}
        </button>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-2.5 py-1 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const badgeCount = item.id === 'sessions' && sessions.length > 0 ? sessions.length : null;
          const label = language === 'zh' ? item.labelZh : item.labelEn;

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors ${
                isActive
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
              title={isSidebarCollapsed ? label : undefined}
            >
              <div className="flex items-center gap-3 truncate">
                <Icon
                  size={18}
                  className={isActive ? 'text-accent' : 'text-text-muted group-hover:text-text-primary'}
                />
                {!isSidebarCollapsed && (
                  <span className="truncate">{label}</span>
                )}
              </div>
              {!isSidebarCollapsed && badgeCount !== null && (
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-bg-elevated text-text-muted border border-border-subtle">
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Configuration Group: Model Configuration + Guardrail Hooks (merged
          out of the old Settings modal tabs), under a light divider
          labeled "配置" (left-aligned, not centered). Language now lives
          in the Settings modal's Appearance tab instead of here. */}
      <div className="px-2.5 pb-1">
        <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
          {!isSidebarCollapsed && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap">
              {t('Configuration', '配置')}
            </span>
          )}
          <div className="flex-1 border-t border-border-subtle/60" />
        </div>

        <div className="space-y-1">
          {configItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            const label = language === 'zh' ? item.labelZh : item.labelEn;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent font-semibold'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                title={isSidebarCollapsed ? label : undefined}
              >
                <Icon size={18} className={isActive ? 'text-accent' : 'text-text-muted'} />
                {!isSidebarCollapsed && <span className="truncate">{label}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom User Profile & Settings Section */}
      <div className="p-3 border-t border-border-subtle">
        <button
          onClick={() => setIsSettingsOpen(true)}
          className={`w-full flex items-center justify-between p-2 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary cursor-pointer transition-colors ${
            isSidebarCollapsed ? 'justify-center px-0' : ''
          }`}
          title={t('Account & Workstation Settings', '账户与工作站设置')}
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="relative flex-shrink-0 w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent text-xs font-bold shadow-xs">
              {user.avatar || 'RE'}
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col text-left truncate">
                <span className="text-[13px] font-semibold text-text-primary truncate">{user.name}</span>
                <span className="text-[11px] text-text-muted flex items-center gap-1.5 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block flex-shrink-0" />
                  <span className="truncate">{user.plan}</span>
                </span>
              </div>
            )}
          </div>
          {!isSidebarCollapsed && <Settings size={15} className="text-text-muted hover:text-text-primary flex-shrink-0" />}
        </button>
      </div>
    </aside>
  );
};
