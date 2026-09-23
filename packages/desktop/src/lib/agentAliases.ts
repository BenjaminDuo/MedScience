/**
 * Mirror of LEGACY_AGENT_ALIASES / canonicalAgentId in
 * @medscience/core (agents/agentPersona.ts).
 *
 * Deliberately duplicated rather than imported: the renderer resolves
 * @medscience/core to its TypeScript source, so importing a *value* from it
 * would pull node-only modules (fs/path/os) into the browser bundle. Types
 * are fine to import; runtime constants are not. Keep the two in sync --
 * they are both small and change together.
 */
export const LEGACY_AGENT_ALIASES: Record<string, string> = {
  research: 'general-expert',
  biology: 'biology-specialist',
  chemistry: 'chemistry-specialist',
  ml: 'ml-specialist',
  critic: 'scientific-critic',
  plan: 'research-planner',
};

export const DEFAULT_AGENT_ID = 'general-expert';

export function canonicalAgentId(agentId?: string): string {
  if (!agentId) return DEFAULT_AGENT_ID;
  return LEGACY_AGENT_ALIASES[agentId] || agentId;
}
