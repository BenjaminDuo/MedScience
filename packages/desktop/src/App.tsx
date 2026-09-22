import React from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { NavProvider } from './context/NavContext';
import { UserProvider } from './context/UserContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { AgentProvider } from './context/AgentContext';
import { AppShell } from './components/shell/AppShell';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <UserProvider>
          <WorkspaceProvider>
            <NavProvider>
              <AgentProvider>
                <AppShell />
              </AgentProvider>
            </NavProvider>
          </WorkspaceProvider>
        </UserProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
};

export default App;
