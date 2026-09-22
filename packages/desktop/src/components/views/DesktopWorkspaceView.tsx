import React, { useRef, useEffect } from 'react';
import { useAgent } from '../../context/AgentContext';
import { AgentMessage } from '../workspace/AgentMessage';
import { WorkspaceComposer } from '../workspace/WorkspaceComposer';
import { RuntimeApprovalCard } from '../workspace/RuntimeApprovalCard';
import { Loader2, Square } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export const DesktopWorkspaceView: React.FC = () => {
  const { currentSession, status, pendingApprovals, cancelActiveRun } = useAgent();
  const { t } = useLanguage();
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(currentSession.messages.length);

  useEffect(() => {
    if (currentSession.messages.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLengthRef.current = currentSession.messages.length;
  }, [currentSession.messages.length]);

  // Kept in sync with AgentInput.tsx/WorkspaceComposer.tsx's isBusy.
  const isWorking =
    status === 'thinking' || status === 'planning' || status === 'tool_calling' || status === 'executing' || status === 'generating';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg-primary">
      {/* Scrollable Conversation Stream */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {currentSession.messages.map((message) => (
          <AgentMessage key={message.id} message={message} />
        ))}

        {isWorking && (
          <div className="max-w-[840px] mx-auto flex items-center gap-3 p-3.5 rounded-xl bg-bg-surface border border-border text-accent shadow-sm">
            <Loader2 size={16} className="animate-spin shrink-0" />
            <span className="text-xs font-mono flex-1 animate-pulse">
              {status === 'thinking' && t('Agent is reasoning and planning scientific approach...', '智能体正在推理并制定研究方案…')}
              {status === 'planning' && t('Drafting the research plan...', '正在制定研究计划…')}
              {status === 'tool_calling' && t('Querying scientific tools and running pipeline...', '正在调用科研工具并运行流水线…')}
              {status === 'executing' && t('Executing in the sandbox...', '正在沙盒中执行…')}
              {status === 'generating' && t('Synthesizing evidence and generating artifacts...', '正在整合证据并生成产物…')}
            </span>
            <button
              onClick={() => cancelActiveRun()}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 text-[11px] font-medium transition-all"
              title={t('Stop this run', '停止本次运行')}
            >
              <Square size={11} fill="currentColor" />
              <span>{t('Stop', '停止')}</span>
            </button>
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
