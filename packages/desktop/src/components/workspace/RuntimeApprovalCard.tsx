import React, { useState } from 'react';
import { Terminal, FileEdit, ShieldAlert, Check, X, FolderOpen } from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';

const KIND_ICON: Record<string, React.ReactNode> = {
  command: <Terminal size={15} />,
  'file-change': <FileEdit size={15} />,
  permissions: <ShieldAlert size={15} />,
};

export const RuntimeApprovalCard: React.FC = () => {
  const { pendingApprovals, respondApproval } = useAgent();
  const { t } = useLanguage();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  if (!pendingApprovals || pendingApprovals.length === 0) return null;

  const handleRespond = async (approvalId: string, decision: 'accept' | 'decline') => {
    setResolvingId(approvalId);
    try {
      await respondApproval(approvalId, decision);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="max-w-[840px] mx-auto space-y-3">
      {pendingApprovals.map((approval) => (
        <div
          key={approval.id}
          className="rounded-xl bg-amber-500/5 border border-amber-500/30 shadow-sm overflow-hidden"
        >
          <div className="flex items-start gap-3 p-4">
            <div className="w-7 h-7 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              {KIND_ICON[approval.kind] || <ShieldAlert size={15} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-amber-500 font-semibold mb-1">
                {t('Permission needed', '需要你授权')}
              </div>
              <div className="text-[14px] font-medium text-text-primary mb-1">{approval.title}</div>
              {approval.summary && (
                <div className="text-[12.5px] text-text-secondary leading-relaxed mb-2">{approval.summary}</div>
              )}

              {approval.command && approval.command.length > 0 && (
                <div className="mt-2 rounded-lg bg-black/30 border border-border-subtle px-3 py-2 font-mono text-[12px] text-text-primary overflow-x-auto">
                  {approval.command.join(' ')}
                </div>
              )}

              {approval.cwd && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-muted font-mono">
                  <FolderOpen size={11} />
                  {approval.cwd}
                </div>
              )}

              {approval.files && approval.files.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {approval.files.map((f) => (
                    <li key={f} className="text-[11.5px] font-mono text-text-secondary truncate">
                      {f}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  disabled={resolvingId === approval.id}
                  onClick={() => handleRespond(approval.id, 'accept')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[12.5px] font-medium transition-colors disabled:opacity-50"
                >
                  <Check size={13} />
                  {t('Allow', '允许')}
                </button>
                <button
                  type="button"
                  disabled={resolvingId === approval.id}
                  onClick={() => handleRespond(approval.id, 'decline')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-surface hover:bg-bg-hover border border-border text-text-secondary text-[12.5px] font-medium transition-colors disabled:opacity-50"
                >
                  <X size={13} />
                  {t('Deny', '拒绝')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
