import React, { useRef, useEffect } from 'react';
import { useAgent } from '../../context/AgentContext';
import { AgentMessage } from '../workspace/AgentMessage';
import { WorkspaceComposer } from '../workspace/WorkspaceComposer';
import { RuntimeApprovalCard } from '../workspace/RuntimeApprovalCard';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export const DesktopWorkspaceView: React.FC = () => {
  const { currentSession, status, pendingApprovals } = useAgent();
  const { t } = useLanguage();
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(currentSession.messages.length);

  useEffect(() => {
    if (currentSession.messages.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLengthRef.current = currentSession.messages.length;
  }, [currentSession.messages.length]);

  const isWorking = status === 'thinking' || status === 'tool_calling' || status === 'generating';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg-primary">
      {/* Scrollable Conversation Stream */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {currentSession.messages.map((message) => (
          <AgentMessage key={message.id} message={message} />
        ))}

        {isWorking && (
          <div className="max-w-[840px] mx-auto flex items-center gap-3 p-3.5 rounded-xl bg-bg-surface border border-border text-accent shadow-sm animate-pulse">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-xs font-mono">
              {status === 'thinking' && t('Agent is reasoning and planning scientific approach...', '智能体正在推理并制定研究方案…')}
              {status === 'tool_calling' && t('Querying scientific tools and running pipeline...', '正在调用科研工具并运行流水线…')}
              {status === 'generating' && t('Synthesizing evidence and generating artifacts...', '正在整合证据并生成产物…')}
            </span>
          </div>
        )}

        {pendingApprovals.length > 0 && (
          <div className="pt-1">
            <RuntimeApprovalCard />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Persistent Bottom Composer */}
      <WorkspaceComposer />
    </div>
  );
};
