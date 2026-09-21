import React from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { NavProvider } from './context/NavContext';
import { UserProvider } from './context/UserContext';
import { ProjectProvider } from './context/ProjectContext';
import { AgentProvider } from './context/AgentContext';
import { AppShell } from './components/shell/AppShell';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <UserProvider>
          <ProjectProvider>
            <NavProvider>
              <AgentProvider>
                <AppShell />
              </AgentProvider>
            </NavProvider>
          </ProjectProvider>
        </UserProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
};

export default App;
