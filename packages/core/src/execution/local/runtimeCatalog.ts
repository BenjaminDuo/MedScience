import { LocalRuntimeKind } from '../../types/runtime.js';

/**
 * Static metadata for every local CLI tool MedScience can discover and bind
 * as a 'local-runtime' ExecutionProfile. This is the single place that
 * names candidate binaries, how to probe a version, and how isolation is
 * derived for that tool -- see GenericRuntimeDetector.ts (detection) and
 * runtimeIsolation.ts (the per-session home directory).
 *
 * The list mirrors Multica's own 26-tool catalog (github.com/multica-ai/multica,
 * cloned and read directly -- server/pkg/agent/*.go for per-tool behavior,
 * server/internal/daemon/agents_probe.go for the actual candidate binary
 * names) so MedScience can detect the same breadth of local coding-agent
 * CLIs Multica does. Candidate binary names below come from that source,
 * not guesswork.
 *
 * Codex is deliberately NOT listed here even though it is a LocalRuntimeKind
 * -- it has its own detector (RuntimeDetector.ts, with a Codex-specific
 * app-server capability probe) and its own backend (CodexRuntimeBackend.ts)
 * that predate this catalog and are already shipped/tested. This catalog
 * covers the *additional* tools layered on afterwards. UI code that lists
 * "every runtime MedScience can bind" should still special-case Codex
 * alongside this catalog (see ModelConfigView.tsx).
 */
export interface LocalRuntimeSpec {
  runtime: LocalRuntimeKind;
  displayName: string;
  /** Candidate executable names to look for on PATH, in order. */
  candidateNames: string[];
  /** Windows-specific candidate names, if different (checked instead of candidateNames on win32). */
  candidateNamesWin32?: string[];
  /**
   * Extra directories to check directly for candidateNames, independent of
   * PATH -- for CLIs whose own installer drops a binary into a well-known
   * location without necessarily getting onto PATH for every process (e.g.
   * a GUI app or a background service started outside the user's shell
   * never re-sources their .zshrc/.bashrc PATH additions). "~" is expanded
   * to the current user's home directory. This is checked *before* falling
   * back to the login-shell probe, since it needs no shell fork at all.
   */
  extraSearchDirs?: string[];
  versionArgs: string[];
  versionRegex: RegExp;
  /**
   * How confident MedScience is that binding this tool isolates its local
   * state from the user's own everyday CLI usage the same way CODEX_HOME
   * does for Codex. 'confirmed' means the isolation env var is known to
   * relocate session/auth data (verified against the tool's own issue
   * tracker or docs). 'best-effort' means MedScience sets the variables
   * most likely to work but has not been able to verify them against a
   * real installation. 'none' means MedScience has not implemented any
   * isolation for this tool yet -- binding it runs the CLI against its
   * normal, everyday install and state directory, exactly like running it
   * yourself in a terminal, so a MedScience-driven session can show up in
   * this tool's own history. (Note: Multica itself does this too for most
   * non-Codex tools -- see claude-code's note below.) Surfaced in the UI so
   * the user is never misled into thinking every bound runtime is as
   * isolated as Local Codex.
   */
  isolationConfidence: 'confirmed' | 'best-effort' | 'none';
  isolationNote: string;
  /**
   * How to invoke this tool for a single non-interactive "run this prompt
   * and exit" turn -- see GenericCliRuntimeBackend.ts, which drives every
   * catalog runtime except Codex (Codex keeps its own richer app-server
   * protocol; see CodexRuntimeBackend.ts). Returns the full argv, not
   * including the executable path itself.
   *
   * IMPORTANT: unless a tool's entry below overrides this, MedScience uses
   * DEFAULT_NON_INTERACTIVE_ARGS (['-p', prompt]) -- the convention Claude
   * Code popularized and that many of the newer CLI forks in this catalog
   * copy. That default is a REASONABLE GUESS, not a verified fact: this
   * environment has no real installation of most of these ~25 tools to
   * test the guess against. If a bound tool actually needs something else
   * (a subcommand like `run`/`chat`, a differently-named flag, or a bare
   * positional prompt with no flag at all) it will show up as that tool
   * erroring out or hanging on first use -- tell MedScience's maintainers
   * which tool and what actually works, and it's a one-line fix here.
   */
  nonInteractiveArgs?: (prompt: string) => string[];
}

/** Shared by every catalog entry that doesn't override nonInteractiveArgs -- see that field's doc comment for how confident (or not) this default is. */
export const DEFAULT_NON_INTERACTIVE_ARGS = (prompt: string): string[] => ['-p', prompt];

