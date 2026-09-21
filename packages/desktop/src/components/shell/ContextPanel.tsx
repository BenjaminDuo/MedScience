import React from 'react';
import {
  PanelRightClose,
  PanelRight,
  CheckCircle2,
  Clock,
  Circle,
  XCircle,
  Activity,
  FileImage,
  Table as TableIcon,
  Atom,
  FileText,
  Code2,
  Boxes,
} from 'lucide-react';
import { useNav } from '../../context/NavContext';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';
import type { Artifact, ToolExecution } from '../../types/agent';

interface ContextPanelProps {
  className?: string;
}

const artifactIconMap: Record<Artifact['type'], React.ElementType> = {
  figure: FileImage,
  dataset: TableIcon,
  table: TableIcon,
  protein: Atom,
  molecule: Atom,
  code: Code2,
  report: FileText,
};

/**
 * "精简可观测" panel: what is actually happening right now (real plan/task
 * events + live tool activity from the backend) and what it has produced
 * (real artifacts from this session) -- no mock tool shortcuts, no canned
 * tip prompts. Everything rendered here comes from real runtime events, not
 * placeholder data.
 */
export const ContextPanel: React.FC<ContextPanelProps> = ({ className = '' }) => {
  const { isContextPanelOpen, setIsContextPanelOpen } = useNav();
  const { currentSession, planTasks } = useAgent();
  const { t } = useLanguage();

  if (!isContextPanelOpen) {
    return (
      <div className="flex flex-col items-center py-3 border-l border-border bg-bg-surface w-[44px] transition-all">
        <button
          onClick={() => setIsContextPanelOpen(true)}
          className="p-2 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          title={t('Open Context Panel', '展开上下文面板')}
        >
          <PanelRight size={16} />
        </button>
      </div>
    );
  }

  const lastAgentMessage = [...currentSession.messages].reverse().find((m) => m.role === 'agent');
  const liveActivity: ToolExecution[] = lastAgentMessage?.toolExecutions || [];

  const allArtifacts: Artifact[] = [];
  const seenArtifactIds = new Set<string>();
  for (const m of currentSession.messages) {
    for (const art of m.artifacts || []) {
      if (!seenArtifactIds.has(art.id)) {
        seenArtifactIds.add(art.id);
        allArtifacts.push(art);
      }
    }
  }

  return (
    <aside
      className={`flex flex-col h-full w-[280px] lg:w-[300px] bg-bg-surface border-l border-border select-none overflow-y-auto transition-all ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-1.5">
          <Activity size={16} className="text-accent" />
          <h3 className="text-[13.5px] font-semibold text-text-primary">{t('Current Flow', '当前流程')}</h3>
        </div>
        <button
          onClick={() => setIsContextPanelOpen(false)}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          title={t('Collapse context panel', '收起上下文面板')}
        >
          <PanelRightClose size={15} />
        </button>
      </div>

      {/* Section 1: Real plan milestones (from plan.created / plan.task.updated) */}
      <div className="px-4 pb-3">
        {planTasks.length === 0 ? (
          <div className="p-3.5 rounded-xl border border-dashed border-border text-center bg-bg-elevated/20">
            <p className="text-xs font-medium text-text-secondary">{t('No active run', '当前没有在跑的流程')}</p>
            <p className="text-[11px] text-text-muted mt-1 leading-normal">
              {t('Submit a question to see live progress here.', '提交问题后，这里会显示实时进展。')}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {planTasks.map((task) => {
              const isDone = task.status === 'completed';
              const isProgress = task.status === 'in_progress';
              const isFailed = task.status === 'failed';
              return (
                <div
                  key={task.id}
                  className={`p-2 rounded-md border text-[12px] transition-all ${
                    isDone
                      ? 'bg-emerald-500/5 border-emerald-500/20 text-text-primary'
                      : isFailed
                      ? 'bg-red-500/5 border-red-500/20 text-text-primary'
                      : isProgress
                      ? 'bg-accent/10 border-accent/30 text-accent font-medium shadow-sm'
                      : 'bg-bg-card/40 border-border-subtle text-text-muted'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex-shrink-0">
                      {isDone ? (
                        <CheckCircle2 size={14} className="text-emerald-500" />
                      ) : isFailed ? (
                        <XCircle size={14} className="text-red-500" />
                      ) : isProgress ? (
                        <Clock size={14} className="text-accent animate-spin" />
                      ) : (
                        <Circle size={14} className="text-text-muted" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="leading-snug">{task.title}</p>
                      {task.resultNote && <p className="text-[10.5px] text-text-muted mt-0.5 leading-snug">{task.resultNote}</p>}
                      {task.evidenceIds && task.evidenceIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {task.evidenceIds.map((ev) => (
                            <span
                              key={ev}
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/15 text-accent border border-accent/25"
                            >
                              {ev}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Live tool activity for the current turn */}
      {liveActivity.length > 0 && (
        <div className="px-4 pb-3 border-t border-border-subtle pt-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-2">
            {t('Live Activity', '实时活动')}
          </h3>
          <div className="space-y-1">
            {liveActivity.map((tool) => (
              <div key={tool.id} className="flex items-center gap-2 text-[11.5px] py-0.5">
                {tool.status === 'completed' ? (
                  <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
                ) : tool.status === 'failed' ? (
                  <XCircle size={12} className="text-red-500 flex-shrink-0" />
                ) : (
                  <Clock size={12} className="text-accent animate-spin flex-shrink-0" />
                )}
                <span className="truncate text-text-secondary" title={tool.description}>
                  {tool.toolName}
                </span>
                {tool.duration && <span className="text-text-muted font-mono text-[10px] flex-shrink-0">{tool.duration}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Task artifacts produced so far in this session */}
      <div className="px-4 pb-4 border-t border-border-subtle pt-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Boxes size={14} className="text-accent" />
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-text-muted">
            {t('Task Artifacts', '任务产物')} {allArtifacts.length > 0 && `(${allArtifacts.length})`}
          </h3>
        </div>
        {allArtifacts.length === 0 ? (
          <p className="text-[11px] text-text-muted leading-normal">{t('None generated yet.', '尚未生成任何产物。')}</p>
        ) : (
          <div className="space-y-1.5">
            {allArtifacts.map((art) => {
              const Icon = artifactIconMap[art.type] || FileText;
              return (
                <div key={art.id} className="flex items-start gap-2 p-2 rounded-lg border border-border-subtle bg-bg-elevated/30">
                  <div className="mt-0.5 p-1.5 rounded-md bg-accent/10 text-accent flex-shrink-0">
                    <Icon size={13} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-text-primary truncate">{art.title}</p>
                    <p className="text-[10.5px] text-text-muted truncate">{art.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
