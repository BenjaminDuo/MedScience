import React from 'react';
import { agentColor } from './agentIdentity';

/**
 * A member's portrait.
 *
 * Members used to be rendered as two-character text tiles ("统", "PI"),
 * which read as labels rather than as people -- and the whole point of the
 * conversation list is that you are talking to someone. These are flat
 * vector portraits instead: drawn inline, so there is no network fetch, no
 * binary asset to ship, and they stay crisp at every size from the 12px
 * tile inside a team's composite avatar to the 52px card header.
 *
 * Every built-in member gets a hand-assigned look, so no two faces in a
 * team's avatar repeat: hair shape and colour, facial hair, glasses shape,
 * what they wear, and skin tone all vary. A custom member is assigned a
 * look by hashing its id, across the same space (10 x 5 x 4 x 3 x 5 x 6 =
 * 18,000 combinations), and the same id always produces the same face.
 */
export interface PersonLook {
  hair: number;
  hairColor: number;
  facialHair: 'none' | 'stubble' | 'beard' | 'moustache';
  glasses: 'none' | 'round' | 'square';
  wear: 'plain' | 'coat' | 'stethoscope' | 'headset' | 'cap';
  tone: number;
}

const TONES = ['#F2D2BD', '#E8C39E', '#D9A97E', '#C68863', '#A96C4C', '#8D5524'];
const HAIR_COLORS = ['#1F2937', '#3F2A1D', '#6B4423', '#A9743B', '#9CA3AF'];

/** Hair silhouettes over a 64x64 viewBox, drawn around a head centred at (32,29) r=13. */
const HAIR_PATHS = [
  // 0 short crop
  'M18 27c0-9 6-15 14-15s14 6 14 15c0 2-1 3-1 3s-1-6-4-8c-3-2-7 1-14-1-3-1-5 3-5 6 0 1-4-1-4 0z',
  // 1 receding / senior
  'M19 28c1-8 7-13 13-13 7 0 12 4 13 12 0 2-2 1-2 0-1-5-6-6-11-6-5 0-9 2-10 8 0 2-3 1-3-1z',
  // 2 side part
  'M18 28c0-9 6-16 14-16 6 0 12 4 13 11 1 5-1 8-2 8 0-4-2-7-6-8-5-1-9 1-13 5-3 3-5 3-6 0z',
  // 3 bob
  'M17 31c0-11 6-19 15-19s15 8 15 19c0 4-2 6-3 5 0-6 0-9-2-11-4 3-16 4-20 1-2 2-2 5-2 11-1 1-3-1-3-6z',
  // 4 curly
  'M18 29c-2-8 5-17 14-17s16 8 14 17c-1 4-3 3-3 1 0-3-2-5-4-5-3 0-4 2-7 2s-5-2-8-1c-2 1-3 3-3 5 0 2-2 2-3-2z',
  // 5 long, tied back
  'M17 30c0-11 7-18 15-18s15 7 15 18c0 3-1 5-2 5-1-7-3-10-6-11-5-2-13 0-16 3-2 2-3 5-3 8-2 0-3-2-3-5z',
  // 6 buzz cut
  'M20 28c0-7 5-13 12-13s12 6 12 13c0 1-1 2-2 1-1-5-5-8-10-8s-9 3-10 8c-1 1-2 0-2-1z',
  // 7 long straight, past shoulders
  'M16 33c0-12 7-21 16-21s16 9 16 21c0 6-2 9-4 9 1-8 0-13-2-16-4 3-17 4-21 1-2 3-2 8-1 15-2 0-4-3-4-9z',
  // 8 top knot
  'M32 8c3 0 5 2 5 4 0 1-1 2-2 3 5 2 8 7 8 13 0 2-2 2-2 0-1-6-5-9-9-9s-8 3-9 9c0 2-2 2-2 0 0-6 3-11 8-13-1-1-2-2-2-3 0-2 2-4 5-4z',
  // 9 wavy shoulder length
  'M17 32c0-11 6-20 15-20s15 9 15 20c0 4-1 7-3 7 1-6-1-9-2-12-2 2-5 3-10 3s-8-1-10-3c-1 3-3 6-2 12-2 0-3-3-3-7z',
];

const BUILT_IN_LOOKS: Record<string, PersonLook> = {
  // Deliberately spread across hair shape, colour, glasses and wear so a
  // team's composite avatar never shows the same face twice.
  'general-expert': { hair: 0, hairColor: 0, facialHair: 'none', glasses: 'none', wear: 'coat', tone: 0 },
  'principal-investigator': { hair: 1, hairColor: 4, facialHair: 'beard', glasses: 'square', wear: 'coat', tone: 2 },
  'research-planner': { hair: 8, hairColor: 1, facialHair: 'none', glasses: 'none', wear: 'plain', tone: 1 },
  'literature-reviewer': { hair: 3, hairColor: 2, facialHair: 'none', glasses: 'round', wear: 'plain', tone: 5 },
  'biology-specialist': { hair: 4, hairColor: 0, facialHair: 'none', glasses: 'none', wear: 'coat', tone: 3 },
  'chemistry-specialist': { hair: 2, hairColor: 3, facialHair: 'stubble', glasses: 'square', wear: 'coat', tone: 0 },
  'clinical-specialist': { hair: 9, hairColor: 1, facialHair: 'none', glasses: 'none', wear: 'stethoscope', tone: 4 },
  biostatistician: { hair: 6, hairColor: 0, facialHair: 'moustache', glasses: 'round', wear: 'plain', tone: 1 },
  'ml-specialist': { hair: 7, hairColor: 2, facialHair: 'none', glasses: 'square', wear: 'headset', tone: 2 },
  'reproducibility-engineer': { hair: 6, hairColor: 1, facialHair: 'beard', glasses: 'none', wear: 'cap', tone: 3 },
  'scientific-critic': { hair: 1, hairColor: 0, facialHair: 'stubble', glasses: 'round', wear: 'plain', tone: 5 },
  'scientific-writer': { hair: 5, hairColor: 3, facialHair: 'none', glasses: 'none', wear: 'plain', tone: 4 },
};

