import React, { useState, useRef, useEffect } from 'react';
import { Cloud, Terminal, ShieldCheck, ChevronDown } from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';
import type { ExecutionProfile } from '@medscience/core';

function profileIcon(profile: ExecutionProfile) {
  if (profile.mode === 'api') return Cloud;
  return profile.sandboxPreset === 'read-only' ? ShieldCheck : Terminal;
}

function profileSubtitle(profile: ExecutionProfile, t: (en: string, zh: string) => string): string {
  if (profile.mode === 'api') return t('Cloud model', '云端模型');
  return profile.sandboxPreset === 'read-only'
    ? t('Local Codex · read-only', '本地 Codex · 只读')
    : t('Local Codex · workspace write', '本地 Codex · 可写工作区');
}

/**
 * The prompt bar's "which permission runs this" picker. Reads/writes
 * AgentContext's selectedExecutionProfileId, which submitPrompt passes
 * through as executionProfileId for this one submission only -- Settings'
 * globally active profile is left untouched.
 */
export const ExecutionProfilePicker: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { runtimeProfiles, selectedExecutionProfileId, setSelectedExecutionProfileId } = useAgent();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (runtimeProfiles.length === 0) return null;

  const selected = runtimeProfiles.find((p) => p.id === selectedExecutionProfileId) || runtimeProfiles[0];
  const Icon = profileIcon(selected);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
        title={t('Choose which runtime handles this request', '选择这次请求使用的运行时')}
      >
        <Icon size={14} />
        {!compact && <span className="text-[11px] max-w-[110px] truncate">{selected.name}</span>}
        <ChevronDown size={11} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-64 rounded-lg border border-border bg-bg-surface shadow-lg z-30 overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-text-muted border-b border-border-subtle">
            {t('Permission for this request', '本次请求使用的权限')}
          </div>
          {runtimeProfiles.map((p) => {
            const PIcon = profileIcon(p);
            const isSelected = p.id === selected.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedExecutionProfileId(p.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-bg-hover transition-colors ${
                  isSelected ? 'bg-accent-soft' : ''
                }`}
              >
                <PIcon size={14} className={isSelected ? 'text-accent' : 'text-text-muted'} />
                <div className="min-w-0">
                  <div className="truncate text-text-primary">{p.name}</div>
                  <div className="truncate text-[10.5px] text-text-muted">{profileSubtitle(p, t)}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
