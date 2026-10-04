import React, { useState } from 'react';
import { Markdown } from '../common/Markdown';
import type { AgentDefinition, ScientificHandoff, TeamRun, TeamTask } from '@medscience/core';
import { ChevronDown, ChevronRight, FileText, ListTree, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { MemberAvatar } from './GroupAvatar';

const TASK_STATUS_STYLE: Record<string, { color: string; en: string; zh: string }> = {
  proposed: { color: 'text-text-muted', en: 'proposed', zh: '待排期' },
  blocked: { color: 'text-text-muted', en: 'blocked', zh: '被阻塞' },
  ready: { color: 'text-text-muted', en: 'ready', zh: '就绪' },
  running: { color: 'text-accent', en: 'running', zh: '进行中' },
  'awaiting-review': { color: 'text-amber-500', en: 'in review', zh: '待评审' },
  'revision-requested': { color: 'text-amber-500', en: 'revision', zh: '待修订' },
  completed: { color: 'text-emerald-500', en: 'done', zh: '已完成' },
  failed: { color: 'text-red-500', en: 'failed', zh: '失败' },
  cancelled: { color: 'text-text-muted', en: 'cancelled', zh: '已取消' },
};

const cardShell = 'rounded-[3px_12px_12px_12px] border border-border bg-bg-surface overflow-hidden min-w-[320px] max-w-[560px]';

export const PlanCard: React.FC<{
  tasks: TeamTask[];
  approvable: boolean;
  agentById: Map<string, AgentDefinition>;
  busy?: boolean;
  onApprove: () => void;
}> = ({ tasks, approvable, agentById, busy, onApprove }) => {
  const { t, language } = useLanguage();
  const dependencies = tasks.reduce((sum, task) => sum + task.dependencyTaskIds.length, 0);

  return (
    <div className={cardShell}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle bg-bg-elevated text-[12px] font-semibold text-text-primary">
        <ListTree size={13} className="text-accent" />
        <span>
          {t(
            `Task graph · ${tasks.length} tasks · ${dependencies} dependencies`,
            `任务图 · ${tasks.length} 个任务 · ${dependencies} 条依赖`
          )}
        </span>
      </div>
      <div className="px-3 py-1.5">
        {tasks.map((task, index) => {
          const style = TASK_STATUS_STYLE[task.status] || TASK_STATUS_STYLE.proposed;
          return (
            <div
              key={task.id}
              className={`flex items-center gap-2 py-1.5 ${index < tasks.length - 1 ? 'border-b border-dashed border-border-subtle' : ''}`}
            >
              <span className="font-mono text-[10px] text-text-muted w-6 shrink-0">T{index + 1}</span>
              <span className="flex-1 text-[12px] text-text-primary truncate" title={task.objective}>
                {task.title}
              </span>
              <MemberAvatar agentId={task.assignedAgentId} agent={agentById.get(task.assignedAgentId)} size="sm" />
              <span className={`text-[10.5px] w-14 text-right shrink-0 ${style.color}`}>
                {language === 'zh' ? style.zh : style.en}
              </span>
            </div>
          );
        })}
      </div>
      {approvable && (
        <div className="flex gap-2 px-3 py-2 border-t border-border-subtle bg-bg-elevated">
          <button
            onClick={onApprove}
            disabled={busy}
            className="px-3 py-1 rounded-md bg-accent text-[#04131f] text-[12px] font-semibold hover:bg-accent-hover transition-colors disabled:opacity-60"
          >
            {t('Approve & run', '批准并执行')}
          </button>
          <span className="text-[10.5px] text-text-muted self-center">
            {t('This team asks the leader for approval before running.', '该小队设置为「需队长审批计划」。')}
          </span>
        </div>
      )}
    </div>
  );
};

export const HandoffCard: React.FC<{ handoff: ScientificHandoff; taskTitle?: string }> = ({ handoff, taskTitle }) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const evidence = handoff.evidenceIds.slice(0, expanded ? undefined : 4);

  return (
    <div className={cardShell}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle bg-bg-elevated text-[12px] font-semibold text-emerald-500">
        <ShieldCheck size={13} />
        <span className="truncate">
          {t('Handoff', '任务交接')}
          {taskTitle ? ` · ${taskTitle}` : ''} · {t('confidence', '置信度')} {handoff.confidence.toFixed(2)}
        </span>
      </div>
      <div className="px-3 py-2 space-y-1.5 text-[12px] text-text-secondary">
        {handoff.findings.length > 0 && (
          <div>
            <span className="text-text-muted text-[11px]">{t('Findings', '结论')}</span>
            <ul className="mt-0.5 space-y-1">
              {(expanded ? handoff.findings : handoff.findings.slice(0, 2)).map((finding) => (
                <li key={finding.id} className="leading-relaxed">
                  <span className="font-mono text-[10px] text-text-muted mr-1.5">[{finding.kind}]</span>
                  {finding.statement}
                </li>
              ))}
            </ul>
          </div>
        )}
        {handoff.limitations.length > 0 && (
          <div>
            <span className="text-text-muted text-[11px]">{t('Limitations', '局限')}</span>
            <p className="leading-relaxed">{handoff.limitations.join('; ')}</p>
          </div>
        )}
        {evidence.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {evidence.map((id) => (
              <span
                key={id}
                className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-accent/20 bg-accent-soft text-accent"
              >
                {id}
              </span>
            ))}
            {!expanded && handoff.evidenceIds.length > 4 && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border-subtle text-text-muted">
                +{handoff.evidenceIds.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
      <button
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center justify-center gap-1 px-3 py-1.5 border-t border-border-subtle bg-bg-elevated text-[11px] text-text-secondary hover:text-accent transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {expanded ? t('Collapse', '收起') : t('Show everything', '展开全文')}
      </button>
    </div>
  );
};

export const ReportCard: React.FC<{ run: TeamRun }> = ({ run }) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const report = run.report;
  if (!report) return null;

  return (
    <div className={cardShell}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle bg-bg-elevated text-[12px] font-semibold text-text-primary">
        <FileText size={13} className="text-accent" />
        <span>{t('Final report', '最终报告')}</span>
        <span className="ml-auto font-mono text-[10px] text-text-muted">
          {t(`${report.evidenceIds.length} evidence`, `${report.evidenceIds.length} 条证据`)}
        </span>
      </div>
      <div className="px-3 py-2 text-[12px] text-text-secondary leading-relaxed">
        {/* The collapsed preview stays plain text: cutting Markdown at 320
            characters can split a table or a list mid-way. */}
        {expanded ? (
          <Markdown className="space-y-2">{report.narrative}</Markdown>
        ) : (
          <span className="whitespace-pre-wrap">{`${report.narrative.slice(0, 320)}${report.narrative.length > 320 ? '…' : ''}`}</span>
        )}
      </div>
      {report.limitations.length > 0 && expanded && (
        <div className="px-3 pb-2 text-[11.5px] text-text-muted">
          <span className="text-text-secondary">{t('Limitations: ', '局限：')}</span>
          {report.limitations.join('; ')}
        </div>
      )}
      {report.narrative.length > 320 && (
        <button
          onClick={() => setExpanded((value) => !value)}
          className="w-full flex items-center justify-center gap-1 px-3 py-1.5 border-t border-border-subtle bg-bg-elevated text-[11px] text-text-secondary hover:text-accent transition-colors"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? t('Collapse', '收起') : t('Read the full report', '阅读完整报告')}
        </button>
      )}
    </div>
  );
};
