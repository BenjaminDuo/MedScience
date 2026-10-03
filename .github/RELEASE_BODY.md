## Four ways to run MedScience

All four run the **same engine** (`@medscience/core`) against the **same local data** in `~/.medscience/` — your workspaces, research teams, sessions, evidence and model settings. You can switch between them freely; a conversation started in the desktop app is there in the browser, and vice versa.

Nothing is sent anywhere except the model API you configure yourself.

---

### 1. macOS

Download the installer that matches your chip:

| Mac | File |
|---|---|
| Apple Silicon (M1–M4) | `MedScience-{{VERSION}}-arm64.dmg` |
| Intel | `MedScience-{{VERSION}}.dmg` |

Open the `.dmg` and drag MedScience to Applications.

> **First launch**: macOS will say *"MedScience cannot be opened because Apple cannot check it for malicious software"* — this project has no paid Apple code-signing certificate. **Right-click (or Control-click) the app in `/Applications` → Open → Open.** You only do this once. (Double-clicking will not offer the Open button; you must use the right-click menu.)

### 2. Windows

| Kind | File |
|---|---|
| Installer (recommended) | `MedScience.Setup.{{VERSION}}.exe` |
| Portable `.zip` | `MedScience-{{VERSION}}-win.zip` |

> **First launch**: SmartScreen will show *"Windows protected your PC"*. Click **More info → Run anyway**. Same reason as above — the build is unsigned.

### 3. Linux

| Kind | File | Notes |
|---|---|---|
| AppImage (any distro) | `MedScience-{{VERSION}}.AppImage` | `chmod +x MedScience-{{VERSION}}.AppImage && ./MedScience-{{VERSION}}.AppImage` |
| Debian / Ubuntu | `medscience_{{VERSION}}_amd64.deb` | `sudo dpkg -i medscience_{{VERSION}}_amd64.deb` |

> **Sandboxed Python on Linux** needs `bubblewrap`. Without it MedScience **refuses** to run Python rather than running it unconfined — that refusal is deliberate. Install it with `sudo apt install bubblewrap` (or your distro's equivalent).

### 4. Local web app — no installer

Run the full workstation in your browser. Same interface as the desktop app, minus the Electron download. Useful on a machine where you cannot install software, or on a remote box you reach over SSH.

```bash
git clone https://github.com/BenjaminDuo/MedScience.git
cd MedScience
npm install
npm run build
npm run web
```

Then open **http://127.0.0.1:3000**.

The server binds to **loopback only** and accepts same-origin requests only — it is not reachable from your network. To use a different port:

```bash
MEDSCIENCE_WEB_PORT=4000 npm run web
```

Requires **Node.js 20.19+**.

---

## After installing

1. Open **运行时（模型配置） / Runtime** in the left sidebar and add a model endpoint (any OpenAI- or Anthropic-compatible API, or a local Ollama). Keys are stored in a local AES-256-GCM vault, never in plain text.
2. Open **科研小队 / Research Teams**. Every workspace starts with one, and 26 specialists are available — type `@` in the message box to put a question to a specific one.
3. Ask something. In a plain conversation MedScience will offer the right specialist when your question clearly belongs to one.
4. Open **证据账本 / Evidence Ledger** to see what your runs found, what passed the admission gate, and how each conclusion got its current state. Importing the Retraction Watch CSV there lets MedScience flag conclusions that rest on retracted papers.

## Verifying your download

Each asset has a SHA-256 published by GitHub under **Assets**. On macOS/Linux:

```bash
shasum -a 256 MedScience-{{VERSION}}-arm64.dmg
```
