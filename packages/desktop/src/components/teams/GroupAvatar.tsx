import React from 'react';
import type { AgentDefinition } from '@medscience/core';
import { useLanguage } from '../../context/LanguageContext';
import { agentColor, agentName } from './agentIdentity';
import { PersonGlyph } from './PersonGlyph';

interface AvatarProps {
  agentId: string;
  agent?: AgentDefinition;
  /** A preset, or an exact pixel size. */
  size?: 'sm' | 'md' | 'lg' | number;
  /** Shows the leader crown badge. */
  leader?: boolean;
  className?: string;
}

const SIZES: Record<NonNullable<AvatarProps['size']>, number> = {
  sm: 24,
  md: 32,
  lg: 52,
};

/** One member's portrait (see PersonGlyph for why these are faces, not initials). */
export const MemberAvatar: React.FC<AvatarProps> = ({ agentId, agent, size = 'md', leader, className = '' }) => {
  const { language } = useLanguage();
  const name = agent ? agentName(agent, agentId, language) : agentId;
  // The box and the drawing are always the same number of pixels: sizing the
  // wrapper with a utility class while the SVG kept its preset size is what
  // made the portrait overflow its row.
  const px = typeof size === 'number' ? size : SIZES[size];
  return (
    <span className={`relative shrink-0 inline-block ${className}`} style={{ width: px, height: px }}>
      <PersonGlyph agentId={agentId} size={px} title={name} className="rounded-[26%]" />
      {leader && <span className="absolute -top-1.5 -left-1.5 text-[10px] leading-none">👑</span>}
    </span>
  );
};

/**
 * The team's composite avatar: up to nine member portraits tiled into one
 * square, the way a group chat shows who is in it at a glance.
 */
export const GroupAvatar: React.FC<{ agentIds: string[]; size?: number }> = ({ agentIds, size = 42 }) => {
  const shown = agentIds.slice(0, 9);
  const columns = shown.length > 4 ? 3 : 2;
  const tile = Math.floor((size - 6) / columns);
  return (
    <div
      className="grid gap-[2px] p-[2px] rounded-[11px] bg-bg-elevated border border-border-subtle shrink-0 overflow-hidden"
      style={{ width: size, height: size, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {shown.map((agentId) => (
        <span
          key={agentId}
          className="rounded-[3px] overflow-hidden flex items-center justify-center"
          style={{ background: agentColor(agentId) }}
        >
          <PersonGlyph agentId={agentId} size={tile} />
        </span>
      ))}
    </div>
  );
};
