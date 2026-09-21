import React from 'react';
import { FileText, X } from 'lucide-react';
import type { AttachedFile } from '../../lib/attachFiles';

export const AttachmentChips: React.FC<{ files: AttachedFile[]; onRemove: (name: string) => void }> = ({
  files,
  onRemove,
}) => {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-1 pb-1.5">
      {files.map((f) => (
        <span
          key={f.name}
          className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-md bg-bg-elevated border border-border text-[11px] text-text-secondary"
          title={f.text === undefined ? `${f.name} (binary, not inlined)` : f.name}
        >
          <FileText size={11} className="text-text-muted" />
          <span className="max-w-[140px] truncate">{f.name}</span>
          <button
            type="button"
            onClick={() => onRemove(f.name)}
            className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-secondary"
          >
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  );
};
