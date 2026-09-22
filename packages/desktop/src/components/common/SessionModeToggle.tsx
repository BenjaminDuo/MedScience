import React from 'react';
import { MessageCircle, FlaskConical } from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';

/**
 * The chat/research choice for a brand-new, not-yet-started conversation --
 * lives in the composer rather than as two separate sidebar buttons, and
 * locks in (this renders nothing) the moment the conversation has any
 * turns. See RuntimeSession.sessionType: it's fixed at creation on
 * purpose, this is just where that one-time choice is made.
 */
export const SessionModeToggle: React.FC = () => {
  const { currentSession, setSessionType } = useAgent();
  const { t } = useLanguage();

  if (currentSession.messages.length > 0) return null;

  const options: { id: 'chat' | 'research'; label: string; Icon: React.ElementType }[] = [
    { id: 'chat', label: t('Chat', '对话'), Icon: MessageCircle },
    { id: 'research', label: t('Research', '研究'), Icon: FlaskConical },
  ];

  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-bg-elevated border border-border-subtle">
      {options.map(({ id, label, Icon }) => {
        const isActive = currentSession.sessionType === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setSessionType(id)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              isActive ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'
            }`}
            title={
              id === 'chat'
                ? t('Plain conversation -- no forced tool use or evidence gate', '普通对话 -- 不强制调用工具或证据核验')
                : t('Full evidence-gated research pipeline', '完整的证据核验科研流程')
            }
          >
            <Icon size={12} />
            {label}
          </button>
        );
      })}
    </div>
  );
};