const NO_ISOLATION_NOTE = (displayName: string): string =>
  `MedScience has not implemented isolation for ${displayName} yet. Binding it runs your normal ${displayName} installation directly, using its usual config/session storage -- a MedScience-driven conversation can appear in ${displayName}'s own history. (For reference: Multica itself does not isolate this tool either, except Codex.)`;

export const LOCAL_RUNTIME_CATALOG: LocalRuntimeSpec[] = [
  {
    runtime: 'claude-code',
    displayName: 'Claude Code',
    candidateNames: ['claude'],
    candidateNamesWin32: ['claude.exe', 'claude.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'confirmed',
    isolationNote:
      'Uses CLAUDE_CONFIG_DIR to relocate session transcripts, .claude.json and credentials into an isolated directory per MedScience session (this variable is undocumented by Anthropic but is real and used by Claude Code itself -- see anthropics/claude-code#3833/#28808). Your login credentials are copied into that isolated directory once so it can authenticate without a fresh login, but never written back to your real ~/.claude. Note: Multica itself does NOT isolate Claude Code this way -- it runs Claude Code against your normal ~/.claude, so a Multica-driven conversation shows up in your own Claude Code history. MedScience goes further here on purpose.',
    // Real, documented headless mode (code.claude.com/docs/en/headless):
    // -p runs one prompt and exits; --permission-mode acceptEdits plus a
    // broad --allowedTools list means it actually gets to do things
    // instead of silently declining every tool call, since there is no
    // approval callback wired up in this generic backend for it to ask
    // through (only Codex gets that -- see GenericCliRuntimeBackend.ts).
    nonInteractiveArgs: (prompt: string) => [
      '-p',
      prompt,
      '--output-format',
      'json',
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      'Bash,Read,Edit,Write,Glob,Grep,WebFetch,WebSearch',
    ],
  },
  {
    runtime: 'opencode',
    displayName: 'OpenCode',
    candidateNames: ['opencode'],
    candidateNamesWin32: ['opencode.exe', 'opencode.cmd'],
    // OpenCode's own official install script (curl -fsSL https://opencode.ai/install | bash)
    // drops the binary at ~/.opencode/bin/opencode and appends that directory
    // to PATH inside the user's shell rc file -- which only takes effect for
    // an interactive shell. A process started without going through that rc
    // file (common for an Electron app or `npm run web` launched from a
    // non-interactive context, e.g. a GUI launcher or a background service)
    // can miss it even though `opencode` works fine in the user's terminal.
    // Checking this directory directly, before any shell fork, fixes that
    // without waiting on the (slower) login-shell fallback below.
    extraSearchDirs: ['~/.opencode/bin'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'best-effort',
    isolationNote:
      'Sets OPENCODE_CONFIG_DIR plus XDG_CONFIG_HOME/XDG_DATA_HOME to an isolated directory per MedScience session. OpenCode’s exact session/auth storage layout is less clearly documented than Codex’s or Claude Code’s, so this is a best-effort isolation -- if you notice MedScience conversations still showing up in your personal OpenCode history, or OpenCode asking to log in again inside MedScience, let us know. Multica itself does not isolate OpenCode at all.',
    // OpenCode's actually-documented automation surface is `opencode serve`
    // (an HTTP+SSE API with its own permission-approval endpoint) -- a
    // richer integration than this generic one-shot backend attempts.
    // `run` is this catalog's best guess at a plain one-shot subcommand;
    // unverified, same as every other non-Claude-Code entry here.
    nonInteractiveArgs: (prompt: string) => ['run', prompt],
  },
  {
    runtime: 'cursor',
    displayName: 'Cursor Agent',
    candidateNames: ['cursor-agent'],
    candidateNamesWin32: ['cursor-agent.exe', 'cursor-agent.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('Cursor Agent'),
  },
  {
    runtime: 'copilot',
    displayName: 'GitHub Copilot CLI',
    candidateNames: ['copilot'],
    candidateNamesWin32: ['copilot.exe', 'copilot.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('GitHub Copilot CLI'),
  },
  {
    runtime: 'qwen',
    displayName: 'Qwen Code',
    candidateNames: ['qwen'],
    candidateNamesWin32: ['qwen.exe', 'qwen.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('Qwen Code'),
  },
  {
    runtime: 'qwenpaw',
    displayName: 'QwenPaw',
    candidateNames: ['qwenpaw'],
    candidateNamesWin32: ['qwenpaw.exe', 'qwenpaw.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('QwenPaw'),
  },
  {
    runtime: 'grok',
    displayName: 'Grok CLI',
    candidateNames: ['grok'],
    candidateNamesWin32: ['grok.exe', 'grok.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('Grok CLI'),
  },
  {
    runtime: 'kimi',
    displayName: 'Kimi CLI',
    candidateNames: ['kimi'],
    candidateNamesWin32: ['kimi.exe', 'kimi.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('Kimi CLI'),
  },
  {
    runtime: 'codebuddy',
    displayName: 'CodeBuddy',
    candidateNames: ['codebuddy'],
    candidateNamesWin32: ['codebuddy.exe', 'codebuddy.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('CodeBuddy'),
  },
  {
    runtime: 'codearts',
    displayName: 'CodeArts',
    candidateNames: ['codearts'],
    candidateNamesWin32: ['codearts.cmd', 'codearts.exe'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('CodeArts'),
  },
  {
    runtime: 'deveco',
    displayName: 'DevEco Code',
    candidateNames: ['deveco'],
    candidateNamesWin32: ['deveco.exe', 'deveco.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('DevEco Code'),
  },
  {
    runtime: 'openclaw',
    displayName: 'OpenClaw',
    candidateNames: ['openclaw'],
    candidateNamesWin32: ['openclaw.exe', 'openclaw.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('OpenClaw'),
  },
  {
    runtime: 'hermes',
    displayName: 'Hermes',
    candidateNames: ['hermes'],
    candidateNamesWin32: ['hermes.exe', 'hermes.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('Hermes'),
  },
  {
    runtime: 'pi',
    displayName: 'Pi',
    candidateNames: ['pi'],
    candidateNamesWin32: ['pi.exe', 'pi.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('Pi'),
  },
  {
    runtime: 'omp',
    displayName: 'Oh-My-Pi',
    candidateNames: ['omp'],
    candidateNamesWin32: ['omp.exe', 'omp.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('Oh-My-Pi'),
  },
  {
    runtime: 'reasonix',
    displayName: 'Reasonix',
    candidateNames: ['reasonix'],
    candidateNamesWin32: ['reasonix.exe', 'reasonix.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('Reasonix'),
  },
  {
    runtime: 'dsh',
    displayName: 'DeepSeek Harness',
    candidateNames: ['dsh'],
    candidateNamesWin32: ['dsh.exe', 'dsh.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('DeepSeek Harness'),
  },
  {
    runtime: 'kiro',
    displayName: 'Kiro CLI',
    candidateNames: ['kiro-cli'],
    candidateNamesWin32: ['kiro-cli.exe', 'kiro-cli.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('Kiro CLI'),
  },
  {
    runtime: 'antigravity',
    displayName: 'Antigravity',
    candidateNames: ['agy'],
    candidateNamesWin32: ['agy.exe', 'agy.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('Antigravity'),
  },
  {
    runtime: 'qoder',
    displayName: 'Qoder CLI',
    candidateNames: ['qodercli'],
    candidateNamesWin32: ['qodercli.exe', 'qodercli.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('Qoder CLI'),
  },
  {
    runtime: 'qoderclicn',
    displayName: 'Qoder CLI (CN)',
    candidateNames: ['qoderclicn'],
    candidateNamesWin32: ['qoderclicn.exe', 'qoderclicn.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('Qoder CLI (CN)'),
  },
  {
    runtime: 'traecli',
    displayName: 'TRAE CLI',
    candidateNames: ['traecli'],
    candidateNamesWin32: ['traecli.exe', 'traecli.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('TRAE CLI'),
  },
  {
    runtime: 'dim',
    displayName: 'Dim',
    candidateNames: ['dim'],
    candidateNamesWin32: ['dim.exe', 'dim.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('Dim'),
  },
  {
    runtime: 'mcode',
    displayName: 'MiniMax Code',
    candidateNames: ['mcode'],
    candidateNamesWin32: ['mcode.exe', 'mcode.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('MiniMax Code'),
  },
  {
    runtime: 'zeroclaw',
    displayName: 'ZeroClaw',
    candidateNames: ['zeroclaw'],
    candidateNamesWin32: ['zeroclaw.exe', 'zeroclaw.cmd'],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    isolationConfidence: 'none',
    isolationNote: NO_ISOLATION_NOTE('ZeroClaw'),
  },
];

export function findRuntimeSpec(runtime: LocalRuntimeKind): LocalRuntimeSpec | undefined {
  return LOCAL_RUNTIME_CATALOG.find((spec) => spec.runtime === runtime);
}
