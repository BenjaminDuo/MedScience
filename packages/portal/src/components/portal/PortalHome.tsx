import React, { useState } from 'react';
import {
  ArrowRight,
  Download,
  Github,
  Bot,
  Wrench,
  Layers,
  Users,
  Terminal,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { PortalHeroVisual } from './PortalHeroVisual';
import { useNav } from '../../context/NavContext';
import { useLanguage } from '../../context/LanguageContext';

export const PortalHome: React.FC = () => {
  const { setActiveSection } = useNav();
  const { language } = useLanguage();
  const [activeGalleryTab, setActiveGalleryTab] = useState<'desktop-light' | 'desktop-dark' | 'workspace'>('desktop-light');
  const [activeCodeTab, setActiveCodeTab] = useState<'git' | 'web' | 'desktop' | 'sdk'>('git');
  const [copiedCode, setCopiedCode] = useState(false);

  const codeSnippets = {
    git: `# 1. Clone MedScience repository
git clone https://github.com/BenjaminDuo/MedScience.git
cd MedScience

# 2. Install workspace dependencies
npm install

# 3. Launch the workstation in your browser
npm run web`,
    web: `# Run the full workstation as a local web app
npm run web

# Open http://127.0.0.1:3000 -- the server binds to loopback only.
# Set MEDSCIENCE_WEB_PORT to use a different port.`,
    desktop: `# Launch the MedScience Desktop Electron interface
npm run desktop:dev

# Or build native desktop application (.dmg / .exe)
npm run build`,
    sdk: `import { AutonomousResearchEngine, globalToolRegistry } from '@medscience/core';

// Initialize the scientific research engine
const engine = new AutonomousResearchEngine({
  maxTurns: 16,
  modelProvider: activeModelProvider,
});

// Run evidence-anchored autonomous inquiry
const turn = await engine.run(session, "Screen FAERS adverse events for Deucravacitinib");
console.log(turn.agentResponse);`,
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeSnippets[activeCodeTab]);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const isZh = language === 'zh';

  return (
    <div className="space-y-14 sm:space-y-20 py-4 sm:py-8 px-4 sm:px-8 max-w-[1240px] mx-auto">
      {/* 1. HERO SECTION */}
      <section className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12 pt-2 sm:pt-6">
        <div className="flex-1 max-w-2xl text-left space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/25 text-accent text-[12px] font-medium">
              <Sparkles size={14} />
              <span>
                {isZh
                  ? 'v1.4.0 正式发布 — 现代 TUI 与加固型自主科研工作站'
                  : 'v1.4.0 Released — Modern TUI & Fortified Scientific Agent Workstation'}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-text-primary leading-[1.15]">
              <span className="text-text-primary">MedScience</span>
              <br />
              <span className="bg-gradient-to-r from-accent via-accent-secondary to-purple-600 bg-clip-text text-transparent">
                {isZh ? '人工智能' : 'AI'}
              </span>{' '}
              <span className="text-text-primary font-bold">
                {isZh ? '加速科学发现与循证探索' : 'for Scientific Discovery'}
              </span>
            </h1>
            <p className="text-[14.5px] sm:text-[16px] text-text-secondary leading-relaxed pt-1">
              {isZh
                ? 'MedScience 是一套专为生物医药与生命科学打造的开源自主智能体系统。内置19项领域技能、4道不可绕过的安全守卫Hook、隔离工作区文件编辑器，以及严苛的物理/数学边界验证网关，确保每一次推演结论都有据可查、可重复、零虚构。'
                : 'MedScience is an open-source AI agent framework for scientific research. It features 19 domain skills, 4 non-bypassable guardrail hooks, a confined workspace file editor, and cryptographic evidence verification for reproducible scientific discoveries.'}
            </p>
          </div>

          {/* Quick One-Liner Install Banner */}
          <div className="p-3.5 rounded-xl border border-border bg-[#070A10] text-[#E2E8F0] shadow-sm space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="flex items-center gap-1.5 text-accent font-semibold">
                <Terminal size={13} />
                <span>{isZh ? '快速开始 (本地 Web 工作站)' : 'QUICK START (LOCAL WEB WORKSTATION)'}</span>
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText('git clone https://github.com/BenjaminDuo/MedScience.git && cd MedScience && npm install && npm run web');
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="flex items-center gap-1 hover:text-white transition-colors"
              >
                {copiedCode ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>{copiedCode ? (isZh ? '已复制' : 'Copied') : (isZh ? '复制' : 'Copy')}</span>
              </button>
            </div>
            <div className="flex items-center gap-2 font-mono text-[13px] text-emerald-400 select-all overflow-x-auto py-0.5">
              <span className="text-slate-500 select-none">$</span>
              <span>git clone …/MedScience.git &amp;&amp; cd MedScience &amp;&amp; npm install &amp;&amp; npm run web</span>
            </div>
          </div>

          {/* Call to Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={() => setActiveSection('installation')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold text-[13.5px] shadow-sm transition-all active:scale-98"
            >
              <Download size={16} />
              <span>{isZh ? '下载桌面客户端' : 'Download Desktop App'}</span>
            </button>
            <button
              onClick={() => setActiveSection('installation')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-bg-surface hover:bg-bg-hover text-text-primary font-semibold text-[13.5px] shadow-2xs transition-all active:scale-98"
            >
              <Terminal size={16} />
              <span>{isZh ? '在本地运行' : 'Run It Locally'}</span>
              <ArrowRight size={15} />
            </button>
            <a
              href="https://github.com/BenjaminDuo/MedScience"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-bg-surface hover:bg-bg-hover text-text-secondary hover:text-text-primary font-medium text-[13.5px] transition-all shadow-2xs"
            >
              <Github size={16} />
              <span>GitHub</span>
            </a>
          </div>
        </div>

        {/* Hero Graphic Visual */}
        <div className="flex-1 flex items-center justify-center w-full max-w-md lg:max-w-none">
          <PortalHeroVisual />
        </div>
      </section>

      {/* 2. CAPABILITY STRIP (4 Pillars) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5 rounded-2xl bg-bg-surface border border-border shadow-xs">
        <div className="flex items-start gap-3.5 p-2">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-accent flex-shrink-0">
            <Bot size={20} />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-text-primary mb-1">
              {isZh ? '多假说子智能体树' : 'Subagent Hypothesis Tree'}
            </h3>
            <p className="text-[12px] text-text-muted leading-relaxed">
              {isZh
                ? '并行派生多个假说分支并发探索，综合序列、生化、临床与文献计算置信度。'
                : 'Parallel competing hypothesis branches with empirical multi-factor confidence scoring.'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3.5 p-2">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 flex-shrink-0">
            <Wrench size={20} />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-text-primary mb-1">
              {isZh ? '19项科学领域技能' : '19 Scientific Skills & Tools'}
            </h3>
            <p className="text-[12px] text-text-muted leading-relaxed">
              {isZh
                ? '覆盖分子对齐、SAR药效团、FAERS药物警戒、RNA-seq与PRISMA系统评价。'
                : 'From SAR mapping and MASLD RNA-seq to FAERS disproportionality and PRISMA reviews.'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3.5 p-2">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500 flex-shrink-0">
            <Layers size={20} />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-text-primary mb-1">
              {isZh ? '严苛生命周期守卫' : 'Formal Guardrail Hooks'}
            </h3>
            <p className="text-[12px] text-text-muted leading-relaxed">
              {isZh
                ? '执行前密钥脱敏、执行后边界校验、临床EHR/DICOM沙箱隔离与证据闭环审计。'
                : 'PreToolUse secret redaction, EvidenceVerifier gate, ClinicalDataGate, and provenance check.'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3.5 p-2">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 flex-shrink-0">
            <Users size={20} />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-text-primary mb-1">
              {isZh ? '隔离工作区代码编辑' : 'Confined Workspace Editor'}
            </h3>
            <p className="text-[12px] text-text-muted leading-relaxed">
              {isZh
                ? '支持工作区内代码与配置文件的精准查看、替换与插入，严格禁止宿主机逃逸。'
                : 'In-workspace text & script modification with zero host escape for iterative research.'}
            </p>
          </div>
        </div>
      </section>

      {/* 3. QUICK START CODE SNIPPETS (Multi-Tab Installer) */}
      <section className="space-y-4">
        <div className="text-left space-y-1">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
            {isZh ? '快速安装与运行' : 'Installation & Quick Start'}
          </h2>
          <p className="text-[14px] text-text-secondary">
            {isZh ? '数秒内即可运行 MedScience 桌面客户端或本地 Web 工作站。' : 'Get the MedScience desktop app or the local web workstation running in seconds.'}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-bg-surface overflow-hidden shadow-xs">
          <div className="flex flex-wrap items-center justify-between px-4 py-2.5 border-b border-border bg-bg-elevated/50 gap-2">
            <div className="flex flex-wrap items-center gap-1 text-[12px]">
              <button
                onClick={() => setActiveCodeTab('git')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  activeCodeTab === 'git' ? 'bg-bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Git Clone
              </button>
              <button
                onClick={() => setActiveCodeTab('web')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  activeCodeTab === 'web' ? 'bg-bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Local Web
              </button>
              <button
                onClick={() => setActiveCodeTab('desktop')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  activeCodeTab === 'desktop' ? 'bg-bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Desktop App
              </button>
              <button
                onClick={() => setActiveCodeTab('sdk')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  activeCodeTab === 'sdk' ? 'bg-bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                TypeScript SDK
              </button>
            </div>

            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11.5px] font-medium text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              {copiedCode ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
              <span>{copiedCode ? (isZh ? '已复制' : 'Copied') : (isZh ? '复制' : 'Copy')}</span>
            </button>
          </div>

          <pre className="p-4 text-[12.5px] font-mono overflow-x-auto bg-[#070A10] text-[#E2E8F0] leading-relaxed text-left">
            <code className="text-[#E2E8F0]">{codeSnippets[activeCodeTab]}</code>
          </pre>
        </div>
      </section>

      {/* 4. REAL INTERFACE SHOWCASE (Real Screenshots Gallery) */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div className="text-left space-y-1">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
              {isZh ? '多模态界面体验：桌面工作站与终端命令行' : 'One Scientific Agent. Multiple Interfaces.'}
            </h2>
            <p className="text-[14px] text-text-secondary">
              {isZh
                ? '支持基于 Electron 的沉浸式学术科研桌面工作站，以及面向开发者的全功能终端交互智能体。'
                : 'Experience MedScience in native Desktop Electron or high-speed CLI terminal.'}
            </p>
          </div>

          {/* Gallery Switch Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-bg-elevated border border-border text-[12px]">
            <button
              onClick={() => setActiveGalleryTab('desktop-light')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                activeGalleryTab === 'desktop-light' ? 'bg-bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {isZh ? '桌面端浅色' : 'Desktop Light'}
            </button>
            <button
              onClick={() => setActiveGalleryTab('desktop-dark')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                activeGalleryTab === 'desktop-dark' ? 'bg-bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {isZh ? '桌面端深色' : 'Desktop Dark'}
            </button>
            <button
              onClick={() => setActiveGalleryTab('workspace')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                activeGalleryTab === 'workspace' ? 'bg-bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {isZh ? '工作区视图' : 'Workspace View'}
            </button>
          </div>
        </div>

        {/* Screenshot Container */}
        <div className="p-3 sm:p-5 rounded-2xl bg-bg-surface border border-border shadow-md overflow-hidden">
          {activeGalleryTab === 'desktop-light' && (
            <div className="space-y-3">
              <img
                src={`${import.meta.env.BASE_URL}screenshots/screenshot_desktop_light.png`}
                alt="MedScience Desktop Light Theme"
                className="w-full rounded-xl border border-border/80 shadow-sm"
              />
              <p className="text-[12px] text-text-muted text-center">
                {isZh
                  ? 'MedScience 桌面端浅色模式 — 高信息密度的科研工作台，集成实时计划追踪与证据流卡片。'
                  : 'MedScience Desktop Light Mode — High-density research workspace with real-time Plan & To-Do tracker.'}
              </p>
            </div>
          )}

          {activeGalleryTab === 'desktop-dark' && (
            <div className="space-y-3">
              <img
                src={`${import.meta.env.BASE_URL}screenshots/screenshot_desktop_dark.png`}
                alt="MedScience Desktop Dark Theme"
                className="w-full rounded-xl border border-border/80 shadow-sm"
              />
              <p className="text-[12px] text-text-muted text-center">
                {isZh
                  ? 'MedScience 桌面端深色模式 — 深邃沉浸的暗色护眼主题，专为长时间科研攻关优化。'
                  : 'MedScience Desktop Dark Mode — Deep navy theme tailored for prolonged academic discovery.'}
              </p>
            </div>
          )}

          {activeGalleryTab === 'workspace' && (
            <div className="space-y-3">
              <img
                src={`${import.meta.env.BASE_URL}screenshots/screenshot_m2_workspace.png`}
                alt="MedScience Workspace Active Research Loop"
                className="w-full rounded-xl border border-border/80 shadow-sm"
              />
              <p className="text-[12px] text-text-muted text-center">
                {isZh
                  ? '交互式科研工作区 — 自主 ReAct 执行过程，包含工具输出卡片、沙箱执行日志与 EV 证据锚点。'
                  : 'Interactive Workspace — Autonomous ReAct execution with tool outputs, live logs, and EV-xxx provenance tags.'}
              </p>
            </div>
          )}

        </div>
      </section>
    </div>
  );
};
