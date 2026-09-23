import React, { useState } from 'react';
import type { AgentDefinition, ResearchTeamMember } from '@medscience/core';
import { Crown, Lock, MessageSquare, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { agentDescription, agentName, agentTitle, canLeadAgent } from './agentIdentity';
import { MemberAvatar } from './GroupAvatar';

interface MemberCardModalProps {
  agent?: AgentDefinition;
  agentId: string;
  /** Present when this member belongs to the open team. */
  member?: ResearchTeamMember;
  isLeader: boolean;
  /** A run is in flight, so leadership cannot change right now. */
  live: boolean;
  onClose: () => void;
  /** Opens (or starts) the 1:1 thread with this member. */
  onStartChat?: () => void;
  onSetLeader?: () => void;
  onSaveInstructions?: (instructions: string) => void;
  onRemove?: () => void;
}

/**
 * A member's contact card.
 *
 * The one prompt surface here is `memberInstructions`, which is appended to
 * the agent's own systemPrompt. The system prompt itself stays read-only:
 * the agent's tool categories and privacy class are enforced against it, so
 * a freely rewritable prompt would make 'sensitive-clinical' unenforceable.
 */
export const MemberCardModal: React.FC<MemberCardModalProps> = ({
  agent,
  agentId,
  member,
  isLeader,
  live,
  onClose,
  onStartChat,
  onSetLeader,
  onSaveInstructions,
  onRemove,
}) => {
  const { t, language } = useLanguage();
  const [instructions, setInstructions] = useState(member?.memberInstructions || '');
  const eligible = canLeadAgent(agent);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,14,0.66)] backdrop-blur-[3px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-[380px] max-w-[92vw] bg-bg-surface border border-border rounded-2xl overflow-hidden shadow-panel">
        <div className="flex justify-end p-2 pb-0">
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover flex items-center justify-center"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 pb-4 text-center">
          <div className="flex justify-center mb-2.5">
            <MemberAvatar agentId={agentId} agent={agent} size="lg" leader={isLeader} />
          </div>
          <div className="text-[15px] font-semibold text-text-primary">{agentName(agent, agentId, language)}</div>
          <div className="text-[12px] text-text-muted mt-0.5">{agentTitle(agent, language)}</div>
          <p className="text-[11.5px] text-text-secondary leading-relaxed mt-2 text-left">
            {agentDescription(agent, language)}
          </p>
          <div className="flex flex-wrap gap-1 justify-center mt-2.5">
            {member && (
              <span className="text-[10.5px] px-2 py-0.5 rounded-full border border-border-subtle bg-bg-elevated text-text-muted">
                {t('Role: ', '群内角色：')}
                {(language === 'zh' && member.roleZh) || member.role}
              </span>
            )}
            {agent?.privacyClass === 'sensitive-clinical' && (
              <span className="text-[10.5px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500">
                {t('Sensitive clinical data', '敏感临床数据')}
              </span>
            )}
            {member?.required && (
              <span className="text-[10.5px] px-2 py-0.5 rounded-full border border-border-subtle bg-bg-elevated text-text-muted">
                {t('Required member', '必需成员')}
              </span>
            )}
            {eligible && (
              <span className="text-[10.5px] px-2 py-0.5 rounded-full border border-border-subtle bg-bg-elevated text-text-muted">
                {t('Can lead', '可任队长')}
              </span>
            )}
          </div>
        </div>

        {member && onSaveInstructions && (
          <div className="px-5 pb-3">
            <label className="block text-[11px] text-text-muted mb-1.5">
              {t('Extra instructions in this team', '在本小队的补充指令')}
            </label>
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              rows={3}
              placeholder={t('e.g. always report effect sizes with 95% CI', '例如：所有效应量都要附 95% 置信区间')}
              className="w-full bg-bg-elevated border border-border-subtle rounded-lg px-2.5 py-2 text-[12px] leading-relaxed text-text-primary outline-none focus:border-accent resize-none placeholder:text-text-muted"
            />
            <div className="flex items-center gap-1.5 mt-1.5 text-[10.5px] text-text-muted">
              <Lock size={10} />
              {t(
                'Appended to the agent’s own prompt, which stays read-only.',
                '会追加在该成员固有提示词之后；固有提示词不可改写。'
              )}
            </div>
            {instructions !== (member.memberInstructions || '') && (
              <button
                onClick={() => onSaveInstructions(instructions)}
                className="w-full mt-2 py-1.5 rounded-lg bg-accent text-[#04131f] text-[12px] font-semibold hover:bg-accent-hover transition-colors"
              >
                {t('Save instructions', '保存补充指令')}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-px bg-border-subtle">
          {onStartChat && (
            <button
              onClick={onStartChat}
              className="bg-bg-surface py-2.5 text-[13px] text-text-primary hover:bg-bg-hover transition-colors flex items-center justify-center gap-1.5"
            >
              <MessageSquare size={13} className="text-accent" />
              {t('Talk to this member', '找 TA 单独聊')}
            </button>
          )}
          {member && onSetLeader && !isLeader && (
            <button
              onClick={onSetLeader}
              disabled={!eligible || live}
              className="bg-bg-surface py-2.5 text-[13px] text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-40 disabled:hover:bg-bg-surface flex items-center justify-center gap-1.5"
              title={
                live
                  ? t('Cannot transfer leadership while a run is in flight.', '课题运行中无法转让队长。')
                  : !eligible
                    ? t('This member cannot lead a team.', '该成员不能担任队长。')
                    : undefined
              }
            >
              <Crown size={13} className="text-amber-500" />
              {t('Make team leader', '设为队长')}
            </button>
          )}
          {member && onRemove && !isLeader && (
            <button
              onClick={onRemove}
              className="bg-bg-surface py-2.5 text-[13px] text-red-500 hover:bg-red-500/10 transition-colors flex items-center justify-center gap-1.5"
            >
              <Trash2 size={13} />
              {t('Remove from team', '移出小队')}
            </button>
          )}
          {isLeader && (
            <div className="bg-bg-surface py-2.5 text-[11.5px] text-text-muted text-center">
              {t(
                'The leader can only be replaced by promoting another member.',
                '队长只能通过将其他成员「设为队长」来更换。'
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
