# MedScience 🧬 🔬

<div align="center">

**面向科学与生物医学发现的开源证据溯源型 AI Agent 框架**  
*(分子生物学 • 临床证据 • 医学多模态 • 操作系统级沙盒)*

[![Cross-Platform CI](https://github.com/BenjaminDuo/MedScience/actions/workflows/test.yml/badge.svg)](https://github.com/BenjaminDuo/MedScience/actions/workflows/test.yml)
[![Desktop Release](https://github.com/BenjaminDuo/MedScience/actions/workflows/release.yml/badge.svg)](https://github.com/BenjaminDuo/MedScience/actions/workflows/release.yml)
[![GitHub Pages](https://img.shields.io/badge/Documentation-GitHub_Pages-blue.svg)](https://benjaminduo.github.io/MedScience/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-Model_Context_Protocol-green.svg)](https://modelcontextprotocol.io)
[![Platform: macOS | Linux | Windows](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-purple.svg)]()

**简体中文** | [English](README-en.md) | [文档门户](https://benjaminduo.github.io/MedScience/)

</div>

---

## 📌 一句话定位

**MedScience 是一个专注于生物与医学领域的开源证据溯源型科研 Agent 框架。**

输入一个复杂的科学课题（例如 *“探讨 TYK2 变构抑制剂在红斑狼疮中的靶点选择性、真实世界 FAERS 不良反应信号与临床试验终点”*），MedScience 能够自主完成：

1. **显式制定 5 阶段调研计划**与可交互 To-Do 看板。
2. 启动**假设子 Agent 树 (`SubagentTreeEngine`)** 并发探索多候选靶点与机制假说，输出置信度梯度矩阵。
3. 跨 **PubMed、arXiv、bioRxiv、Papers With Code、Hugging Face、UniProtKB、RCSB PDB、ChEMBL、PubChem、ClinicalTrials.gov v2、openFDA、RxNorm、DailyMed** 等权威数据库实时检索。
4. 在**物理断网的操作系统内核沙盒**内（macOS Seatbelt、Linux Bubblewrap、Windows 低完整性令牌）执行 Python 统计计算、影像组学与临床 NLP。
5. 经**生成物前置严审门禁 (`EvidenceVerifier`)** 校验全部输出（$p \in [0, 1]$、$IC_{50} > 0$、CT $HU \in [-1024, 3071]$ 及数值异常）。
6. 经 **CritiqueEngine 门禁**核验 PMID、NCT 编号与序列长度的真实性。
7. 产出带有不可伪造 **`[Evidence: EV-xxx]`** 锚点与完整**证据溯源索引**的学术级调研报告。

---

## ✨ 核心架构与特性

| 架构支柱 | 技术实现 |
| :--- | :--- |
| **🔍 生成物前置严审门禁** | 入库前的实证校验：Python 计算结果、动力学常数与影像组学统计量，必须先通过 `EvidenceVerifier` 的物理合理性边界检查（$p \in [0,1]$、$IC_{50}>0$、$HU \in [-1024,3071]$）与 NaN / 除零异常检测，方可获得 `[Evidence: EV-xxx]` 编号。越界将触发自主纠错回路。 |
| **🌲 假设子 Agent 树** | 多假说并发探索：父 Agent 动态派生隔离的子 Agent 分支，并行评估相互竞争的靶点与机制，计算多因子置信度梯度，并合成结构化的**假说对比矩阵**。 |
| **🛡️ 正式生命周期 Hooks 门禁 (`HookRegistry`)** | 在 `PreToolUse`、`PostToolUse`、`SessionStart`、`Stop` 四大生命周期节点触发不可绕过的守护：`secret-redaction`（阻断凭证泄漏）、`evidence-verifier`（边界校验）、`clinical-data-gate`（守护 EHR / DICOM 数据）、`evidence-completeness-check`（确保 100% 溯源完整）。 |
| **📝 工作区受限文件编辑器 (`FileEditorTool`)** | 零宿主逃逸的工作区内文本 / 脚本修改：支持查看、原子化 str_replace、按行插入与追加，严格限定在会话工作区内，用于手稿与数据的迭代编辑。 |
| **📦 19 项领域 Skill 与安全安装器 (`SkillInstaller`)** | 覆盖分子生物学、化学信息学、统计分析、MASLD RNA-seq、生存分析、FAERS 信号检测与 PRISMA 系统综述的科研 SOP 库；安装前执行静态扫描，命中规则即拒绝安装（科研技能 → 从 URL 安装）。该扫描能拦下明显与粗心的代码，但拦不住蓄意构造的作者。 |
| **📋 显式计划与流式编排** | 透明的科研里程碑：第 1 轮即显式制定 5 阶段调研计划，通过 EventBus 向桌面端与 Web 端实时推送任务状态（`[✔] 已完成` / `[⏳] 进行中` / `[ ] 待处理`）及其挂载的 `EV-xxx` 证据锚点。 |
| **🔒 内核级操作系统沙盒** | 跨平台脚本执行隔离：<br>• **macOS**：Seatbelt 内核沙盒（`sandbox-exec`）+ 物理断网（`(deny default)`）<br>• **Linux**：Bubblewrap / Landlock 非特权 LSM 容器（`bwrap --ro-bind / / --proc /proc --dev /dev --unshare-net`）<br>• **Windows**：强制完整性控制（低完整性令牌 + 工作区 ACL） |
| **⚖️ CritiqueEngine 反幻觉门禁** | 实时核验引用的 **PMID（NCBI PubMed）** 与 **NCT ID（ClinicalTrials.gov）**，校验规范序列长度并标记可疑片段。 |
| **🔌 双向 MCP 协议** | 将全部 20+ 科研工具暴露为标准 Model Context Protocol (MCP) Server，供外部 LLM 环境（Claude Desktop / Cursor / IDE）调用；亦可动态挂载第三方 MCP Server。 |

---

## 🏗️ 系统架构总览

<div align="center">
  <img src="./docs/assets/architecture.png" alt="MedScience 核心架构" width="100%" />
</div>

---

## 🚀 快速开始

### 1. 下载原生桌面客户端

从 [最新 GitHub Release](https://github.com/BenjaminDuo/MedScience/releases/latest) 获取 macOS、Windows 与 Linux 的预编译安装包：

| 平台 | 安装包 |
|---|---|
| macOS Apple Silicon (M1–M4) | `MedScience-<版本号>-arm64.dmg` |
| macOS Intel (x86_64) | `MedScience-<版本号>.dmg` |
| Windows x64（NSIS 安装包） | `MedScience.Setup.<版本号>.exe` |
| Windows x64（便携免安装） | `MedScience-<版本号>-win.zip` |
| Linux（任意发行版） | `MedScience-<版本号>.AppImage` |
| Debian / Ubuntu | `medscience_<版本号>_amd64.deb` |

> [!NOTE]
> **首次运行安全提示（macOS Gatekeeper 与 Windows SmartScreen 放行）：**  
> MedScience 作为开源学术科研工作站，暂未购买商业企业数字签名。首次打开时系统会弹出安全拦截提示，请按以下说明快速放行：
> - **macOS 系统**：若提示 *“无法打开 MedScience，因为 Apple 无法检查其是否包含恶意软件”*，请在访达 `/Applications` 文件夹中**右键（或按住 Control 键）点击 MedScience 图标选择「打开」**，在弹窗中点击**「打开」**即可；或在 *「系统设置 → 隐私与安全性」* 页面点击 *「仍要打开」*。
> - **Windows 系统**：若弹出 SmartScreen *“Windows 已保护你的电脑”* 提示，请点击文字链接 **「更多信息」**，再点击出现的 **「仍要运行」** 按钮即可。

> [!IMPORTANT]
> **Linux 沙箱依赖**：沙箱内的 Python 执行依赖 `bubblewrap`。若系统缺少该组件，MedScience 会**拒绝**执行 Python，而不是在无隔离的状态下运行——这一拒绝是刻意设计的。请先安装：`sudo apt install bubblewrap`（或所用发行版的等效命令）。

### 2. 从源码运行

```bash
# 克隆仓库
git clone https://github.com/BenjaminDuo/MedScience.git
cd MedScience

# 安装依赖
npm install

# 编译全部工作区
npm run build

# 在浏览器中运行工作站
npm run web   # 然后访问 http://127.0.0.1:3000

# 或启动 Electron 桌面客户端
npm run desktop
```

### 3. 本地 Web 模式（无需 `.exe`）

浏览器界面直接驱动本机真实的 MedScience 运行时。HTTP 服务器**仅监听 `127.0.0.1`**；模型密钥、科研会话、工具调用与沙盒执行全部保留在本地 Node.js 进程内，不会作为明文密钥下发到浏览器存储。

```bash
# 生产模式的本地构建与服务
npm run web

# 开发时启用 Vite 热更新
npm run web:dev
```

访问 [http://127.0.0.1:3000](http://127.0.0.1:3000)。设置 `MEDSCIENCE_WEB_PORT` 可更换端口。

### 4. TypeScript 核心 SDK 用法

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

## 🧪 自动化 CI 测试矩阵

MedScience 在 GitHub Actions 的 **macOS、Ubuntu Linux 与 Windows** runner 上运行完整的持续集成测试：

```bash
npm run build
npm test          # core 与 desktop 的全部测试套件
```

`packages/core/tests/run-all.ts` 会自动发现 `packages/core/tests` 下的每个套件，为每次运行分配一个临时的 `MEDSCIENCE_HOME`（因此 CI 永远不会写入真实用户配置），并跳过需要联网或个人 API Key 的套件。设置 `MEDSCIENCE_TEST_NETWORK=1` 可将这些套件一并纳入。

---

## 🌿 分支与发布策略

| 分支 | 用途 | 发布形态 |
|---|---|---|
| `main` | 正式发布分支 | 打 `v*` tag → **正式版 Release** |
| 开发分支 | 日常开发与功能集成 | 打 `v*` tag → **预发布 (Pre-release)** |

- 所有改动先进入开发分支，经评审后再合并到 `main`。
- 发布渠道由 CI 自动判定，无需手工勾选：tag 所指提交若在 `main` 上则为正式版，否则为预发布。
- 带 semver 预发布后缀的 tag（如 `v2.1.0-rc.1`）无论在哪个分支，一律标记为预发布。
- CI 对**所有分支**的推送生效，开发分支同样受完整跨平台测试矩阵保护。

---

## 📄 许可与文档

- 本项目基于 [MIT License](LICENSE) 开源。
- 架构规范、设计说明与声明位于 [`docs/`](docs/)。
- 面向 AI 协作者的工程约定：[`AGENTS.md`](AGENTS.md)。
- English version: [README-en.md](README-en.md)。
