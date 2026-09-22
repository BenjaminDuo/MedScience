import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalRuntimeKind } from '../../types/runtime.js';

/**
 * Isolation-home derivation for the local runtimes layered on top of Codex
 * (see runtimeCatalog.ts). Codex's own isolation (CODEX_HOME) lives in
 * CodexRuntimeBackend.ts's deriveCodexHome()/ensureCodexHomeDir() -- already
 * shipped and tested, deliberately left untouched here. This module gives
 * the newer tools the same guarantee: every MedScience session gets its own
 * directory, keyed by sessionId (never a shared/reused slot -- see
 * CodexRuntimeBackend.ts's doc comment on deriveCodexHome for why: Multica
 * hit a real bug, multica-ai/multica#3130, from reusing one CODEX_HOME
 * across unrelated tasks and leaking stale memories between them).
 *
 * Per-tool isolation confidence differs -- see runtimeCatalog.ts's
 * `isolationConfidence`/`isolationNote` for what's confirmed vs best-effort
 * for each one.
 */

function medscienceBase(): string {
  return process.env.MEDSCIENCE_HOME || path.join(os.homedir(), '.medscience');
}

function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

/** Root directory for this session's isolated state for the given runtime. */
export function deriveRuntimeHomeRoot(runtime: LocalRuntimeKind, sessionId: string): string {
  return path.join(medscienceBase(), 'runtime-homes', runtime, safeSessionId(sessionId));
}

function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    // Best effort -- the tool will create what it needs on first write,
    // same fallback as the real, unisolated home directory would get.
  }
}

/** One-time, best-effort copy so the isolated home can authenticate without a fresh login. Never writes back to the source. */
function copyIfMissing(from: string, to: string): void {
  try {
    if (!fs.existsSync(from)) return;
    if (fs.existsSync(to)) return;
    ensureDir(path.dirname(to));
    fs.copyFileSync(from, to);
  } catch {
    // Best effort -- worst case the isolated tool just asks the user to
    // log in once inside that isolated home, same as any fresh install.
  }
}

export interface RuntimeIsolation {
  /** Root directory MedScience created for this session+runtime. */
  homeDir: string;
  /** Environment variable overrides to apply on top of process.env when spawning the tool. */
  env: Record<string, string>;
}

/**
 * Prepares (creating directories and best-effort bootstrapping credentials)
 * and returns the isolation env overrides for one session's use of one
 * local runtime. Call once per session before first spawning that tool;
 * safe to call again for the same sessionId (idempotent -- copyIfMissing
 * never overwrites).
 */
export function prepareRuntimeIsolation(runtime: LocalRuntimeKind, sessionId: string): RuntimeIsolation {
  const homeDir = deriveRuntimeHomeRoot(runtime, sessionId);
  ensureDir(homeDir);

  if (runtime === 'claude-code') {
    // CLAUDE_CONFIG_DIR is real (Claude Code itself reads it -- see
    // anthropics/claude-code#3833, #28808, #30538) but undocumented by
    // Anthropic, so treat its exact edges (e.g. it does NOT stop a local
    // ./.claude/settings.local.json from also being written in the
    // session's working directory) as things that may shift between
    // Claude Code releases.
    const realClaudeHome = path.join(os.homedir(), '.claude');
    copyIfMissing(path.join(realClaudeHome, '.credentials.json'), path.join(homeDir, '.credentials.json'));
    copyIfMissing(path.join(realClaudeHome, '.claude.json'), path.join(homeDir, '.claude.json'));
    return { homeDir, env: { CLAUDE_CONFIG_DIR: homeDir } };
  }

  if (runtime === 'opencode') {
    // Best-effort (see runtimeCatalog.ts's isolationNote for this one).
    // OpenCode reads OPENCODE_CONFIG_DIR directly for config, and appears
    // to otherwise follow the XDG Base Directory convention (an
    // `opencode/` subfolder under XDG_CONFIG_HOME / XDG_DATA_HOME) for
    // everything else including session data -- so both are set,
    // nested consistently, to cover whichever path OpenCode actually
    // resolves.
    const xdgConfigHome = path.join(homeDir, 'xdg-config');
    const xdgDataHome = path.join(homeDir, 'xdg-data');
    const opencodeConfigDir = path.join(xdgConfigHome, 'opencode');
    const opencodeDataDir = path.join(xdgDataHome, 'opencode');
    ensureDir(opencodeConfigDir);
    ensureDir(opencodeDataDir);

    const realConfigDir = path.join(os.homedir(), '.config', 'opencode');
    const realDataDir = path.join(os.homedir(), '.local', 'share', 'opencode');
    // Auth storage location isn't confirmed for OpenCode -- try both
    // plausible spots; copyIfMissing no-ops harmlessly if neither exists.
    copyIfMissing(path.join(realConfigDir, 'auth.json'), path.join(opencodeConfigDir, 'auth.json'));
    copyIfMissing(path.join(realDataDir, 'auth.json'), path.join(opencodeDataDir, 'auth.json'));

    return {
      homeDir,
      env: {
        OPENCODE_CONFIG_DIR: opencodeConfigDir,
        XDG_CONFIG_HOME: xdgConfigHome,
        XDG_DATA_HOME: xdgDataHome,
      },
    };
  }

  // codex isn't handled here -- see CodexRuntimeBackend.ts's own
  // deriveCodexHome()/ensureCodexHomeDir(), which predates this module.
  return { homeDir, env: {} };
}
