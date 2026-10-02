# AGENTS.md — MedScience Contributor & AI Agent Guidelines

> **IMPORTANT TARGET AUDIENCE NOTICE**
> 
> This document is strictly for **AI coding assistants and autonomous agents (such as Claude Code, Antigravity, Codex CLI, Cursor, or peer agents) that are inspecting, developing, testing, or maintaining the MedScience codebase itself**.
> 
> This is **NOT** a runtime prompt for MedScience's internal research loop when executing user scientific queries.

---

## 1. Project Overview & Architecture

**MedScience** is an autonomous, open-source scientific and biomedical research workstation and multi-agent framework. It integrates hardened molecular databases, clinical connectors, cross-platform kernel-enforced sandboxes, and formal verification gates to conduct hypothesis-driven, evidence-grounded scientific investigations.

### Monorepo Architecture
```text
MedScience/
├── packages/
│   ├── core/           # Core runtime, ReAct research loop, hooks, tools, skills, sandboxes
│   │   ├── src/
│   │   │   ├── client/         # Multi-model client (OpenAI & Anthropic protocols, Mock provider)
│   │   │   ├── research-loop/  # AutonomousResearchEngine, EvidenceTracker, EvidenceVerifier,
│   │   │   │                   # SubagentTreeEngine, PlanTracker, CritiqueEngine, MemoryCompactor
│   │   │   ├── hooks/          # Non-bypassable guardrails (secret-redaction, evidence-verifier,
│   │   │   │                   # clinical-data-gate, evidence-completeness-check)
│   │   │   ├── tools/          # Hardened molecular & clinical connectors (UniProt, PDB, ChEMBL,
│   │   │   │                   # PubChem, PubMed, ClinicalTrials, openFDA, RxNorm, DailyMed)
│   │   │   ├── skills/         # Bundled SOPs and scientific workflow definitions
│   │   │   ├── sandbox/        # Cross-platform sandbox (macOS Seatbelt, Linux bwrap, Windows)
│   │   │   └── privacy/        # ClinicalDataGate privacy enforcement
│   │   └── tests/      # Core test suites and integration verification
│   ├── web/            # Loopback-only server that serves the desktop renderer as a
│   │                   # local web app (`npm run web`)
│   ├── desktop/        # Electron + React + Tailwind desktop app (ships via GitHub Releases)
│   └── portal/         # Marketing site + docs, deployed to GitHub Pages
├── skills/             # Standard OpenScience-compatible SKILL.md repositories
└── docs/               # Architecture schematics, specs, figures (authored files only --
                        # no build output; the Pages site is built in CI from packages/portal)
```

### What each package ships as

| Package | Name | Ships as |
|---|---|---|
| `packages/core` | `@medscience/core` | Internal library -- the engine every other package builds on |
| `packages/web` | `@medscience/web` | The `medscience-web` local server (`npm run web`) |
| `packages/desktop` | `@medscience/desktop` | GitHub Releases, via electron-builder |
| `packages/portal` | `@medscience/portal` | GitHub Pages, built in CI by `pages.yml` |

Every workspace is `private: true`; nothing is published to npm. The desktop app ships through
`v*` tags (see `release.yml`) and the site deploys on every push to `main`.

---

## 2. Core Agentic Paradigms

When modifying or expanding the codebase, preserve and adhere to these three core architectural pillars:

1. **Subagent Hypothesis Tree (`SubagentTreeEngine`)**:
   - Explores multiple competing scientific hypotheses in parallel with isolated evidence scopes.
   - Computes empirical multi-factor confidence scores ($S_{\text{seq}}, S_{\text{bio}}, S_{\text{clin}}, S_{\text{lit}}, P_{\text{contradiction}}$) with distinct status classification (`supported`, `inconclusive`, `refuted`).

2. **Pre-Adoption Evidence Verification Gate (`EvidenceVerifier`)**:
   - Codex-style patch verification. No computational or tool output is admitted into the immutable `EvidenceTracker` without passing physical and mathematical boundary tests ($p \in [0, 1]$, $IC_{50} > 0$, $HU \in [-1024, +3071]$, NaN/Inf overflow detection).

3. **Formal Hooks Lifecycle (`HookRegistry`)**:
   - Deterministic, non-bypassable guardrails triggered across four lifecycle events:
     - `PreToolUse`: `secret-redaction` (blocks credential leaks), `clinical-data-gate` (guards EHR/DICOM data).
     - `PostToolUse`: `evidence-verifier` (validates tool outputs).
     - `SessionStart`: loads session context and skill definitions.
     - `Stop`: `evidence-completeness-check` (verifies all cited `[Evidence: EV-xxx]` records exist in tracker).

4. **Explicit Plan Tracker (`PlanTracker`)**:
   - 5-stage research milestones (`TASK-1` to `TASK-5`) streamed to the UI via `EventBus`.

---

## 3. Non-Negotiable Engineering Rules & Invariants

All agents contributing to this codebase **MUST** follow these strict rules:

