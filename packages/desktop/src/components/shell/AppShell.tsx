import React from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ContextPanel } from './ContextPanel';
import { DesktopHomeView } from '../views/DesktopHomeView';
import { DesktopWorkspaceView } from '../views/DesktopWorkspaceView';
import { ConversationsView } from '../views/ConversationsView';
import { SkillsCatalogView } from '../views/SkillsCatalogView';
import { EvidenceRegistryView } from '../views/EvidenceRegistryView';
import { OutputFilesView } from '../views/OutputFilesView';
import { ModelConfigView } from '../views/ModelConfigView';
import { GuardrailHooksView } from '../views/GuardrailHooksView';
import { CommandPalette } from '../common/CommandPalette';
import { SettingsModal } from '../common/SettingsModal';
import { useNav } from '../../context/NavContext';
import { useAgent } from '../../context/AgentContext';

export const AppShell: React.FC = () => {
  const { activeSection } = useNav();
  const { activeView } = useAgent();

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-bg-primary text-text-primary">
      {/* Universal Top Bar */}
      <TopBar />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Center Workspace */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-bg-primary">
          {activeSection === 'home' && (
            activeView === 'home' ? <DesktopHomeView /> : <DesktopWorkspaceView />
          )}
          {activeSection === 'teams' && <ConversationsView />}
          {activeSection === 'skills' && <SkillsCatalogView />}
          {activeSection === 'evidence' && <EvidenceRegistryView />}
          {activeSection === 'files' && <OutputFilesView />}
          {activeSection === 'model-config' && <ModelConfigView />}
          {activeSection === 'guardrails' && <GuardrailHooksView />}
        </main>

        {/* Right Context Panel (Only in active Workspace conversation, never on blank Home) */}
        {activeSection === 'home' && activeView === 'workspace' && <ContextPanel />}
      </div>

      {/* Global Modals & Overlays */}
      <CommandPalette />
      <SettingsModal />
    </div>
  );
};
