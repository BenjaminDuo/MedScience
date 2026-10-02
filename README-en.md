# MedScience 🧬 🔬

<div align="center">

**Open-Source Evidence-Traceable AI Agent Framework for Scientific & Biomedical Discovery**  
*(Molecular Biology • Clinical Evidence • Medical Multimodal • OS-Level Sandboxing)*

[![Cross-Platform CI](https://github.com/BenjaminDuo/MedScience/actions/workflows/test.yml/badge.svg)](https://github.com/BenjaminDuo/MedScience/actions/workflows/test.yml)
[![Desktop Release](https://github.com/BenjaminDuo/MedScience/actions/workflows/release.yml/badge.svg)](https://github.com/BenjaminDuo/MedScience/actions/workflows/release.yml)
[![GitHub Pages](https://img.shields.io/badge/Documentation-GitHub_Pages-blue.svg)](https://benjaminduo.github.io/MedScience/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-Model_Context_Protocol-green.svg)](https://modelcontextprotocol.io)
[![Platform: macOS | Linux | Windows](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-purple.svg)]()

[简体中文](README.md) | **English** | [Documentation Portal](https://benjaminduo.github.io/MedScience/)

</div>

---

## 📌 Positioning

**MedScience is an open-source, evidence-anchored scientific research agent powered by real empirical data and OS-level sandboxing.**

When provided with a complex research inquiry (e.g., *"Evaluate the allosteric selectivity of TYK2 JH2 pseudokinase vs ATP catalytic domain across JAK family kinases, screen real-world FAERS safety signals, and verify active Phase III clinical trial endpoints"*), MedScience autonomously:

1. Formulates an **explicit 5-stage research plan** and live To-Do checklist.
2. Deploys an isolated **Subagent Hypothesis Tree** to explore competing targets or mechanisms in parallel.
3. Retrieves real-time data across **PubMed, arXiv, bioRxiv, Papers With Code, Hugging Face, UniProtKB, RCSB PDB, ChEMBL, PubChem, ClinicalTrials.gov v2, openFDA, RxNorm, and DailyMed**.
4. Executes Python statistical scripts, radiomics, and clinical NLP within **air-gapped OS kernel sandboxes** (macOS Seatbelt, Linux Bubblewrap, Windows Low-Integrity Tokens).
5. Validates all outputs through the **Pre-Adoption Patch Verification Gate (`EvidenceVerifier`)** (checking $p \in [0, 1]$, $IC_{50} > 0$, CT $HU \in [-1024, 3071]$, and numerical anomalies).
6. Runs a **CritiqueEngine gate** to verify PMIDs, NCT numbers, and sequence lengths.
7. Produces a publication-grade scientific report with tamper-proof **`[Evidence: EV-xxx]`** tags and an immutable **Evidence Traceability Index**.

---

## ✨ Key Architecture & Features

| Architectural Pillar | Technical Implementation |
| :--- | :--- |
| **🔍 Pre-Adoption Patch Verification Gate** | Empirical validation before admission: Python computations, kinetic constants, and radiomics statistics are strictly verified by `EvidenceVerifier` for physical sanity boundaries ($p \in [0,1]$, $IC_{50}>0$, $HU \in [-1024,3071]$) and NaN/ZeroDivision anomalies before assigning `[Evidence: EV-xxx]`. Boundary failures trigger self-correcting feedback loops. |
| **🌲 Subagent Hypothesis Tree** | Concurrent multi-hypothesis exploration: The parent agent dynamically forks isolated subagent branches to evaluate competing targets/mechanisms in parallel, computing empirical multi-factor confidence gradients and synthesizing a structured **Hypothesis Comparison Matrix**. |
| **🛡️ Formal Lifecycle Hooks Gate (`HookRegistry`)** | Non-bypassable guardrails triggered across 4 lifecycle events (`PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`): `secret-redaction` (blocks credential leaks), `evidence-verifier` (boundary checks), `clinical-data-gate` (guards EHR/DICOM data), and `evidence-completeness-check` (ensures 100% provenance). |
| **📝 Confined Workspace File Editor (`FileEditorTool`)** | In-workspace text/script modification with zero host escape: supports view, atomic str_replace, line insertion, and append strictly within session workspaces for iterative manuscript and data editing. |
| **📦 19 Domain Skills & Security Installer (`SkillInstaller`)** | Comprehensive scientific SOP library covering molecular biology, cheminformatics, statistics, MASLD RNA-seq, survival analysis, FAERS signal detection, and PRISMA systematic reviews, equipped with a static pre-install scan that refuses skills tripping its rules (Scientific Skills → Install from a URL). The scan catches obvious and careless code, not a determined author. |
| **📋 Explicit Plan & Stream Orchestration** | Transparent scientific milestones: Formulates an explicit 5-stage research plan at Turn 1, streaming live task milestones (`[✔] Completed` / `[⏳] In Progress` / `[ ] Pending`) and attached `EV-xxx` evidence anchors via EventBus to the desktop and web UI. |
| **🔒 Kernel-Level OS Sandboxing** | Multi-platform script execution isolation:<br>• **macOS**: Seatbelt kernel sandbox (`sandbox-exec`) + physical network air-gap (`(deny default)`)<br>• **Linux**: Bubblewrap / Landlock unprivileged LSM container (`bwrap --ro-bind / / --proc /proc --dev /dev --unshare-net`)<br>• **Windows**: Mandatory Integrity Control (`Low Integrity Token` + Workspace ACL) |
| **⚖️ CritiqueEngine Anti-Hallucination Gate** | Live verification of cited **PMIDs (NCBI PubMed)** and **NCT IDs (ClinicalTrials.gov)**; validates canonical sequence lengths and flags suspect fragments. |
| **🔌 Bidirectional MCP Protocol** | Exposes all 20+ scientific tools as a standard Model Context Protocol (MCP) Server for external LLM environments (Claude Desktop / Cursor / IDEs), and dynamically mounts third-party MCP servers. |

---

## 🏗️ Architecture Overview

<div align="center">
  <img src="./docs/assets/architecture.png" alt="MedScience Core Architecture" width="100%" />
</div>

---

## 🚀 Quick Start

### 1. Download the Native Desktop Application

Download pre-built builds for macOS, Windows, and Linux from the
[latest GitHub Release](https://github.com/BenjaminDuo/MedScience/releases/latest):

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `MedScience-<version>-arm64.dmg` |
| macOS (Intel) | `MedScience-<version>.dmg` |
| Windows (installer) | `MedScience.Setup.<version>.exe` |
| Windows (portable) | `MedScience-<version>-win.zip` |
| Linux (any distro) | `MedScience-<version>.AppImage` |
| Debian / Ubuntu | `medscience_<version>_amd64.deb` |

> [!NOTE]
> **First-Launch Security Notice (macOS Gatekeeper & Windows SmartScreen):**  
> Because MedScience is a community open-source project without commercial code-signing certificates, your operating system will display a standard security warning on first launch:
> - **macOS**: If you see *"MedScience cannot be opened because Apple cannot check it for malicious software"*, simply **Right-Click (or Control-Click) the application in `/Applications` and select "Open"**, then click **"Open"** in the confirmation dialog. Alternatively, navigate to *System Settings → Privacy & Security* and click *"Open Anyway"*.
> - **Windows**: If Windows SmartScreen displays *"Windows protected your PC"*, click **"More info"** and then select **"Run anyway"**.

> [!IMPORTANT]
> **Linux**: sandboxed Python execution requires `bubblewrap`. Without it MedScience **refuses** to run Python rather than running it unconfined — that refusal is deliberate. Install it with `sudo apt install bubblewrap` (or your distribution's equivalent).

### 2. Run from source

```bash
# Clone the repository
git clone https://github.com/BenjaminDuo/MedScience.git
cd MedScience

# Install dependencies
npm install

# Build all packages
npm run build

# Run the workstation in your browser
npm run web   # then open http://127.0.0.1:3000

# Or launch the Electron desktop app
npm run desktop
```

### 3. Local Web Application (no `.exe` required)

The browser UI can run against the real local MedScience runtime. The HTTP server binds to
`127.0.0.1` only; model credentials, sessions, tools, and sandboxed execution remain in the
local Node.js process and are not exposed as browser-stored secrets.

```bash
# Production-style local build and server
npm run web

# Or use Vite hot reload while developing
npm run web:dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Set `MEDSCIENCE_WEB_PORT` to use a different port.

### 4. TypeScript Core SDK Usage

```typescript
import { AutonomousResearchEngine, globalToolRegistry } from '@medscience/core';

const engine = new AutonomousResearchEngine({
  maxTurns: 16,
  modelProvider: activeModelProvider,
});

const turn = await engine.run(session, "Screen FAERS adverse event signals for Deucravacitinib");
console.log(turn.agentResponse);
```

---

## 🧪 Automated CI Test Matrix

MedScience runs full continuous integration tests across **macOS, Ubuntu Linux, and Windows** runners on GitHub Actions:

```bash
npm run build
npm test          # every core and desktop suite
```

`packages/core/tests/run-all.ts` discovers every suite under `packages/core/tests`, gives each
run a throwaway `MEDSCIENCE_HOME` so CI never writes to a real profile, and skips the suites
that need network access or a personal API key. Set `MEDSCIENCE_TEST_NETWORK=1` to include them.

---

## 🌿 Branching & Release Strategy

| Branch | Purpose | Releases as |
|---|---|---|
| `main` | Release branch | A `v*` tag → **stable release** |
| `develop` | Day-to-day development and integration | A `v*` tag → **pre-release** |

- Work lands on `develop` (or a feature branch cut from it) and is merged to `main` to be
  released.
- The test is whether the commit is on `main`, not what the branch is called, so a tag on
  any branch not yet merged to `main` is a pre-release.
- The channel is decided by CI, not by hand: if the tagged commit is on `main` it ships as a
  stable release, otherwise as a pre-release.
- A tag carrying a semver pre-release suffix (e.g. `v2.1.0-rc.1`) is always a pre-release,
  whichever branch it sits on.
- To release without pushing a tag yourself, use Actions → **MedScience Desktop Release** →
  *Run workflow*: pick the branch and enter the tag (e.g. `v2.0.0`). CI creates the tag on that
  branch's latest commit, then builds and publishes under the same rules. Leave the tag empty
  to build the installers without publishing.
- CI runs on **every branch**, so a development branch gets the same cross-platform matrix.

---

## 📄 License & Documentation

- Licensed under the [MIT License](LICENSE).
- Architectural specifications, guidelines, and notices are located in [`docs/`](docs/).
- Open Agent Conventions: [`AGENTS.md`](AGENTS.md).
- 中文版本：[README.md](README.md)。