function hashOf(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

export function lookFor(agentId: string): PersonLook {
  const known = BUILT_IN_LOOKS[agentId];
  if (known) return known;
  const hash = hashOf(agentId);
  return {
    hair: hash % HAIR_PATHS.length,
    hairColor: (hash >> 4) % HAIR_COLORS.length,
    facialHair: (['none', 'stubble', 'beard', 'moustache'] as const)[(hash >> 8) % 4],
    glasses: (['none', 'round', 'square'] as const)[(hash >> 11) % 3],
    wear: (['plain', 'coat', 'stethoscope', 'headset', 'cap'] as const)[(hash >> 14) % 5],
    tone: (hash >> 18) % TONES.length,
  };
}

interface PersonGlyphProps {
  agentId: string;
  /** Rendered edge length in px. */
  size?: number;
  className?: string;
  title?: string;
}

export const PersonGlyph: React.FC<PersonGlyphProps> = ({ agentId, size = 32, className = '', title }) => {
  const look = lookFor(agentId);
  const color = agentColor(agentId);
  const tone = TONES[look.tone];
  const hairColor = HAIR_COLORS[look.hairColor];
  const clipId = `person-clip-${agentId.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={title || agentId}
      style={{ display: 'block' }}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="64" height="64" rx="16" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="64" height="64" fill={color} />
        {/* soft light from the top so the tile does not read as a flat block */}
        <circle cx="32" cy="18" r="30" fill="#ffffff" opacity="0.14" />

        {/* what they wear */}
        {look.wear === 'coat' ? (
          <>
            <path d="M12 64c0-11 8-17 20-17s20 6 20 17z" fill="#F8FAFC" />
            <path d="M32 47l-7 17h3l4-11 4 11h3z" fill={color} opacity="0.35" />
          </>
        ) : (
          <path d="M12 64c0-11 8-17 20-17s20 6 20 17z" fill="#0F172A" opacity="0.28" />
        )}

        {look.wear === 'stethoscope' && (
          <>
            <path
              d="M25 49c0 8 5 12 10 12s9-4 9-10"
              fill="none"
              stroke="#0F172A"
              strokeOpacity="0.55"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle cx="44" cy="50" r="3.2" fill="#0F172A" fillOpacity="0.55" />
          </>
        )}

        {/* neck + head */}
        <path d="M27 40h10v9h-10z" fill={tone} opacity="0.85" />
        <circle cx="32" cy="29" r="13" fill={tone} />

        {look.facialHair === 'beard' && (
          <path d="M20 29c0 10 5 16 12 16s12-6 12-16c0 6-5 8-12 8s-12-2-12-8z" fill={hairColor} opacity="0.92" />
        )}
        {look.facialHair === 'stubble' && (
          <path d="M21 31c1 8 6 13 11 13s10-5 11-13c0 7-5 10-11 10s-11-3-11-10z" fill={hairColor} opacity="0.3" />
        )}
        {look.facialHair === 'moustache' && (
          <path d="M28 36.5c1.2-1 2.6-1 4 0 1.4-1 2.8-1 4 0-1 1.6-2.4 2.2-4 2.2s-3-0.6-4-2.2z" fill={hairColor} opacity="0.85" />
        )}

        <path d={HAIR_PATHS[look.hair]} fill={hairColor} />

        {look.wear === 'cap' && (
          <>
            <path d="M18 27c0-8 6-14 14-14s14 6 14 14z" fill="#0F172A" opacity="0.8" />
            <path d="M18 27h22c0 2-2 3-6 3H20c-1 0-2-1-2-3z" fill="#0F172A" opacity="0.6" />
          </>
        )}
        {look.wear === 'headset' && (
          <>
            <path d="M19 30v-2a13 13 0 0 1 26 0v2" fill="none" stroke="#0F172A" strokeOpacity="0.7" strokeWidth="2.4" />
            <rect x="15.5" y="28" width="5" height="8" rx="2.2" fill="#0F172A" fillOpacity="0.7" />
            <rect x="43.5" y="28" width="5" height="8" rx="2.2" fill="#0F172A" fillOpacity="0.7" />
          </>
        )}

        {/* eyes + mouth: minimal, so the face stays legible at 12px */}
        <circle cx="27" cy="30" r="1.6" fill="#1F2937" />
        <circle cx="37" cy="30" r="1.6" fill="#1F2937" />
        <path d="M29 35.5c1.6 1.4 4.4 1.4 6 0" fill="none" stroke="#1F2937" strokeWidth="1.5" strokeLinecap="round" />

        {look.glasses === 'round' && (
          <g stroke="#1F2937" strokeWidth="1.5" fill="none" opacity="0.9">
            <circle cx="27" cy="30" r="4.2" />
            <circle cx="37" cy="30" r="4.2" />
            <path d="M31.2 30h1.6" />
          </g>
        )}
        {look.glasses === 'square' && (
          <g stroke="#1F2937" strokeWidth="1.5" fill="none" opacity="0.9">
            <rect x="22.6" y="26.4" width="8.4" height="7" rx="1.6" />
            <rect x="33" y="26.4" width="8.4" height="7" rx="1.6" />
            <path d="M31 29.8h2" />
          </g>
        )}
      </g>
    </svg>
  );
};
