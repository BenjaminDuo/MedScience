import React, { useEffect, useState } from 'react';
import type { AgentDefinition } from '@medscience/core';
import { Check, Lock, Users } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { AgentSession } from '../../types/agent';
import { agentDescription, agentName, agentTitle } from './agentIdentity';
import { MemberAvatar } from './GroupAvatar';

interface MemberInfoPanelProps {
  agentId: string;
  agent?: AgentDefinition;
  /** Only used for the "N conversations" line; the list itself is in the left column. */
  sessions: AgentSession[];
  /** Teams in this workspace that include this member. */
  teamNames: string[];
  savingInstructions: boolean;
  onSaveInstructions: (instructions: string) => void;
}

/**
 * The member's card: who they are, what they may use, and the standing
 * instructions you give them.
 *
 * The list of conversations used to live here too, which made this panel do
 * two jobs in 318px and left each conversation as a bare title. Conversations
 * are now browsed where you select things -- the left column, one level
 * under the member -- so this panel is just the member again.
 */
export const MemberInfoPanel: React.FC<MemberInfoPanelProps> = ({
  agentId,
  agent,
  sessions,
  teamNames,
  savingInstructions,
  onSaveInstructions,
}) => {
  const { t, language } = useLanguage();
  const [instructions, setInstructions] = useState(agent?.userInstructions || '');

  useEffect(() => {
    setInstructions(agent?.userInstructions || '');
  }, [agent?.id, agent?.userInstructions]);

  const dirty = instructions !== (agent?.userInstructions || '');

  return (
    <div className="w-[318px] shrink-0 bg-bg-surface border-l border-border h-full overflow-y-auto">
      <div className="p-4 text-center border-b border-border-subtle">
        <div className="flex justify-center mb-2.5">
          <MemberAvatar agentId={agentId} agent={agent} size="lg" />
        </div>
        <div className="text-[15px] font-semibold text-text-primary">{agentName(agent, agentId, language)}</div>
        <div className="text-[12px] text-text-muted mt-0.5">{agentTitle(agent, language)}</div>
        <p className="text-[11.5px] text-text-secondary leading-relaxed mt-2 text-left">
          {agentDescription(agent, language)}
        </p>
        <div className="flex flex-wrap gap-1 justify-center mt-2.5">
          {(agent?.allowedToolCategories || []).map((category) => (
            <span
              key={category}
              className="text-[10px] px-2 py-0.5 rounded-full border border-border-subtle bg-bg-elevated text-text-muted"
            >
              {category}
            </span>
          ))}
          {agent?.privacyClass === 'sensitive-clinical' && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500">
              {t('Sensitive clinical data', '敏感临床数据')}
            </span>
          )}
        </div>
      </div>

      <div className="p-3.5 border-b border-border-subtle">
        <label className="block text-[11px] font-semibold tracking-wide text-text-muted mb-1.5">
          {t('Standing instructions', '常驻指令')}
        </label>
        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={3}
          placeholder={t('e.g. always report effect sizes with 95% CI', '例如：所有效应量都要附 95% 置信区间')}
          className="w-full bg-bg-elevated border border-border-subtle rounded-lg px-2.5 py-2 text-[12px] leading-relaxed text-text-primary outline-none focus:border-accent resize-none placeholder:text-text-muted"
        />
        <div className="flex items-start gap-1.5 mt-1.5 text-[10.5px] text-text-muted leading-relaxed">
          <Lock size={10} className="shrink-0 mt-0.5" />
          {t(
            'Applies to every conversation with this member and to every team it joins. The member’s own prompt stays read-only.',
            '对与该队员的所有对话、以及它加入的所有小队都生效。队员固有提示词不可改写。'
          )}
        </div>
        {dirty && (
          <button
            onClick={() => onSaveInstructions(instructions)}
            disabled={savingInstructions}
            className="w-full mt-2 py-1.5 rounded-lg bg-accent text-[#04131f] text-[12px] font-semibold hover:bg-accent-hover transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            <Check size={12} />
            {t('Save', '保存')}
          </button>
        )}
      </div>

      <div className="px-3.5 py-2.5 border-b border-border-subtle text-[11.5px] text-text-secondary">
        {sessions.length > 0
          ? t(`${sessions.length} conversations in this workspace`, `本工作区内有 ${sessions.length} 个会话`)
          : t('No conversations yet in this workspace.', '本工作区内还没有会话。')}
        <div className="text-[10.5px] text-text-muted mt-0.5">
          {t('Browse them under this member in the left column.', '在左栏该队员下展开即可浏览。')}
        </div>
      </div>

      {teamNames.length > 0 && (
        <div className="p-3.5 border-b border-border-subtle">
          <h4 className="text-[11px] font-semibold tracking-wide text-text-muted mb-2 flex items-center gap-1.5">
            <Users size={11} />
            {t('In teams', '所在小队')}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {teamNames.map((name) => (
              <span
                key={name}
                className="text-[11px] px-2 py-0.5 rounded-full border border-border-subtle bg-bg-elevated text-text-secondary"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
