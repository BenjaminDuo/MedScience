import React, { useState } from 'react';
import {
  BookOpen,
  Download,
  Zap,
  Compass,
  Code2,
  FlaskConical,
  Layers,
  Cpu,
  GitPullRequest,
  History,
  Copy,
  Check,
  ShieldCheck,
  Database,
  Activity,
  Sliders,
  Lock,
} from 'lucide-react';
import { PortalSection } from '../../types/navigation';
import { useNav } from '../../context/NavContext';
import { useLanguage } from '../../context/LanguageContext';
import { useLatestRelease, RELEASES_PAGE, AssetKind } from '../../hooks/useLatestRelease';

interface PortalDocViewProps {
  section: PortalSection;
}

export const PortalDocView: React.FC<PortalDocViewProps> = ({ section }) => {
  const { setActiveSection } = useNav();
  const { language } = useLanguage();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const release = useLatestRelease();

  const isZh = language === 'zh';

  /**
   * The version the download section talks about. Until GitHub answers there
   * is no honest number to show, so the copy stays version-less rather than
   * naming one the release may not match.
   */
  const releaseLabel = release.version ? ` (v${release.version})` : '';

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  /**
   * One download tile. `kind` is resolved against the assets GitHub actually
   * published; when there is no such file -- the request failed, hit a rate
   * limit, or the release genuinely does not carry it -- the tile links to the
   * releases page and says so, so a button on this page is never a 404.
   */
  const renderDownload = (kind: AssetKind, title: string, detail: string) => {
    const url = release.urlFor(kind);
    const unresolved = release.settled && !url;
    return (
      <a
        key={kind}
        href={url || RELEASES_PAGE}
        target="_blank"
        rel="noreferrer"
        className="p-3.5 rounded-xl bg-bg-surface border border-border hover:border-accent hover:shadow-xs flex items-center justify-between group transition-all"
      >
        <div>
          <span className="font-bold text-[13.5px] text-text-primary block">{title}</span>
          <span className="text-[11px] text-text-muted">
            {unresolved ? (isZh ? '前往 Release 页面' : 'Go to releases') : detail}
          </span>
        </div>
        <Download size={16} className="text-text-muted group-hover:text-accent" />
      </a>
    );
  };

  const renderCodeBlock = (code: string, lang: string = 'bash', key: string) => (
    <div className="rounded-xl border border-border bg-[#070A10] text-[#E2E8F0] overflow-hidden my-3 shadow-xs">
      <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10 text-[11px] font-mono text-slate-400">
        <span>{lang.toUpperCase()}</span>
        <button
          onClick={() => copyToClipboard(code, key)}
          className="flex items-center gap-1 hover:text-white transition-colors"
        >
          {copiedKey === key ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          <span>{copiedKey === key ? (isZh ? '已复制' : 'Copied') : (isZh ? '复制' : 'Copy')}</span>
        </button>
      </div>
      <pre className="p-4 text-[12.5px] font-mono overflow-x-auto leading-relaxed text-left">
        <code>{code}</code>
      </pre>
    </div>
  );

  const sectionTitles: Record<PortalSection, { en: string; zh: string }> = {
    home: { en: 'Home', zh: '主页' },
    docs: { en: 'Documentation & Core Concepts', zh: '核心文档与系统概念' },
    installation: { en: 'Installation Guide', zh: '安装与部署指南' },
    quickstart: { en: 'Quick Start Tutorial', zh: '快速上手教程' },
    userguide: { en: 'User Guide & Operating Manual', zh: '用户指南与操作手册' },
    apireference: { en: 'TypeScript API Reference', zh: 'TypeScript API 参考' },
    examples: { en: 'Scientific Examples & Workflows', zh: '实践案例与科研工作流' },
    architecture: { en: 'System Architecture & Sandboxes', zh: '系统架构与安全沙箱' },
    skills: { en: 'Agent Skills Library (19 Total)', zh: '科学技能库 (共19项)' },
    contributing: { en: 'Contributing Guide', zh: '参与贡献与开发者指南' },
    changelog: { en: 'Changelog & Releases', zh: '版本更新日志' },
  };

  return (
    <div className="py-6 sm:py-10 px-4 sm:px-8 max-w-[1040px] mx-auto text-left space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-text-muted">
        <button onClick={() => setActiveSection('home')} className="hover:text-text-primary hover:underline">
          {isZh ? '主页' : 'Home'}
        </button>
        <span>/</span>
        <span className="font-medium text-text-primary">
          {sectionTitles[section] ? (isZh ? sectionTitles[section].zh : sectionTitles[section].en) : section}
        </span>
      </div>

      {/* ========================================================================= */}
      {/* SECTION: DOCS (Documentation & Core Concepts)                             */}
      {/* ========================================================================= */}
      {section === 'docs' && (
        <article className="space-y-8">
          <div className="space-y-2 border-b border-border pb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/10 text-accent font-bold text-[11px] font-mono">
              <BookOpen size={12} />
              <span>{isZh ? '科学研究自主工作站' : 'AUTONOMOUS RESEARCH WORKSTATION'}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">
              {isZh ? 'MedScience 架构总览与核心设计理念' : 'Documentation & Core Concepts'}
            </h1>
            <p className="text-[15px] text-text-secondary leading-relaxed">
              {isZh
                ? '深入了解 MedScience 的循证哲学、多假说子智能体树设计、不可绕过的生命周期守卫 Hook 与内核级隔离沙箱。'
                : 'Understand the core design philosophy, evidence-first execution model, multi-agent hypothesis tree, and hardened biomedical runtime architecture.'}
            </p>
          </div>

          <div className="space-y-6 text-[14px] text-text-secondary leading-relaxed">
            {/* Mission Statement */}
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <span>{isZh ? '1. 什么是 MedScience？' : '1. What is MedScience?'}</span>
              </h2>
              <p>
                {isZh
                  ? 'MedScience 是一套专为经验科学与生物医药发现设计的开源自主智能体工作站与多智能体框架。不同于传统仅依靠预训练知识对话的聊天机器人，MedScience 恪守严苛的科学怀疑主义原则：所有推演结论必须完全锚定在从权威数据库（UniProt、PDB、ChEMBL、ClinicalTrials.gov、openFDA 等）检索到的真实数据，或在内核隔离沙箱中由 Python 代码精确计算的数值。'
                  : 'MedScience is an autonomous, open-source scientific and biomedical research workstation and multi-agent framework. Unlike general-purpose conversational LLMs, MedScience operates with strict scientific skepticism: every synthesized finding must be anchored in verified data retrieved from authoritative databases or computed deterministically inside kernel-enforced sandboxes.'}
              </p>
              <div className="p-4 rounded-xl bg-accent/5 border border-accent/20 space-y-1.5">
                <div className="font-bold text-[13.5px] text-text-primary flex items-center gap-2">
                  <ShieldCheck size={16} className="text-accent" />
                  <span>{isZh ? '核心工程不变性 (Non-Negotiable Invariants)' : 'Core Engineering Invariants'}</span>
                </div>
                <ul className="text-[12.5px] text-text-secondary space-y-1 list-disc list-inside">
                  <li><strong>{isZh ? '科学真实性与零虚构：' : 'Scientific Integrity & Zero Hallucination: '}</strong>{isZh ? '严禁伪造文献引用、PMID、临床试验编号或蛋白质序列，所有结论必须带有 [Evidence: EV-xxx] 凭证。' : 'Never fabricate citations, PMIDs, NCT IDs, or protein sequences; all claims require immutable [Evidence: EV-xxx] tags.'}</li>
                  <li><strong>{isZh ? '临床隐私与沙箱安全：' : 'Clinical Privacy & Sandbox Isolation: '}</strong>{isZh ? '患者电子病历文本与 DICOM 原始影像必须在沙箱内部本地处理，禁止未经凭据网关向外泄露。' : 'Raw EHR text and DICOM image volumes are processed strictly inside sandboxes with ClinicalDataGate privacy enforcement.'}</li>
                  <li><strong>{isZh ? '预采纳验证前置：' : 'Pre-Adoption Verification Gate: '}</strong>{isZh ? '任何计算结果与工具输出必须通过数学与物理边界校验方能并入证据树。' : 'No computational output is admitted into the evidence tracker without passing physical and mathematical boundary tests.'}</li>
                </ul>
              </div>
            </div>

            {/* The 4 Architectural Pillars */}
            <div className="space-y-3 pt-2">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <span>{isZh ? '2. 框架三大核心支柱' : '2. The Core Architectural Pillars'}</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-3">
                <div className="p-4 rounded-xl bg-bg-surface border border-border space-y-2 shadow-2xs">
                  <Layers size={20} className="text-accent" />
                  <h3 className="font-bold text-[14px] text-text-primary">
                    {isZh ? '多假说子智能体树' : 'Subagent Hypothesis Tree'}
                  </h3>
                  <p className="text-[12px] text-text-muted leading-relaxed">
                    {isZh
                      ? 'SubagentTreeEngine 并行派生多个独立的假说探索分支，分别在隔离的证据上下文中搜集论据，多维度评估置信度并生成比对矩阵。'
                      : 'SubagentTreeEngine forks concurrent subagents to explore competing targets or mechanisms in parallel, computing multi-factor confidence scores and synthesis matrices.'}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-bg-surface border border-border space-y-2 shadow-2xs">
                  <ShieldCheck size={20} className="text-emerald-500" />
                  <h3 className="font-bold text-[14px] text-text-primary">
                    {isZh ? 'Codex 风格验证网关' : 'Pre-Adoption Verification'}
                  </h3>
                  <p className="text-[12px] text-text-muted leading-relaxed">
                    {isZh
                      ? 'EvidenceVerifier 在证据被正式接纳前，严格审计物理与数学合法性（例如 p ∈ [0, 1]、IC50 > 0、HU ∈ [-1024, 3071]），杜绝异常溢出。'
                      : 'EvidenceVerifier enforces physical and mathematical boundary checks (p ∈ [0, 1], IC50 > 0, HU ∈ [-1024, +3071], NaN/Inf detection) prior to evidence adoption.'}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-bg-surface border border-border space-y-2 shadow-2xs">
                  <Activity size={20} className="text-purple-500" />
                  <h3 className="font-bold text-[14px] text-text-primary">
                    {isZh ? '形式化生命周期守卫' : 'Formal Lifecycle Guardrails'}
                  </h3>
                  <p className="text-[12px] text-text-muted leading-relaxed">
                    {isZh
                      ? 'HookRegistry 在 PreToolUse、PostToolUse、SessionStart 和 Stop 四个生命周期节点触发不可绕过的安全与完备性审计。'
                      : 'HookRegistry executes non-bypassable guardrails at PreToolUse (secret redaction, clinical data gate), PostToolUse, and Stop (evidence completeness checking).'}
                  </p>
                </div>
              </div>
            </div>

            {/* Monorepo Architecture */}
            <div className="space-y-3 pt-2">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <span>{isZh ? '3. 单体多包工程架构 (Monorepo)' : '3. Monorepo Architecture'}</span>
              </h2>
              <p>
                {isZh
                  ? 'MedScience 采用模块化解耦的 npm workspaces 结构，核心运行引擎、桌面客户端、本地 Web 服务与文档门户职责清晰：'
                  : 'MedScience is structured as an npm workspaces monorepo separating the core scientific runtime, the desktop application, the local web server, the docs portal, and standardized OpenScience skills:'}
              </p>
              <div className="overflow-x-auto rounded-xl border border-border bg-bg-surface shadow-xs">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="bg-bg-elevated/70 border-b border-border text-text-muted font-mono text-[11px]">
                    <tr>
                      <th className="p-3">Package / Directory</th>
                      <th className="p-3">Description</th>
                      <th className="p-3">Key Responsibilities</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="p-3 font-mono font-bold text-accent">packages/core</td>
                      <td className="p-3 text-text-secondary">{isZh ? '核心运行时引擎与底层工具包' : 'Core runtime engine & tools'}</td>
                      <td className="p-3 text-text-muted">{isZh ? 'ReAct循环、EvidenceVerifier、SubagentTreeEngine、生命周期Hook、沙箱' : 'Research loop, EvidenceVerifier, SubagentTree, Hooks, Sandboxes'}</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono font-bold text-accent">packages/desktop</td>
                      <td className="p-3 text-text-secondary">{isZh ? '跨平台学术桌面工作站' : 'Electron desktop application'}</td>
                      <td className="p-3 text-text-muted">{isZh ? 'Electron 28 + React 18，多栏工作区、假说树可视化与报告导出' : 'Native workspace UI, real-time PlanTracker, hypothesis graph'}</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono font-bold text-accent">packages/web</td>
                      <td className="p-3 text-text-secondary">{isZh ? '仅回环的本地 Web 工作站' : 'Loopback-only local web server'}</td>
                      <td className="p-3 text-text-muted">{isZh ? '以 npm run web 在浏览器中运行同一界面，密钥与沙盒留在 Node 进程内' : 'Serves the same UI in a browser via npm run web; keys and sandboxes stay in Node'}</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono font-bold text-accent">packages/portal</td>
                      <td className="p-3 text-text-secondary">{isZh ? '文档门户与官网' : 'Documentation portal & site'}</td>
                      <td className="p-3 text-text-muted">{isZh ? '中英双语文档站，由 CI 构建并发布至 GitHub Pages' : 'Bilingual docs site, built in CI and deployed to GitHub Pages'}</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono font-bold text-accent">skills/</td>
                      <td className="p-3 text-text-secondary">{isZh ? '标准领域 SOP 技能仓库' : 'Standard OpenScience skill repo'}</td>
                      <td className="p-3 text-text-muted">{isZh ? '19项涵盖生物、化学、临床与文献的标准化 SKILL.md 与执行脚本' : '19 domain-specific skills with scripts, SKILL.md, and examples'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </article>
      )}

      {/* ========================================================================= */}
      {/* SECTION: QUICKSTART                                                       */}
      {/* ========================================================================= */}
      {section === 'quickstart' && (
        <article className="space-y-8">
          <div className="space-y-2 border-b border-border pb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/10 text-accent font-bold text-[11px] font-mono">
              <Zap size={12} />
              <span>{isZh ? '快速开始教程' : 'GETTING STARTED'}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">
              {isZh ? '快速上手指南 (Quick Start)' : 'Quick Start Tutorial'}
            </h1>
            <p className="text-[15px] text-text-secondary leading-relaxed">
              {isZh
                ? '在2分钟内安装并启动 MedScience，发起您的第一个循证科研推演循环。'
                : 'Install and launch MedScience in under 2 minutes, and run an evidence-anchored scientific research loop.'}
            </p>
          </div>

          <div className="space-y-6 text-[14px] text-text-secondary leading-relaxed">
            {/* 1. Prerequisites */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <span>{isZh ? '1. 环境准备 (Prerequisites)' : '1. Prerequisites'}</span>
              </h2>
              <p>
                {isZh
                  ? 'MedScience 设计为即开即用，依赖轻量：'
                  : 'MedScience requires minimal local system prerequisites:'}
              </p>
              <ul className="list-disc list-inside space-y-1 text-[13px] text-text-secondary">
                <li><strong>Node.js:</strong> v20.x 或 v22.x LTS ({isZh ? '推荐 Node 22' : 'recommended Node 22'})</li>
                <li><strong>Python:</strong> v3.10+ ({isZh ? '用于沙箱内统计计算与特征提取' : 'for sandboxed scientific data computation'})</li>
                <li><strong>Git:</strong> {isZh ? '用于代码检出与三方技能安装' : 'for repository management and skill installs'}</li>
              </ul>
            </div>

            {/* 2. Installation */}
            <div className="space-y-3 pt-2">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <span>{isZh ? '2. 快速安装' : '2. Quick Installation'}</span>
              </h2>
              <div className="space-y-2">
                <div className="text-[13px] font-semibold text-text-primary">{isZh ? '方式 A：桌面客户端' : 'Option A: Desktop App'}</div>
                <p className="text-[12.5px] text-text-secondary leading-relaxed">
                  {isZh
                    ? '从 GitHub Releases 下载 macOS / Windows / Linux 安装包，开箱即用。'
                    : 'Download the macOS, Windows, or Linux build from GitHub Releases — nothing else to set up.'}
                </p>

                <div className="text-[13px] font-semibold text-text-primary pt-2">{isZh ? '方式 B：本地 Web 工作站' : 'Option B: Local Web Workstation'}</div>
                {renderCodeBlock(
                  `git clone https://github.com/BenjaminDuo/MedScience.git\ncd MedScience\nnpm install && npm run build\nnpm run web`,
                  'bash',
                  'qs-web'
                )}
              </div>
            </div>

            {/* 3. Step-by-Step Research Session */}
            <div className="space-y-4 pt-2">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <span>{isZh ? '3. 实践演练：完成首个激酶别构选择性课题' : '3. Walkthrough: Answering a Real-World Biomedical Inquiry'}</span>
              </h2>
              <p>
                {isZh
                  ? '让我们通过一个真实的生物医药案例，走完从模型配置到证据入库的全过程：'
                  : 'Follow a real-world pharmaceutical discovery inquiry from model setup through to a verified evidence record:'}
              </p>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-bg-surface border border-border">
                  <span className="font-bold text-[13px] text-accent block mb-1">
                    {isZh ? '第一步：配置模型端点' : 'Step 1: Configure a Model Endpoint'}
                  </span>
                  <p className="text-[12.5px] text-text-muted mb-2">
                    {isZh
                      ? '在左侧边栏打开「运行时（模型配置）」，添加任意 OpenAI 或 Anthropic 协议兼容的端点（亦可指向本地 Ollama）。API Key 存入本地 AES-256-GCM 密钥库，不以明文落盘；内置离线科学 Mock 服务可在不配置任何密钥的情况下直接试用。'
                      : 'Open Runtime (Model Configuration) in the left sidebar and add any OpenAI- or Anthropic-compatible endpoint — a local Ollama works too. Keys go into a local AES-256-GCM vault, never plain text. The offline scientific mock provider lets you try the workflow with no key at all.'}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-bg-surface border border-border">
                  <span className="font-bold text-[13px] text-purple-500 block mb-1">
                    {isZh ? '第二步：提出研究课题，智能体先出计划' : 'Step 2: Ask the Question — the Agent Plans First'}
                  </span>
                  <p className="text-[12.5px] text-text-muted mb-2">
                    {isZh
                      ? '在工作区新建对话并输入课题。智能体会先拆解靶点与文献，产出 5 阶段里程碑计划（TASK-1 至 TASK-5），并经 EventBus 实时流式呈现：'
                      : 'Start a conversation in a workspace and enter your query. The agent decomposes targets and literature into a 5-stage milestone plan (TASK-1 to TASK-5), streamed live through the EventBus:'}
                  </p>
                  {renderCodeBlock(
                    `Investigate TYK2 JH2 allosteric pseudokinase binding vs JAK1/2/3 catalytic domain for Deucravacitinib`,
                    'text',
                    'qs-step2'
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-bg-surface border border-border">
                  <span className="font-bold text-[13px] text-emerald-500 block mb-1">
                    {isZh ? '第三步：工具自主执行与证据入库审查' : 'Step 3: Autonomous Tool Execution & the Evidence Gate'}
                  </span>
                  <p className="text-[12.5px] text-text-muted mb-2">
                    {isZh
                      ? '智能体自主调用 UniProt、ChEMBL 与 Python 沙箱执行统计拟合；每一项结果都须通过 EvidenceVerifier 的物理边界审查方可入库：'
                      : 'The agent autonomously queries UniProt and ChEMBL, computes fold selectivity in the Python sandbox, and admits nothing into the evidence tracker until EvidenceVerifier clears its physical bounds:'}
                  </p>
                  {renderCodeBlock(
                    `[TOOL] uniprot_fetch(P29597) -> 1187 aa sequence [EV-001]\n[TOOL] chembl_query(target: "TYK2", drug: "Deucravacitinib") -> IC50 = 12.8 nM [EV-002]\n[SANDBOX] Running Python fold selectivity script...\n[VERIFIER] Pre-adoption gate passed: IC50 > 0, p < 0.001. Digest: sha256:7f4a...`,
                    'text',
                    'qs-step3'
                  )}
                </div>
              </div>
            </div>
          </div>
        </article>
      )}

      {/* ========================================================================= */}
      {/* SECTION: USER GUIDE                                                       */}
      {/* ========================================================================= */}
      {section === 'userguide' && (
        <article className="space-y-8">
          <div className="space-y-2 border-b border-border pb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/10 text-accent font-bold text-[11px] font-mono">
              <Compass size={12} />
              <span>{isZh ? '操作使用指南' : 'USER MANUAL'}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">
              {isZh ? '用户指南与高级操作手册' : 'User Guide & Operating Manual'}
            </h1>
            <p className="text-[15px] text-text-secondary leading-relaxed">
              {isZh
                ? '详尽的科研工作流操作手册，涵盖双工作模式、工具生态、隔离工作区文件编辑器、证据链导出与Token成本控制。'
                : 'Comprehensive operational manual covering dual execution modes, scientific tool ecosystems, in-workspace file editing, and evidence export.'}
            </p>
          </div>

          <div className="space-y-6 text-[14px] text-text-secondary leading-relaxed">
            {/* 1. Which runtime handles a request */}
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <Sliders size={18} className="text-accent" />
                <span>{isZh ? '1. 选择承载本次请求的运行时' : '1. Choosing Which Runtime Handles a Request'}</span>
              </h2>
              <p>
                {isZh
                  ? '消息框左侧的运行时选择器决定这一次提问由谁执行。该选择仅作用于本次提交，设置中的全局默认不受影响：'
                  : 'The runtime picker beside the composer decides who executes a given prompt. The choice applies to that one submission; the globally active profile in Settings is left untouched:'}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2">
                <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-500/5 space-y-2">
                  <span className="font-bold text-[13.5px] text-purple-600 dark:text-purple-400 font-mono">{isZh ? '云端模型 (api)' : 'Cloud model (api)'}</span>
                  <p className="text-[12.5px] text-text-secondary">
                    {isZh
                      ? '由您配置的模型端点驱动 MedScience 自身的 ReAct 研究循环：分子与临床连接器、Python 沙箱、假说树（SubagentTreeEngine）与 5 阶段计划（TASK-1 至 TASK-5）全部在本进程内运行。'
                      : 'Your configured model endpoint drives MedScience’s own ReAct research loop: molecular and clinical connectors, the Python sandbox, SubagentTreeEngine, and the 5-stage plan (TASK-1 to TASK-5) all run in-process.'}
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                  <span className="font-bold text-[13.5px] text-emerald-600 dark:text-emerald-400 font-mono">{isZh ? '本地运行时 (local-runtime)' : 'Local runtime (local-runtime)'}</span>
                  <p className="text-[12.5px] text-text-secondary">
                    {isZh
                      ? '将执行委派给本机上已安装的编码运行时（如 Codex App Server），并带有两档沙箱预设：只读，或可写当前工作区。越权操作会以审批卡片的形式交由您裁决。'
                      : 'Delegates execution to a coding runtime installed on your machine (for example the Codex App Server), under one of two sandbox presets — read-only, or workspace-write. Anything beyond the preset surfaces as an approval card for you to decide.'}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Tool Ecosystem */}
            <div className="space-y-3 pt-2">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <Database size={18} className="text-accent" />
                <span>{isZh ? '2. 科学数据与计算工具生态' : '2. Scientific Tool Ecosystem'}</span>
              </h2>
              <p>
                {isZh
                  ? '核心包内置经过加固与物理边界检测的权威科学连接器：'
                  : 'MedScience ships with hardened, production-tested scientific database connectors:'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-bg-surface border border-border">
                  <span className="font-bold text-[13px] text-text-primary block mb-1">UniProt &amp; PDB Connectors</span>
                  <p className="text-[12px] text-text-muted">{isZh ? '检索完整氨基酸序列、拓扑结构域、活性口袋位点与 PDB 晶体坐标。' : 'Fetches full protein sequences, domain annotations, and PDB coordinate structures.'}</p>
                </div>
                <div className="p-3 rounded-xl bg-bg-surface border border-border">
                  <span className="font-bold text-[13px] text-text-primary block mb-1">ChEMBL &amp; PubChem Connectors</span>
                  <p className="text-[12px] text-text-muted">{isZh ? '查询生物活性实验数据（IC50、Ki、Kd）、化合物 SMILES、Lipinski 五规则参数。' : 'Queries bioactivity assay records (IC50, Ki, Kd), chemical structures, and ADMET profiles.'}</p>
                </div>
                <div className="p-3 rounded-xl bg-bg-surface border border-border">
                  <span className="font-bold text-[13px] text-text-primary block mb-1">ClinicalTrials.gov &amp; openFDA</span>
                  <p className="text-[12px] text-text-muted">{isZh ? '基于 API v2 检索入组排查标准；从 FAERS 提取不良反应并计算 PRR / ROR 信号。' : 'Parses ClinicalTrials.gov v2 protocols and detects FAERS disproportionality signals.'}</p>
                </div>
                <div className="p-3 rounded-xl bg-bg-surface border border-border">
                  <span className="font-bold text-[13px] text-text-primary block mb-1">Confined FileEditorTool</span>
                  <p className="text-[12px] text-text-muted">{isZh ? '隔离工作区文件编辑器，支持精确的字符串替换、多行插入与查看，严防宿主逃逸。' : 'Confined workspace editor for inspecting, replacing, and appending script contents safely.'}</p>
                </div>
              </div>
            </div>

            {/* 3. Evidence Management */}
            <div className="space-y-3 pt-2">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <ShieldCheck size={18} className="text-accent" />
                <span>{isZh ? '3. 证据锚点与上下文自动压缩' : '3. Evidence Anchors & Memory Management'}</span>
              </h2>
              <p>
                {isZh
                  ? '所有被智能体采纳的科学论据都会生成唯一的 EV-xxx 锚点。在长周期研究任务中，当上下文长度接近模型上限时，MemoryCompactor 会自动压缩冗余对话，但 100% 完整保留所有证据锚点、原始数据哈希与边界检验结果——无需任何手动指令。每个工作区的「证据登记簿」可随时查阅全部锚点，「运行时（模型配置）」页面则按端点列出 Token 消耗。'
                  : 'Every verified data point receives a unique immutable EV-xxx tag. As a long session approaches the model’s context limit, MemoryCompactor folds away conversational clutter on its own — no command to run — while preserving every evidence anchor, raw-data digest, and bounds-check result. Each workspace’s Evidence Registry lists those anchors, and Runtime (Model Configuration) reports token usage per endpoint.'}
              </p>
            </div>
          </div>
        </article>
      )}

      {/* ========================================================================= */}
      {/* SECTION: EXAMPLES                                                         */}
      {/* ========================================================================= */}
      {section === 'examples' && (
        <article className="space-y-8">
          <div className="space-y-2 border-b border-border pb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/10 text-accent font-bold text-[11px] font-mono">
              <FlaskConical size={12} />
              <span>{isZh ? '科研实战范例' : 'END-TO-END BENCHMARKS'}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">
              {isZh ? '真实科学研究端到端范例' : 'Scientific Examples & Workflows'}
            </h1>
            <p className="text-[15px] text-text-secondary leading-relaxed">
              {isZh
                ? '以下精选了4个跨生物医药、临床流行病学、临床试验入排匹配与多模态影像组学的端到端实际课题案例。'
                : 'Explore 4 complete, publication-grade scientific research workflows with exact prompts, tool invocation traces, and verified outputs.'}
            </p>
          </div>

          <div className="space-y-6 text-[14px] text-text-secondary leading-relaxed">
            {/* Example 1: Kinase Selectivity */}
            <div className="p-5 rounded-2xl bg-bg-surface border border-border space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-blue-500 text-white">CASE 1</span>
                  <h3 className="font-bold text-[15px] text-text-primary">
                    {isZh ? '靶点成药性与激酶别构选择性分析 (TYK2 JH2 vs JAK1/2/3)' : 'Target Druggability & Kinase Allosteric Selectivity Profiling'}
                  </h3>
                </div>
                <span className="text-[11px] text-accent font-mono">Molecular Biology</span>
              </div>
              <p className="text-[13px] text-text-secondary">
                <strong>{isZh ? '科学背景与问题：' : 'Scientific Inquiry: '}</strong>
                {isZh
                  ? '第一代 JAK 抑制剂（如托法替布）由于靶向高度保守的 ATP 催化活性中心，往往导致贫血和脂质代谢紊乱等泛 JAK 毒性。分析新型口服抑制剂德克伐替尼 (Deucravacitinib) 对 TYK2 调节结构域 (JH2 假激酶) 与 JAK1/2/3 催化域的选择性差异。'
                  : 'Evaluate the allosteric selectivity of Deucravacitinib binding to the TYK2 JH2 pseudokinase domain versus the ATP catalytic active sites of JAK1, JAK2, and JAK3.'}
              </p>
              <div className="p-3 rounded-lg bg-bg-elevated/60 font-mono text-[12px] space-y-1">
                <div className="text-slate-400"># Tool Execution Sequence:</div>
                <div className="text-accent">&gt; uniprot_fetch(accession: &quot;P29597&quot;) -&gt; Extracts JH2 domain residues (505-779) [EV-001]</div>
                <div className="text-accent">&gt; chembl_assay(target: &quot;TYK2&quot;, molecule: &quot;CHEMBL4297893&quot;) -&gt; IC50 = 12.8 nM [EV-002]</div>
                <div className="text-accent">&gt; chembl_assay(target: &quot;JAK1&quot;, molecule: &quot;CHEMBL4297893&quot;) -&gt; IC50 &gt; 10,000 nM [EV-003]</div>
                <div className="text-emerald-500 font-semibold">&gt; verifier_gate: Fold selectivity = 10000 / 12.8 = 781.25x. Boundaries verified.</div>
              </div>
              <p className="text-[12.5px] text-text-muted">
                {isZh
                  ? '结论：德克伐替尼通过精确锁定 TYK2 独特的 JH2 假激酶变构口袋，实现了相比 JAK1/2/3 催化域超 700 倍的选择性窗口，避免了造血抑制不良反应。'
                  : 'Conclusion: Deucravacitinib achieves >700-fold functional selectivity by exclusively stabilizing the inactive JH2 pseudokinase domain of TYK2, eliminating cross-reactivity with JAK1/2/3.'}
              </p>
            </div>

            {/* Example 2: FAERS Pharmacovigilance */}
            <div className="p-5 rounded-2xl bg-bg-surface border border-border space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-emerald-600 text-white">CASE 2</span>
                  <h3 className="font-bold text-[15px] text-text-primary">
                    {isZh ? 'FDA FAERS 药物警戒信号检测 (GLP-1 受体激动剂)' : 'FDA FAERS Pharmacovigilance & Disproportionality Signal Screening'}
                  </h3>
                </div>
                <span className="text-[11px] text-emerald-500 font-mono">Pharmacovigilance</span>
              </div>
              <p className="text-[13px] text-text-secondary">
                <strong>{isZh ? '科学背景与问题：' : 'Scientific Inquiry: '}</strong>
                {isZh
                  ? '从美国 FDA 不良事件报告系统 (FAERS) 抓取数百万份自发报告，构建四格表并评估 GLP-1 受体激动剂（司美格鲁肽、替尔泊肽）与胃轻瘫/消化道梗阻的不良事件比例报告比 (PRR) 及报告比值比 (ROR)。'
                  : 'Screen FDA FAERS spontaneous reports for GLP-1 receptor agonists and compute Proportional Reporting Ratios (PRR) and Reporting Odds Ratios (ROR) for gastroparesis.'}
              </p>
              <div className="p-3 rounded-lg bg-bg-elevated/60 font-mono text-[12px] space-y-1">
                <div className="text-slate-400"># Statistical Execution Trace:</div>
                <div className="text-accent">&gt; openfda_faers(drug: &quot;SEMAGLUTIDE&quot;, reaction: &quot;GASTROPARESIS&quot;) -&gt; n = 412 [EV-010]</div>
                <div className="text-accent">&gt; python_runner: Contingency table [[412, 38102], [2890, 4210990]]</div>
                <div className="text-emerald-500 font-semibold">&gt; PRR = 2.84 (95% CI: 2.58 - 3.12), Chi-Square = 289.4 (p &lt; 1e-12) [EV-011]</div>
              </div>
              <p className="text-[12.5px] text-text-muted">
                {isZh
                  ? '结论：PRR > 2.0 且卡方值远超阈值 4.0，证实存在显著的胃肠动力迟缓药物警戒信号，需在临床处方中给予重点警示。'
                  : 'Conclusion: PRR > 2.0 with lower 95% CI > 1.0 confirms a statistically robust disproportionality signal warranting clinical monitoring.'}
              </p>
            </div>

            {/* Example 3: Clinical Trial Eligibility */}
            <div className="p-5 rounded-2xl bg-bg-surface border border-border space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-purple-600 text-white">CASE 3</span>
                  <h3 className="font-bold text-[15px] text-text-primary">
                    {isZh ? '临床试验方案入排智能匹配 (MAESTRO-NASH NCT03900429)' : 'Clinical Trial Protocol Matching & Eligibility Screening'}
                  </h3>
                </div>
                <span className="text-[11px] text-purple-500 font-mono">Clinical Trials</span>
              </div>
              <p className="text-[13px] text-text-secondary">
                <strong>{isZh ? '科学背景与问题：' : 'Scientific Inquiry: '}</strong>
                {isZh
                  ? '解析非酒精性脂肪性肝炎 (MASH) 首款获批药物瑞司美替罗 (Resmetirom) 的 III 期核心临床试验 (NCT03900429) 方案，自动将多中心患者队列的实验室生化指标与肝纤维化评分（FibroScan LSM）与入组标准对齐。'
                  : 'Parse Phase 3 protocol NCT03900429 (Resmetirom in MASH) and match patient cohort liver stiffness measurements against inclusion criteria.'}
              </p>
              <div className="p-3 rounded-lg bg-bg-elevated/60 font-mono text-[12px] space-y-1">
                <div className="text-slate-400"># Matching Engine Trace:</div>
                <div className="text-accent">&gt; clinicaltrials_v2(nctId: &quot;NCT03900429&quot;) -&gt; Parsed 14 inclusion / 22 exclusion rules [EV-020]</div>
                <div className="text-accent">&gt; python_runner: Evaluated cohort n=150. LSM threshold &gt;= 8.5 kPa &amp; CAP &gt;= 280 dB/m.</div>
                <div className="text-emerald-500 font-semibold">&gt; Match Result: 42/150 patients eligible (28.0%). Zero inclusion violations.</div>
              </div>
              <p className="text-[12.5px] text-text-muted">
                {isZh
                  ? '结论：自动化规则匹配引擎将传统需数周的人工病历复审缩短至秒级，并输出每个候选患者的合格证据卡片。'
                  : 'Conclusion: Automated eligibility verification drastically accelerates trial cohort recruitment with zero violation risk.'}
              </p>
            </div>

            {/* Example 4: Multimodal Radiomics */}
            <div className="p-5 rounded-2xl bg-bg-surface border border-border space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-amber-600 text-white">CASE 4</span>
                  <h3 className="font-bold text-[15px] text-text-primary">
                    {isZh ? '隐私隔离沙箱内的多模态影像组学定量 (CT 肝脏衰减 HU)' : 'Multimodal Radiomics & Tissue Attenuation in Privacy Sandbox'}
                  </h3>
                </div>
                <span className="text-[11px] text-amber-500 font-mono">Radiomics & Privacy</span>
              </div>
              <p className="text-[13px] text-text-secondary">
                <strong>{isZh ? '科学背景与问题：' : 'Scientific Inquiry: '}</strong>
                {isZh
                  ? '针对腹部 CT DICOM 序列提取肝实质 Hounsfield 衰减单位 (HU)，并在严格隔离的沙箱内计算灰度共生矩阵 (GLCM) 纹理特征，全程受 ClinicalDataGate 拦截保护，禁止向公网发送患者敏感影像。'
                  : 'Extract quantitative hepatic Hounsfield Units (HU) and GLCM texture metrics inside the local sandbox under ClinicalDataGate protection.'}
              </p>
              <div className="p-3 rounded-lg bg-bg-elevated/60 font-mono text-[12px] space-y-1">
                <div className="text-slate-400"># Sandbox Privacy & Computation Trace:</div>
                <div className="text-accent">&gt; ClinicalDataGate: DICOM image volume intercepted. Public network blocked.</div>
                <div className="text-accent">&gt; sandbox_exec(python): Computing hepatic attenuation in isolated macOS Seatbelt...</div>
                <div className="text-emerald-500 font-semibold">&gt; verifier_gate: Mean attenuation = 38.2 HU (HU in [-1024, 3071] valid). Steatosis confirmed.</div>
              </div>
              <p className="text-[12.5px] text-text-muted">
                {isZh
                  ? '结论：肝实质衰减低于脾脏（<40 HU），精确诊断中度脂肪肝浸润，同时保证了零隐私泄漏风险。'
                  : 'Conclusion: Hepatic attenuation < 40 HU confirms steatosis while preserving 100% patient radiological privacy.'}
              </p>
            </div>
          </div>
        </article>
      )}

      {/* ========================================================================= */}
      {/* SECTION: ARCHITECTURE                                                     */}
      {/* ========================================================================= */}
      {section === 'architecture' && (
        <article className="space-y-8">
          <div className="space-y-2 border-b border-border pb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/10 text-accent font-bold text-[11px] font-mono">
              <Layers size={12} />
              <span>{isZh ? '底层架构与沙箱' : 'HARDENED RUNTIME'}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">
              {isZh ? '系统架构与操作系统内核安全沙箱' : 'Architecture & Security Sandboxing'}
            </h1>
            <p className="text-[15px] text-text-secondary leading-relaxed">
              {isZh
                ? '剖析 MedScience 的分层设计、跨平台操作系统内核沙箱（macOS Seatbelt、Linux Bubblewrap、Windows MIC）以及形式化生命周期守卫。'
                : 'Deep dive into OS kernel isolation, multi-harness design, formal verification gates, and patient data privacy.'}
            </p>
          </div>

          <div className="space-y-6 text-[14px] text-text-secondary leading-relaxed">
            {/* Architecture Diagram */}
            <div className="rounded-xl overflow-hidden border border-border shadow-xs bg-bg-surface p-2">
              <img
                src={`${import.meta.env.BASE_URL}screenshots/architecture.png`}
                alt="MedScience Core Architecture"
                className="w-full rounded-lg"
              />
            </div>

            {/* 1. Layered Architecture */}
            <div className="space-y-3 pt-2">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <span>{isZh ? '1. 分层架构规范' : '1. Layered Architecture Overview'}</span>
              </h2>
              <div className="space-y-2">
                <div className="p-3.5 rounded-xl bg-bg-surface border border-border">
                  <span className="font-bold text-[13.5px] text-accent block mb-1">
                    {isZh ? '第1层：交互展示层 (UI & Interaction Layer)' : 'Layer 1: UI & Interaction Layer'}
                  </span>
                  <p className="text-[12.5px] text-text-muted">
                    {isZh
                      ? '包含 Electron 原生学术桌面工作站（多栏工作区、实时计划看板、证据卡片、科研小队群聊）与仅监听回环地址的本地 Web 工作站——两者共用同一套渲染界面。'
                      : 'The native Electron desktop workstation (multi-pane workspaces, live plan board, evidence cards, group-chat research teams) and the loopback-only local web workstation, which serve the same renderer.'}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-bg-surface border border-border">
                  <span className="font-bold text-[13.5px] text-purple-500 block mb-1">
                    {isZh ? '第2层：科研调度核心层 (Core Orchestration Engine)' : 'Layer 2: Core Orchestration Engine'}
                  </span>
                  <p className="text-[12.5px] text-text-muted">
                    {isZh
                      ? '由 AutonomousResearchEngine、SubagentTreeEngine、PlanTracker 和 CritiqueEngine 构成，负责多假说并发分支管理与里程碑广播。'
                      : 'Features AutonomousResearchEngine, SubagentTreeEngine, PlanTracker, and CritiqueEngine for multi-branch hypothesis exploration.'}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-bg-surface border border-border">
                  <span className="font-bold text-[13.5px] text-emerald-500 block mb-1">
                    {isZh ? '第3层：形式化守卫 Hook 层 (Formal Guardrails Layer)' : 'Layer 3: Formal Guardrails Layer'}
                  </span>
                  <p className="text-[12.5px] text-text-muted">
                    {isZh
                      ? 'HookRegistry 在 PreToolUse、PostToolUse、SessionStart、Stop 生命周期节点执行脱敏、边界验证、隐私审计与完备性检测。'
                      : 'Deterministic, non-bypassable hooks executing secret redaction, EvidenceVerifier mathematical gates, and completeness checks.'}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-bg-surface border border-border">
                  <span className="font-bold text-[13.5px] text-amber-500 block mb-1">
                    {isZh ? '第4层：工具执行与内核沙箱层 (Execution & Sandbox Layer)' : 'Layer 4: Tools & Kernel Sandbox Layer'}
                  </span>
                  <p className="text-[12.5px] text-text-muted">
                    {isZh
                      ? '生物医药连接器、工作区安全文件编辑器 (FileEditorTool) 以及基于操作系统原生内核隔离的 Python 执行沙箱。'
                      : 'Hardened database connectors, workspace file editor, and kernel-isolated Python computation environments.'}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. OS Kernel Sandboxes */}
            <div className="space-y-3 pt-2">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <Lock size={18} className="text-accent" />
                <span>{isZh ? '2. 跨平台操作系统内核沙箱' : '2. Multi-Platform OS Kernel Sandboxes'}</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-2">
                <div className="p-4 rounded-xl bg-bg-surface border border-border space-y-1.5 shadow-2xs">
                  <span className="font-bold text-[13.5px] text-text-primary block">macOS Seatbelt</span>
                  <p className="text-[12px] text-text-muted leading-relaxed">
                    {isZh
                      ? '基于 sandbox-exec 内核级策略，通过 (deny default) 拦截所有未授权网络通信与工作区外文件读写。'
                      : 'Enforces sandbox-exec kernel policies denying network and host filesystem access for Python computation.'}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-bg-surface border border-border space-y-1.5 shadow-2xs">
                  <span className="font-bold text-[13.5px] text-text-primary block">Linux Bubblewrap</span>
                  <p className="text-[12px] text-text-muted leading-relaxed">
                    {isZh
                      ? '基于非特权用户命名空间隔离，执行 bwrap --ro-bind / / --proc /proc --unshare-net，杜绝越权风险。'
                      : 'Unprivileged containerization via bwrap --ro-bind / / --proc /proc --unshare-net with zero host escalation.'}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-bg-surface border border-border space-y-1.5 shadow-2xs">
                  <span className="font-bold text-[13.5px] text-text-primary block">Windows MIC</span>
                  <p className="text-[12px] text-text-muted leading-relaxed">
                    {isZh
                      ? '通过强制完整性控制 (Low Integrity Token) 结合工作区继承性 ACL 限制，杜绝系统敏感目录访问。'
                      : 'Mandatory Integrity Control (Low Integrity Token) + restricted workspace ACL directory isolation.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </article>
      )}

      {/* ========================================================================= */}
      {/* SECTION: AGENT SKILLS                                                     */}
      {/* ========================================================================= */}
      {section === 'skills' && (
        <article className="space-y-8">
          <div className="space-y-2 border-b border-border pb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/10 text-accent font-bold text-[11px] font-mono">
              <Cpu size={12} />
              <span>{isZh ? '科学领域技能库' : 'DOMAIN SOP REPOSITORY'}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">
              {isZh ? 'MedScience 科学技能库 (共19项)' : 'Scientific Skills & SOP Library (19 Total)'}
            </h1>
            <p className="text-[15px] text-text-secondary leading-relaxed">
              {isZh
                ? '标准化科研操作流程 (SOPs)，内置沙箱执行脚本、数学边界检验与真实数据校验。'
                : 'Standard Operating Procedures packaged as domain-specific skills with sandboxed scripts and empirical evidence verification.'}
            </p>
          </div>

          <div className="space-y-6 text-[14px] text-text-secondary leading-relaxed">
            {/* Skill management */}
            <div className="p-4 rounded-xl bg-accent/5 border border-accent/20 space-y-2">
              <div className="font-bold text-[13.5px] text-text-primary flex items-center gap-2">
                <Cpu size={16} className="text-accent" />
                <span>{isZh ? '技能管理与静态安全扫描' : 'Skill Management & Security Auditing'}</span>
              </div>
              <p className="text-[12.5px] text-text-secondary">
                {isZh
                  ? 'MedScience 兼容 OpenScience SKILL.md 标准规范。在侧边栏「科研技能」页面粘贴技能仓库地址即可安装；SkillInstaller 会先执行针对 RCE、路径穿越与守卫绕过的静态安全代码审计，审查不通过则拒绝安装：'
                  : 'MedScience follows the OpenScience SKILL.md convention. Paste a skill repository URL into the Scientific Skills page in the sidebar; SkillInstaller runs a static audit for code injection, path traversal, and guardrail bypass first, and refuses the install if the audit fails:'}
              </p>
              {renderCodeBlock(
                `https://github.com/OpenScience/custom-crispr-screening.git`,
                'text',
                'skills-install'
              )}
            </div>

            {/* 6 Skill Categories */}
            <div className="space-y-5 pt-2">
              {/* Cat 1 */}
              <div>
                <h3 className="font-bold text-[15px] text-text-primary mb-2 flex items-center gap-2">
                  <span>🧬 1. {isZh ? '分子与结构生物学 (Molecular & Structural Biology)' : 'Molecular & Structural Biology'}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">sequence-alignment</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? '双序列与多序列对齐，识别催化与变构口袋保守残基基序。' : 'Pairwise and multiple sequence alignment with motif scoring.'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">structure-superposition</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? 'Kabsch 算法 3D 坐标叠合与 C-alpha RMSD 距离计算。' : 'Kabsch 3D coordinate superposition and C-alpha RMSD.'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">protein-domain-architect</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? '蛋白质多结构域拓扑架构拆解与 Swiss-Prot 活性位点注释。' : 'Deconstructs domain architecture and catalytic topology.'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">pathway-enrichment</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? '超几何分布与 FDR 校正的 KEGG / Reactome 通路富集分析。' : 'Hypergeometric over-representation and FDR pathway testing.'}</p>
                  </div>
                </div>
              </div>

              {/* Cat 2 */}
              <div>
                <h3 className="font-bold text-[15px] text-text-primary mb-2 flex items-center gap-2">
                  <span>🧪 2. {isZh ? '化学信息学与成药性 (Cheminformatics)' : 'Cheminformatics'}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">admet-prediction</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? 'Lipinski 五规则、Veber 生物利用度、TPSA 与 QED 成药评分。' : 'Lipinski Ro5, Veber bioavailability, TPSA, QED drug-likeness.'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">chemical-similarity-search</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? 'ECFP4 / Morgan 指纹哈希与 Tanimoto 相似度距离矩阵。' : 'ECFP4 Morgan fingerprinting and Tanimoto similarity.'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">sar-pharmacophore-mapping</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? '构效关系 (SAR) 映射与活性峭壁 (Activity Cliffs) 自动识别。' : 'Structure-Activity Relationship and activity cliff analysis.'}</p>
                  </div>
                </div>
              </div>

              {/* Cat 3 */}
              <div>
                <h3 className="font-bold text-[15px] text-text-primary mb-2 flex items-center gap-2">
                  <span>📊 3. {isZh ? '生物统计与生物信息学 (Statistics & Bioinformatics)' : 'Statistics & Bioinformatics'}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">differential-expression-analysis</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? 'RNA-seq 转录组两组差异基因分析与火山图阈值计算。' : 'RNA-seq differential gene expression with volcano thresholds.'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">survival-analysis</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? 'Kaplan-Meier 生存曲线、Log-Rank 检验与危险比 (HR)。' : 'Kaplan-Meier survival curves, Log-Rank tests, hazard ratios.'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">meta-analysis-forest-plot</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? '固定与随机效应荟萃分析、森林图与 I² 异质性检验。' : 'Fixed and random-effects meta-analysis and forest plots.'}</p>
                  </div>
                </div>
              </div>

              {/* Cat 4 */}
              <div>
                <h3 className="font-bold text-[15px] text-text-primary mb-2 flex items-center gap-2">
                  <span>🏥 4. {isZh ? '临床医学与药物警戒 (Clinical & Pharmacovigilance)' : 'Clinical & Pharmacovigilance'}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">adverse-event-signal-detection</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? 'openFDA FAERS 比例失衡检测（PRR / ROR 及 95% 置信区间）。' : 'FAERS reporting disproportionality (ROR / PRR) with 95% CIs.'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">clinical-trial-eligibility-matching</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? 'ClinicalTrials.gov 入选与排除标准自动语义匹配与队列筛选。' : 'Matches patient parameters against protocol criteria.'}</p>
                  </div>
                </div>
              </div>

              {/* Cat 5 */}
              <div>
                <h3 className="font-bold text-[15px] text-text-primary mb-2 flex items-center gap-2">
                  <span>📚 5. {isZh ? '科学文献与系统评价 (Literature & Systematic Review)' : 'Literature & Systematic Review'}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">systematic-review-prisma</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? 'PRISMA 2020 四阶段文献筛选流追踪与排除原因归档。' : 'PRISMA 2020 4-phase systematic review flow tracking.'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">citation-network-mapping</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? '有向引用与共被引网络图谱、权威核心文献枢纽识别。' : 'Directed citation graphs and in-degree hub identification.'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">bibliometric-analysis</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? '发文趋势动力学、期刊影响因子分布与学者合作网络。' : 'Publication velocity, journal distributions, author clusters.'}</p>
                  </div>
                </div>
              </div>

              {/* Cat 6 */}
              <div>
                <h3 className="font-bold text-[15px] text-text-primary mb-2 flex items-center gap-2">
                  <span>🔬 6. {isZh ? '医学影像与论文撰写 (Imaging & Reproducibility)' : 'Imaging, Writing & Reproducibility'}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">radiomics-feature-extraction</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? 'CT 组织衰减 (HU) 与 GLCM 纹理特征。' : 'Hepatic CT HU attenuation and GLCM features.'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">manuscript-formatting</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? '结构化整理为顶刊标准论文格式。' : 'Formats findings into publication manuscripts.'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">figure-generation</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? '300 DPI 色盲友好色系矢量图。' : '300 DPI publication-grade vector graphics.'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-bg-surface border border-border">
                    <span className="font-bold text-[13px] text-text-primary block">reproducibility-packaging</span>
                    <p className="text-[12px] text-text-muted mt-0.5">{isZh ? 'SHA-256 确权的可复现科研归档包。' : 'Reproducibility bundles with SHA-256 manifests.'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>
      )}

      {/* ========================================================================= */}
      {/* SECTION: CONTRIBUTING                                                     */}
      {/* ========================================================================= */}
      {section === 'contributing' && (
        <article className="space-y-8">
          <div className="space-y-2 border-b border-border pb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/10 text-accent font-bold text-[11px] font-mono">
              <GitPullRequest size={12} />
              <span>{isZh ? '开发者贡献指南' : 'COMMUNITY & DEVELOPMENT'}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">
              {isZh ? '参与贡献 MedScience 核心生态' : 'Contributing to MedScience'}
            </h1>
            <p className="text-[15px] text-text-secondary leading-relaxed">
              {isZh
                ? '欢迎开发者与科研工作者为 MedScience 贡献新的科学工具连接器、生命周期守卫 Hook 或领域标准技能。'
                : 'How to add scientific tools, write formal guardrail hooks, build domain skills, and run core test suites.'}
            </p>
          </div>

          <div className="space-y-6 text-[14px] text-text-secondary leading-relaxed">
            {/* 1. Setup */}
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <span>{isZh ? '1. 开发环境配置与代码检出' : '1. Development Workflow & Setup'}</span>
              </h2>
              {renderCodeBlock(
                `# 1. Fork 并克隆代码仓库\ngit clone https://github.com/BenjaminDuo/MedScience.git\ncd MedScience\n\n# 2. 安装所有 workspace 依赖\nnpm install\n\n# 3. 运行全套核心测试验证\nnpm test\n\n# 4. 单独运行守卫 Hook 自动化测试\nnpx tsx packages/core/tests/test-hooks-system.ts`,
                'bash',
                'contrib-setup'
              )}
            </div>

            {/* 2. Adding a Tool */}
            <div className="space-y-3 pt-2">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <span>{isZh ? '2. 如何添加一个新的科学数据连接器工具' : '2. How to Add a New Scientific Tool'}</span>
              </h2>
              <ol className="list-decimal list-inside space-y-2 text-[13px] text-text-secondary">
                <li>{isZh ? '在 packages/core/src/tools/ 下创建工具类，继承 BaseTool 接口。' : 'Create tool class in packages/core/src/tools/ implementing BaseTool.'}</li>
                <li>{isZh ? '定义严格的输入参数 JSON Schema 与类型注解。' : 'Define strict JSON Schema arguments and TypeScript input/output types.'}</li>
                <li>{isZh ? '在 packages/core/src/tools/ToolRegistry.ts 中注册，并导出至 index.ts。' : 'Register in ToolRegistry.ts and export from index.ts.'}</li>
                <li>{isZh ? '在 packages/core/tests/ 中补充针对真实科学数据的单元测试用例。' : 'Add unit tests in packages/core/tests/ with real-world biological data.'}</li>
              </ol>
            </div>

            {/* 3. Adding a Hook */}
            <div className="space-y-3 pt-2">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <span>{isZh ? '3. 如何添加一个新的生命周期守卫 Hook' : '3. How to Create a Lifecycle Guardrail Hook'}</span>
              </h2>
              <ol className="list-decimal list-inside space-y-2 text-[13px] text-text-secondary">
                <li>{isZh ? '在 packages/core/src/hooks/builtin/ 创建 Hook 类，实现 HookDefinition 接口。' : 'Create hook in packages/core/src/hooks/builtin/ implementing HookDefinition.'}</li>
                <li>{isZh ? '指定触发事件：PreToolUse、PostToolUse、SessionStart 或 Stop。' : 'Bind to lifecycle events: PreToolUse, PostToolUse, SessionStart, or Stop.'}</li>
                <li>{isZh ? '在 packages/core/src/hooks/HookRegistry.ts 中完成注册。' : 'Register in HookRegistry.ts and verify non-bypassable execution.'}</li>
              </ol>
            </div>
          </div>
        </article>
      )}

      {/* ========================================================================= */}
      {/* SECTION: CHANGELOG                                                        */}
      {/* ========================================================================= */}
      {section === 'changelog' && (
        <article className="space-y-8">
          <div className="space-y-2 border-b border-border pb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/10 text-accent font-bold text-[11px] font-mono">
              <History size={12} />
              <span>{isZh ? '版本演进记录' : 'RELEASE HISTORY'}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">
              {isZh ? '版本发布与更新日志 (Changelog)' : 'Changelog & Releases'}
            </h1>
            <p className="text-[15px] text-text-secondary leading-relaxed">
              {isZh
                ? 'MedScience 官方发布日志、里程碑功能与可验证的架构升级。'
                : 'Official releases, verifiable architectural improvements, and roadmap milestones.'}
            </p>
          </div>

          <div className="space-y-6 text-[14px]">
            {/* Release v3.0.0 (pre-release) */}
            <div className="p-5 rounded-2xl bg-bg-surface border border-accent/40 space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-accent text-white">v3.0.0</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono border border-border text-text-muted">
                    {isZh ? '预发布' : 'Pre-release'}
                  </span>
                  <span className="font-bold text-[15px] text-text-primary">
                    {isZh ? '证据治理：证据账本、信息增益取证与共形判定' : 'Evidence Governance: Ledger, Information-Gain Requests & Conformal Decisions'}
                  </span>
                </div>
                <span className="text-[12px] text-accent font-mono font-semibold">October 2026</span>
              </div>
              <ul className="text-[13px] text-text-secondary space-y-1.5 list-disc list-inside">
                <li>
                  <strong>{isZh ? '证据账本：' : 'Evidence Ledger: '}</strong>
                  {isZh
                    ? '跨会话持久化、哈希链防篡改的证据与结论库。证据须经准入门禁（来源、时效、隐私、数值校验、撤稿）方可验证；支持证据失效时，依赖它的结论自动转为「有争议」。可导入 Retraction Watch 撤稿数据并扫描整个账本。'
                    : 'A durable, hash-chained store of evidence and claims. Evidence is verified only through an admission gate (provenance, validity window, privacy, numerical checks, retractions); when supporting evidence falls, the claims resting on it become contested. Retraction Watch data can be imported and swept across the ledger.'}
                </li>
                <li>
                  <strong>{isZh ? '信息增益取证：' : 'Information-Gain Evidence Requests: '}</strong>
                  {isZh
                    ? '假设分支按期望信息增益 / 成本排序查询，可设预算与提前停止；工具失败只消耗预算，不会被当作反证。'
                    : 'Hypothesis branches order their lookups by expected information gain per unit cost, within a budget and with optional early stopping; a failed tool call spends budget and is never read as counter-evidence.'}
                </li>
                <li>
                  <strong>{isZh ? '共形三分判定：' : 'Conformal Three-Way Decisions: '}</strong>
                  {isZh
                    ? '支持 / 反驳 / 不确定 由分类条件共形预测集给出；未校准时明确标注、不声称覆盖率。移除了 v2 中按靶点名称（如 TYK2）打分的逻辑，评分只来自工具返回的证据。'
                    : 'Supported / refuted / inconclusive come from a class-conditional conformal prediction set; uncalibrated decisions say so and claim no coverage. The v2 scoring that rewarded targets by name (e.g. TYK2) is removed: scores come only from what the tools returned.'}
                </li>
              </ul>
            </div>

            {/* Release v2.0.0 */}
            <div className="p-5 rounded-2xl bg-bg-surface border border-accent/40 space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-accent text-white">v2.0.0</span>
                  <span className="font-bold text-[15px] text-text-primary">
                    {isZh ? '四端可用、科研小队群聊化与 26 位领域专家' : 'Four Surfaces, Group-Chat Research Teams & 26 Specialists'}
                  </span>
                </div>
                <span className="text-[12px] text-accent font-mono font-semibold">October 2026</span>
              </div>
              <ul className="text-[13px] text-text-secondary space-y-1.5 list-disc list-inside">
                <li>
                  <strong>{isZh ? 'Linux 安装包与本地 Web 工作站：' : 'Linux Builds & Local Web Workstation: '}</strong>
                  {isZh
                    ? '新增 AppImage 与 Debian/Ubuntu `.deb` 发布目标，并提供 `npm run web` 本地 Web 工作站（仅监听回环地址）。macOS、Windows、Linux 与浏览器四端共用同一引擎与 `~/.medscience/` 本地数据，可随时互换。'
                    : 'Added AppImage and Debian/Ubuntu `.deb` release targets, plus the `npm run web` local workstation (loopback only). All four surfaces run the same engine against the same local data in `~/.medscience/`, so a session started in one is there in the others.'}
                </li>
                <li>
                  <strong>{isZh ? '科研小队重构为群聊，队员扩充至 26 位：' : 'Research Teams as Group Chats, 26 Specialists: '}</strong>
                  {isZh
                    ? '小队页面改为「群列表 + 聊天 + 详情」三栏布局；内置队员由 11 位扩充至 26 位生物医学专家（医学影像、药理、免疫、临床试验设计等），同一队员既可单聊也可编入小队，并支持账户级与队内两级指令。'
                    : 'The teams page became a three-pane group-chat layout (roster, conversation, details); built-in members grew from 11 to 26 biomedical specialists (imaging, pharmacology, immunology, trial design, and more). A member can be messaged alone or put on a team, under account-level and per-team instructions.'}
                </li>
                <li>
                  <strong>{isZh ? '@ 提及路由与统一会话中心：' : '@Mention Routing & Unified Conversation Center: '}</strong>
                  {isZh
                    ? '消息框输入 `@` 即可将问题指派给特定队员；对话与小队会话统一混排、支持全文搜索与 ⌘K 直达；当问题明确归属某位专家时系统会主动推荐。'
                    : 'Type `@` in the composer to put a question to one member. Plain conversations and team sessions share one searchable list with ⌘K navigation, and MedScience offers the right specialist when a question clearly belongs to one.'}
                </li>
                <li>
                  <strong>{isZh ? '仓库精简与事件驱动 UI：' : 'Repository Consolidation & Event-Driven UI: '}</strong>
                  {isZh
                    ? '移除命令行包与门户的不可达代码，撤销 npm 发布计划（所有工作区均为 private）；UI 由 1.5s 轮询改为 150ms 合批的事件订阅。'
                    : 'Retired the CLI package and the portal’s unreachable modules, dropped the npm publishing plan (every workspace is private), and replaced 1.5s UI polling with batched event subscriptions at 150ms.'}
                </li>
              </ul>
            </div>

            {/* Release v1.4.0 */}
            <div className="p-5 rounded-2xl bg-bg-surface border border-accent/40 space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-accent text-white">v1.4.0</span>
                  <span className="font-bold text-[15px] text-text-primary">
                    {isZh ? '全新 CLI 交互工作站重构、桌面端安全加固与全套离线韧性发布' : 'Modern CLI TUI Revamp, Desktop Security Hardening & Empirical Resilience'}
                  </span>
                </div>
                <span className="text-[12px] text-accent font-mono font-semibold">September 2026</span>
              </div>
              <ul className="text-[13px] text-text-secondary space-y-1.5 list-disc list-inside">
                <li>
                  <strong>{isZh ? '终端交互工作站全面革新 (Ink TUI Revamp)：' : 'Terminal AI Workstation Revamp: '}</strong>
                  {isZh
                    ? '全新终端 UI 设计，1:1 还原原子轨道视觉图形与圆角发光输入框；集成执行模式三向切换（Shift+Tab：Act / Plan / Hypothesis Tree）、专家智能体快速选择器（Tab：Lead / Bio / Chem / Clin / AI）、全局命令面板（Ctrl+P：/model, /agent, /plan, /evidence, /skills, /tools）、实时思维链流与 5 阶段显式任务清单。'
                    : 'Complete terminal workstation overhaul with atom orbital branding, rounded cyan prompt, tri-mode execution (Shift+Tab: Act / Plan / Hypothesis Tree), specialist agent selector (Tab), command palette (Ctrl+P), live thinking stream, and explicit 5-stage plan checklist.'}
                </li>
                <li>
                  <strong>{isZh ? '桌面端 IPC 与会话安全性加固：' : 'Desktop IPC & Session Hardening: '}</strong>
                  {isZh
                    ? '修复 preload 隔离层与主进程会话删除、重命名、导出 Handler 的同步，杜绝渲染层异常。'
                    : 'Synchronized Electron preload bridge with session deletion, renaming, and export handlers for robust sandbox isolation.'}
                </li>
                <li>
                  <strong>{isZh ? '科学数据连接器离线韧性保障：' : 'Hardened Connectors & Offline Grounding: '}</strong>
                  {isZh
                    ? '为 UniProt, PDB, ChEMBL, PubChem, ClinicalTrials, openFDA, RxNorm, DailyMed, ArXiv 等 10+ 核心数据源注入规范离线回退，保障弱网与离线环境下的确定性科学发现。'
                    : 'Injected canonical fallbacks across 10+ molecular & clinical databases ensuring 100% CI reproducibility and offline resilience.'}
                </li>
              </ul>
            </div>

            {/* Release v1.3.0 */}
            <div className="p-5 rounded-2xl bg-bg-surface border border-border space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-slate-600 text-white">v1.3.0</span>
                  <span className="font-bold text-[15px] text-text-primary">
                    {isZh ? '跨平台多目标打包优化与中英双语门户发布' : 'Multi-Target Desktop Release & Bilingual Documentation Portal'}
                  </span>
                </div>
                <span className="text-[12px] text-text-muted font-mono">September 2026</span>
              </div>
              <ul className="text-[13px] text-text-secondary space-y-1.5 list-disc list-inside">
                <li>
                  <strong>{isZh ? '全平台多目标 Electron 打包支持：' : 'Multi-Target Electron Packaging: '}</strong>
                  {isZh
                    ? '规范化 electron-builder 配置与 CI 脚本，支持 macOS Apple Silicon (arm64) / Intel (x64) DMG 及 Windows NSIS / Portable EXE 的自动化流水线构建。'
                    : 'Standardized electron-builder configuration and GitHub Actions release matrix for macOS DMG (arm64/x64) and Windows (NSIS & Portable exe).'}
                </li>
                <li>
                  <strong>{isZh ? '中英双语文档门户与实时 GitHub 联动：' : 'Bilingual Documentation Portal: '}</strong>
                  {isZh
                    ? '全新上线中英双语即时切换系统，全面丰富了文档总览、快速上手、用户指南、4个完整实战案例、系统架构、19项技能库与贡献指南；接入实时 GitHub Star 数据，杜绝虚假计数值。'
                    : 'Interactive English/Chinese language switcher with comprehensive enrichment across Documentation, Quick Start, User Guide, 4 End-to-End Cases, Architecture, 19 Skills, and Contributing.'}
                </li>
                <li>
                  <strong>{isZh ? '工作区依赖与 CI 构建精简：' : 'Monorepo Workspace Optimization: '}</strong>
                  {isZh
                    ? '优化 monorepo 构建流程，确保核心库编译、静态站点打包及发布资产的一致性。'
                    : 'Streamlined build commands across core runtime, CLI, and desktop workstation workspaces.'}
                </li>
              </ul>
            </div>

            {/* Release v1.2.0 */}
            <div className="p-5 rounded-2xl bg-bg-surface border border-border space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-slate-600 text-white">v1.2.0</span>
                  <span className="font-bold text-[15px] text-text-primary">
                    {isZh ? '临床连接器强化与多因子假说置信度评分' : 'Clinical Connectors & Multi-Factor Confidence Scoring'}
                  </span>
                </div>
                <span className="text-[12px] text-text-muted font-mono">August 2026</span>
              </div>
              <ul className="text-[13px] text-text-secondary space-y-1.5 list-disc list-inside">
                <li>
                  <strong>{isZh ? 'ClinicalTrials.gov v2 临床连接器：' : 'ClinicalTrials.gov v2 Connector: '}</strong>
                  {isZh ? '完整支持协议部分入选与排除条件结构化解析与自动化队列匹配。' : 'Direct integration with ClinicalTrials.gov v2 API and structured eligibility parsing.'}
                </li>
                <li>
                  <strong>{isZh ? '多因子假说置信度评分引擎：' : 'Multi-Factor Hypothesis Confidence: '}</strong>
                  {isZh ? '综合评估序列同源、生化活性、临床证据与文献支持度，自动识别并标记互斥矛盾。' : 'SubagentTreeEngine computes empirical multi-factor confidence scores (S_seq, S_bio, S_clin, S_lit, P_contradiction).'}
                </li>
              </ul>
            </div>

            {/* Release v1.1.0 */}
            <div className="p-5 rounded-2xl bg-bg-surface border border-border space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-slate-600 text-white">v1.1.0</span>
                  <span className="font-bold text-[15px] text-text-primary">
                    {isZh ? '科学技能库扩充与生命周期安全守卫' : 'Expanded Scientific Skills & Security Guardrail Release'}
                  </span>
                </div>
                <span className="text-[12px] text-text-muted font-mono">August 2026</span>
              </div>
              <ul className="text-[13px] text-text-secondary space-y-1.5 list-disc list-inside">
                <li><strong>{isZh ? '19项领域科学技能库：' : '19 Domain-Specific Skills: '}</strong>{isZh ? '扩充并覆盖分子生物学、化学信息学、生物统计、临床医学与影像组学。' : 'Expanded from 4 to 19 skills with 100% real-data verification.'}</li>
                <li><strong>{isZh ? '隔离工作区文件编辑器 (FileEditorTool)：' : 'Confined Workspace File Editor: '}</strong>{isZh ? '支持安全修改工作区内部代码与配置文件，杜绝宿主机逃逸。' : 'Dedicated workspace editor with view, str_replace, and append with zero host escape.'}</li>
                <li><strong>{isZh ? '形式化守卫 Hook 机制：' : 'Formal Guardrail Hooks: '}</strong>{isZh ? '在 PreToolUse、PostToolUse 和 Stop 节点强制执行脱敏与物理边界校验。' : 'PreToolUse secret redaction, EvidenceVerifier, and completeness checking.'}</li>
              </ul>
            </div>

            {/* Release v0.1.0 */}
            <div className="p-5 rounded-2xl bg-bg-surface border border-border space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-slate-500 text-white">v0.1.0</span>
                  <span className="font-bold text-[15px] text-text-primary">
                    {isZh ? 'MedScience 初始架构发布' : 'MedScience Initial Architecture Release'}
                  </span>
                </div>
                <span className="text-[12px] text-text-muted font-mono">August 2026</span>
              </div>
              <ul className="text-[13px] text-text-secondary space-y-1.5 list-disc list-inside">
                <li>{isZh ? '终端交互式智能体 REPL，支持 /model、/plan、/act。' : 'Interactive CLI REPL with /model, /plan, /act, and streaming tool progress.'}</li>
                <li>{isZh ? 'EvidenceVerifier 验证网关，支持数学边界与防溢出审计。' : 'EvidenceVerifier gate for numerical limits and anomaly prevention.'}</li>
                <li>{isZh ? '跨平台内核沙箱（macOS Seatbelt、Linux Bubblewrap、Windows MIC）。' : 'Cross-platform OS sandboxes verified on GitHub Actions CI.'}</li>
              </ul>
            </div>
          </div>
        </article>
      )}

      {/* ========================================================================= */}
      {/* SECTION: INSTALLATION                                                     */}
      {/* ========================================================================= */}
      {section === 'installation' && (
        <article className="space-y-8">
          <div className="space-y-2 border-b border-border pb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/10 text-accent font-bold text-[11px] font-mono">
              <Download size={12} />
              <span>{isZh ? '下载与安装' : 'CROSS-PLATFORM DISTRIBUTION'}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">
              {isZh ? 'MedScience 安装部署指南' : 'Installation Guide'}
            </h1>
            <p className="text-[15px] text-text-secondary leading-relaxed">
              {isZh
                ? `官方桌面客户端下载${releaseLabel}、本地 Web 工作站以及源码编译指南。`
                : `Desktop application downloads${releaseLabel}, the local web workstation, prerequisites, and monorepo build setup.`}
            </p>
          </div>

          <div className="space-y-6 text-[14px] text-text-secondary leading-relaxed">
            {/* Desktop Downloads -- every link comes from the published release (useLatestRelease) */}
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <span>
                  {isZh
                    ? `1. 下载桌面客户端${releaseLabel ? ` (v${release.version} 正式版)` : ''}`
                    : `1. Download Desktop App${releaseLabel}`}
                </span>
              </h2>
              <p className="text-[13px] text-text-muted">
                {isZh
                  ? '官方原生跨平台学术工作站，内置多假说子智能体树、实时计划看板及交互式证据卡片：'
                  : 'Official native scientific workstations with integrated subagent tree, real-time PlanTracker, and interactive evidence cards:'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 my-3">
                {renderDownload('mac-arm64', 'macOS Apple Silicon', 'M1/M2/M3/M4 (.dmg)')}
                {renderDownload('mac-x64', 'macOS Intel', 'x86_64 (.dmg)')}
                {renderDownload('win-setup', 'Windows Setup', 'NSIS Installer (.exe)')}
                {renderDownload('win-portable', 'Windows Portable', 'Standalone (.zip)')}
                {renderDownload(
                  'linux-appimage',
                  'Linux AppImage',
                  `${isZh ? '任意发行版' : 'Any distro'} (.AppImage)`
                )}
                {renderDownload('linux-deb', 'Debian / Ubuntu', 'amd64 (.deb)')}
              </div>
            </div>

            {/* Linux prerequisite + quick install */}
            <div className="space-y-3 pt-2">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <span>{isZh ? '2. 快速安装' : '2. Quick Install'}</span>
              </h2>
              <p className="text-[13px] text-text-muted">
                {isZh
                  ? 'Linux 上的沙箱化 Python 依赖 bubblewrap。若系统缺少该组件，MedScience 会拒绝执行 Python，而非在无隔离状态下运行——这一拒绝是刻意设计的。请先安装：sudo apt install bubblewrap。'
                  : 'Sandboxed Python on Linux needs bubblewrap. Without it MedScience refuses to run Python rather than running it unconfined — that refusal is deliberate. Install it first with sudo apt install bubblewrap (or your distro’s equivalent).'}
              </p>
              {renderCodeBlock(
                `# 方式 A：桌面客户端\n# 从 GitHub Releases 下载 macOS / Windows / Linux 安装包\n\n# 方式 B：本地 Web 工作站\ngit clone https://github.com/BenjaminDuo/MedScience.git\ncd MedScience && npm install && npm run build\nnpm run web   # 然后访问 http://127.0.0.1:3000`,
                'bash',
                'inst-quick'
              )}
            </div>

            {/* Build From Source */}
            <div className="space-y-3 pt-2">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <span>{isZh ? '3. 源码编译 (Monorepo)' : '3. Build From Source (Monorepo)'}</span>
              </h2>
              {renderCodeBlock(
                `# 克隆仓库\ngit clone https://github.com/BenjaminDuo/MedScience.git\ncd MedScience\n\n# 安装依赖\nnpm install\n\n# 编译全工作区包 (core / desktop / web)\nnpm run build\n\n# 启动客户端\nnpm run desktop:dev`,
                'bash',
                'inst-src'
              )}
            </div>
          </div>
        </article>
      )}

      {/* ========================================================================= */}
      {/* SECTION: API REFERENCE                                                    */}
      {/* ========================================================================= */}
      {section === 'apireference' && (
        <article className="space-y-8">
          <div className="space-y-2 border-b border-border pb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/10 text-accent font-bold text-[11px] font-mono">
              <Code2 size={12} />
              <span>{isZh ? 'SDK 与核心接口' : 'TYPESCRIPT API REFERENCE'}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">
              {isZh ? 'TypeScript 核心 SDK API 参考' : 'TypeScript API Reference'}
            </h1>
            <p className="text-[15px] text-text-secondary leading-relaxed">
              {isZh
                ? '@medscience/core 核心包对外暴露的主要类、守卫中间件与推演方法。'
                : 'Core SDK classes and methods available in @medscience/core.'}
            </p>
          </div>

          <div className="space-y-6 text-[14px] text-text-secondary leading-relaxed">
            <div>
              <h2 className="text-xl font-bold text-text-primary font-mono text-accent">EvidenceVerifier</h2>
              <p className="text-[13px] text-text-muted mt-1">
                {isZh ? 'Codex 风格预采纳验证网关，严格拦截数学异常与物理边界溢出：' : 'Codex-style verification middleware for empirical tool outputs.'}
              </p>
              {renderCodeBlock(
                `import { EvidenceVerifier } from '@medscience/core';\n\nconst verifier = new EvidenceVerifier();\nconst result = verifier.verify(\n  'python_runner',\n  'computation',\n  'IC50 calculation',\n  { ic50: 12.8, pValue: 0.0002 }\n);\n\n// 返回：{ verdict: 'ADOPTED' | 'FLAGGED_WITH_WARNING' | 'REJECTED', confidenceScore: 1.0 }`,
                'typescript',
                'api-verifier'
              )}
            </div>

            <div className="pt-2">
              <h2 className="text-xl font-bold text-text-primary font-mono text-accent">SubagentTreeEngine</h2>
              <p className="text-[13px] text-text-muted mt-1">
                {isZh ? '多假说分支并发探索与综合矩阵生成器：' : 'Parallel hypothesis branch orchestrator and matrix synthesizer.'}
              </p>
              {renderCodeBlock(
                `import { SubagentTreeEngine, HypothesisNode } from '@medscience/core';\n\nconst engine = new SubagentTreeEngine();\nconst { hypothesisTree, comparisonMatrix } = await engine.exploreHypothesesParallel(\n  sessionId,\n  [\n    { id: 'hyp-1', targetEntity: 'TYK2', statement: 'JH2 allosteric binding' },\n    { id: 'hyp-2', targetEntity: 'JAK1', statement: 'Orthosteric cross-reactivity' },\n  ],\n  evidenceTracker,\n  3 // maxConcurrency\n);`,
                'typescript',
                'api-subagent'
              )}
            </div>
          </div>
        </article>
      )}
    </div>
  );
};
