import React from 'react';
import { User, Database, BookOpen, Layers } from 'lucide-react';
import { AgentMessage as AgentMessageType } from '../../types/agent';
import { ToolExecutionCard } from './ToolExecutionCard';
import { ArtifactCard } from './ArtifactCard';
import { CitationCard } from './CitationCard';
import { MedScienceLogo } from '../common/MedScienceLogo';
import { useLanguage } from '../../context/LanguageContext';

interface AgentMessageProps {
  message: AgentMessageType;
}

export const AgentMessage: React.FC<AgentMessageProps> = ({ message }) => {
  const { t } = useLanguage();
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end my-6 max-w-[840px] mx-auto">
        <div className="flex items-start gap-2.5 max-w-[75%] flex-row-reverse">
          <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 text-accent flex items-center justify-center flex-shrink-0 mt-0.5">
            <User size={14} />
          </div>
          <div className="bg-accent text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm min-w-0">
            <div className="text-[10.5px] text-white/70 mb-1 select-none text-right">{message.timestamp}</div>
            <div className="text-[14.5px] leading-relaxed whitespace-pre-wrap break-words">{message.content}</div>
          </div>
        </div>
      </div>
    );
  }

  // Agent Response
  return (
    <div className="flex items-start gap-3.5 my-6 max-w-[840px] mx-auto justify-start">
      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-accent/20 to-accent-secondary/20 border border-accent/40 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
        <MedScienceLogo size={20} />
      </div>

      <div className="flex-1 min-w-0">
        {/* Agent Name & Header */}
        <div className="flex items-center justify-between text-xs text-text-muted mb-2 select-none">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-primary">{t('MedScience Agent', 'MedScience 智能体')}</span>
            <span className="font-mono text-[10.5px] px-1.5 py-0.2 rounded bg-accent-soft text-accent border border-accent/20">
              {t('AI Research Partner', 'AI 科研伙伴')}
            </span>
          </div>
          <span>{message.timestamp}</span>
        </div>

        {/* Executed Tools Section */}
        {message.toolExecutions && message.toolExecutions.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5 select-none">
              <Layers size={13} className="text-accent" />
              <span>{t('Tool Executions', '工具执行')} ({message.toolExecutions.length})</span>
            </div>
            <div className="space-y-2">
              {message.toolExecutions.map((tool) => (
                <ToolExecutionCard key={tool.id} tool={tool} />
              ))}
            </div>
          </div>
        )}

        {/* Main Synthesized Text Content */}
        <div className="p-4 rounded-2xl bg-bg-surface border border-border text-[14px] text-text-primary leading-relaxed space-y-3 shadow-sm">
          {message.content.split('\n\n').map((paragraph, idx) => {
            if (paragraph.startsWith('### ')) {
              return (
                <h3 key={idx} className="text-[16px] font-bold text-text-primary pt-1">
                  {paragraph.replace('### ', '')}
                </h3>
              );
            }
            if (paragraph.startsWith('1. ') || paragraph.startsWith('2. ') || paragraph.startsWith('3. ')) {
              return (
                <div key={idx} className="pl-2 border-l-2 border-accent/40 py-0.5 my-2">
                  <p className="text-text-secondary">{paragraph}</p>
                </div>
              );
            }
            return (
              <p key={idx} className="text-text-secondary">
                {paragraph}
              </p>
            );
          })}
        </div>

        {/* Generated Scientific Artifacts */}
        {message.artifacts && message.artifacts.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5 select-none">
              <Database size={13} className="text-accent" />
              <span>{t('Scientific Artifacts', '科研产物')} ({message.artifacts.length})</span>
            </div>
            {message.artifacts.map((art) => (
              <ArtifactCard key={art.id} artifact={art} />
            ))}
          </div>
        )}

        {/* Scientific Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5 select-none">
              <BookOpen size={13} className="text-accent" />
              <span>{t('Evidence & Citations', '证据与引用')} ({message.citations.length})</span>
            </div>
            <div className="space-y-1">
              {message.citations.map((cit) => (
                <CitationCard key={cit.id} citation={cit} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