### A. Scientific Integrity & No Hallucinations
- **NEVER fabricate scientific facts, citations, PMIDs, NCT IDs, or protein sequences**.
- Every claim synthesized by MedScience must be anchored in verified `[Evidence: EV-xxx]` tags.
- Mock providers must use real-world grounded data (e.g. TYK2: P29597, 1187 aa; Deucravacitinib: CID 134821691).

### B. Clinical Privacy & Sandbox Safety
- **Clinical Data Policy**: Raw EHR text and DICOM image volumes must be processed locally inside the kernel-enforced sandbox. Transmission to external API endpoints requires explicit authorization through the `clinical-data-gate` Hook.
- **Sandboxed Execution**: Python execution must default to the sandbox without direct network or host filesystem access.
- **Credential Protection**: Never hardcode, commit, or echo real API keys. All tool invocations must pass the `secret-redaction` Hook.

### C. Branding and Naming
- The framework name is strictly **MedScience**.
- Do **NOT** use Chinese transliterations (such as "君科") anywhere in the user-facing documentation, portal, or code comments.

### D. Documentation Language Conventions
- **README**: Chinese and English are two separate, self-contained files, not one
  bilingual document. `README.md` is the Chinese version and is what GitHub shows by
  default; `README-en.md` is the English version. Each links to the other at the top.
  Do **NOT** merge them back into a single file or make `README.md` English-first:
  Chinese is the default for this project. A change to one must be mirrored in the other
  in the same commit, or the two drift apart.
- **Portal and in-app copy**: bilingual at runtime via the `isZh` language switch; both
  strings live side by side in the source.
- **Code Comments & Docstrings**: Standard English.

### E. Branching & Release Channels
- `main` is the release branch; `develop` is where day-to-day work lands, reaching `main`
  by merge to be released. Feature branches are cut from `develop`.
- Release channel is decided by `release.yml`, never by hand: a `v*` tag whose commit is
  on `main` publishes a **stable release**; a `v*` tag anywhere else publishes a
  **pre-release**. A tag with a semver pre-release suffix (`v2.1.0-rc.1`) is a
  pre-release on any branch.
- Because of this, `release.yml` must keep `fetch-depth: 0` — the check asks whether the
  tagged commit is an ancestor of `origin/main`, which a shallow clone cannot answer.
- CI (`test.yml`) runs on every branch. Do not narrow it back to `main`: work lands on a
  development branch first, and that is exactly where a break needs to be caught.

---

## 4. Directory Conventions for Skills & Hooks

### A. Adding a New Hook
1. Place the hook class in [`packages/core/src/hooks/builtin/`](packages/core/src/hooks/builtin/).
2. Implement the `HookDefinition` interface from [`packages/core/src/hooks/types.ts`](packages/core/src/hooks/types.ts).
3. Bind the appropriate lifecycle events: `PreToolUse`, `PostToolUse`, `SessionStart`, or `Stop`.
4. Register the hook in [`packages/core/src/hooks/HookRegistry.ts`](packages/core/src/hooks/HookRegistry.ts) and export it from `index.ts`.
5. Add automated unit test in [`packages/core/tests/test-hooks-system.ts`](packages/core/tests/test-hooks-system.ts).

### B. Adding a New Skill
1. Create a TypeScript definition in [`packages/core/src/skills/bundled/`](packages/core/src/skills/bundled/) implementing `SkillDefinition`.
2. Register the skill in [`packages/core/src/skills/SkillRegistry.ts`](packages/core/src/skills/SkillRegistry.ts).
3. Create the corresponding markdown specification and executable scripts in `skills/<skill-id>/`:
   - `SKILL.md` (YAML frontmatter + description + SOP workflow steps + input/output specification)
   - `scripts/` (reusable Python / statistical computation scripts)
   - `examples/` (real-world run outputs with public datasets)

---

## 5. Development and Testing Commands

```bash
# Build the entire monorepo
npm run build

# Run every verification suite (core + desktop). packages/core/tests/run-all.ts
# discovers each suite under packages/core/tests, gives every run a throwaway
# MEDSCIENCE_HOME so a real profile is never written to, and skips the suites
# that need network access or a personal API key. Do not reintroduce a
# hand-kept list of test files here -- it goes stale and silently stops
# covering new suites.
npm test

# Include the suites that need network access and a configured API key
MEDSCIENCE_TEST_NETWORK=1 npm test

# A single suite, when iterating on it
npx tsx packages/core/tests/test-hooks-system.ts

# Run the workstation as a local web app (loopback only)
npm run web

# Run the Electron desktop app
npm run desktop

# Package the desktop app locally (mac / win / linux)
npm run dist:mac
npm run dist:win
npm run dist:linux

# Regenerate the app icon after editing packages/desktop/build/icon.svg.
# Needs headless Chromium and ImageMagick. Writes build/icon.png (the source
# for the macOS .icns and Windows .ico) and build/icons/ (the Linux set --
# Linux needs a directory of <size>x<size>.png, not a single file).
node packages/desktop/scripts/render-icon.mjs
```

> **Release packaging note**: `.github/workflows/release.yml` only runs
> electron-builder on a `v*` tag, so packaging mistakes do not surface during
> normal CI. Run `npm run dist:linux` locally after touching
> `electron-builder.json`, the icon, or anything under `packages/desktop/build/`.
