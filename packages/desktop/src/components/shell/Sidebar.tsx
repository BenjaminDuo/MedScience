import React from 'react';
import {
  FlaskConical,
  Plus,
  PanelLeftClose,
  PanelLeft,
  Settings,
  ChevronRight,
  Cpu,
  Shield,
  Users,
} from 'lucide-react';
import { MedScienceLogo } from '../common/MedScienceLogo';
import { WorkspaceTree } from './WorkspaceTree';
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

// Top-level nav items are now just the pages that AREN'T scoped to a single
// workspace. Conversations/Evidence Registry/Output Files/Research Team
// used to live here as flat, unscoped lists -- they now live inside
// WorkspaceTree, one set per workspace (see its sub-item entries), so a
// user opens a workspace to see its own conversations/evidence/output
// files/team runs instead of everything ever created flattened together.
const navItems: NavItemConfig[] = [];

// "配置" group -- Model Configuration, Guardrail Hooks, and Scientific
// Skills (moved here from the old flat nav list -- it's account-wide
// tooling, not scoped to any one workspace) live here as their own
// navigable pages, under a light divider.
const configItems: NavItemConfig[] = [
  { id: 'model-config', labelEn: 'Runtime (Model Configuration)', labelZh: '运行时（模型配置）', icon: Cpu },
  { id: 'skills', labelEn: 'Scientific Skills', labelZh: '科研技能', icon: FlaskConical },
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

  const handleNewConversation = () => {
    // "New conversation" is now "start a new topic with the general
    // expert": conversations belong to a member's thread on the 对话 page,
    // so this opens a fresh topic there rather than a standalone session.
    resetSession('research');
    setActiveSection('teams');
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

      {/* New Conversation -- sits ABOVE the workspace tree on purpose: it
          always starts unbound (未分类), never bound to whichever workspace
          happens to be expanded below, so opening a workspace to browse it
          never silently changes where the next new conversation goes. For a
          research session, WorkspacePicker in the composer is the one place
          to explicitly assign it to a workspace instead. */}
      <div className={`px-3 pt-5 pb-3 flex gap-2 ${isSidebarCollapsed ? 'flex-col' : ''}`}>
        <button
          onClick={handleNewConversation}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-border hover:border-accent/40 bg-bg-elevated hover:bg-bg-hover text-text-primary transition-all group ${
            isSidebarCollapsed ? 'px-0' : ''
          }`}
          title={t('New Conversation (⌘N)', '新建对话 (⌘N)')}
        >
          <Plus size={15} className="text-accent group-hover:scale-110 transition-transform shrink-0" />
          {!isSidebarCollapsed && (
            <span className="text-[13px] font-medium tracking-tight">{t('New Conversation', '新建对话')}</span>
          )}
        </button>
      </div>

      {/* Workspace tree -- accordion of workspaces, each expanding to its
          own 对话/科研小队/证据库/产出文件. Mode (chat vs. research) is
          chosen per-session in the composer (SessionModeToggle), not here.
          It is the flex-1/min-h-0 element in this column (see its own
          internal layout), so IT is what absorbs/fills leftover vertical
          space -- not the (currently empty) nav below -- which is what
          keeps the Configuration group and account footer always fully
          visible and pinned to the bottom, on any window height. */}
      <WorkspaceTree collapsed={isSidebarCollapsed} />

      {/* Navigation List -- currently empty (see navItems above); kept as
          a real, zero-item section rather than deleted outright, so a
          future account-wide, non-workspace-scoped page has somewhere to
          land. Deliberately NOT flex-1 (WorkspaceTree above is now the
          sidebar's one growing/scrolling spacer) -- two flex-1 siblings
          would each fight for half the leftover space instead of giving
          it all to the workspace list. */}
      <nav className="shrink-0 px-2.5 py-1 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const badgeCount = item.id === 'teams' && sessions.length > 0 ? sessions.length : null;
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
