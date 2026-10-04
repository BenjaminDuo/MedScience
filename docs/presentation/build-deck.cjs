/*
 * Builds docs/presentation/MedScience-3.0-设计汇报.pptx
 *
 *   npm install --no-save pptxgenjs   (only needed to rebuild)
 *   node docs/presentation/build-deck.cjs
 *
 * Every diagram is drawn with native PowerPoint shapes so it stays editable;
 * screenshots live in ./assets and come from the real v3.0 app.
 */
const path = require('path');
const pptxgen = require('pptxgenjs');

const HERE = __dirname;
const OUT = path.join(HERE, 'MedScience-3.0-设计汇报.pptx');
const A = (f) => path.join(HERE, 'assets', f);

// ---------------------------------------------------------------- theme
const THEME = {
  name: 'MedScience Report',
  headFontFace: 'Microsoft YaHei',
  bodyFontFace: 'Microsoft YaHei',
  colors: {
    dk1: '1B2533', // body text
    lt1: 'FFFFFF',
    dk2: '0F2A44', // deep navy: titles, dark slides
    lt2: 'F2F5F8', // panel tint
    accent1: '0E8A7E', // teal: primary accent (governance / new in v3)
    accent2: '1F5F99', // blue: collaboration
    accent3: 'C9792A', // amber: caution / runtime
    accent4: '6B4FA0', // violet: execution
    accent5: 'B4233A', // red: revoked
    accent6: '5B6B7C', // slate: secondary text
    hlink: '1F5F99',
    folHlink: '6B4FA0',
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
pres.title = 'MedScience 3.0 设计汇报';
pres.author = 'MedScience';
pres.subject = '可信科研智能体工作站：设计动机、架构与使用说明';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

const W = 13.333;
const MX = 0.6; // side margin
const CW = W - 2 * MX; // content width

// --------------------------------------------------------------- layouts
pres.defineSlideMaster({
  title: 'TITLE_DARK',
  background: { color: HEX.dk2 },
  objects: [
    {
      placeholder: {
        options: { name: 'title', type: 'title', x: MX, y: 2.3, w: 11.5, h: 1.2, fontSize: 48, bold: true, color: C.background1, align: 'left', valign: 'bottom', margin: 0 },
        text: '',
      },
    },
    {
      placeholder: {
        options: { name: 'body', type: 'body', x: MX, y: 3.6, w: 11.5, h: 1.6, fontSize: 22, color: C.background1, align: 'left', valign: 'top', margin: 0 },
        text: '',
      },
    },
  ],
});

pres.defineSlideMaster({
  title: 'CONTENT',
  background: { color: HEX.lt1 },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    {
      placeholder: {
        options: { name: 'title', type: 'title', x: MX, y: 0.35, w: CW, h: 0.7, fontSize: 28, bold: true, color: C.text2, align: 'left', valign: 'middle', margin: 0 },
        text: '',
      },
    },
    {
      placeholder: {
        options: { name: 'body', type: 'body', x: MX, y: 1.05, w: CW, h: 0.45, fontSize: 15, color: C.accent6, align: 'left', valign: 'middle', margin: 0 },
        text: '',
      },
    },
    { text: { text: 'MedScience 3.0 · 设计汇报', options: { x: MX, y: 7.05, w: 6, h: 0.3, fontSize: 10, color: C.accent6, margin: 0 } } },
  ],
  slideNumber: { x: W - MX - 0.6, y: 7.05, w: 0.6, h: 0.3, fontSize: 10, color: C.accent6, align: 'right' },
});

// --------------------------------------------------------------- helpers
let objCount = 0;
const name = (p) => `${p}-${++objCount}`;

function content(title, lead, section) {
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: section });
  s.addText(title, { placeholder: 'title' });
  if (lead) s.addText(lead, { placeholder: 'body' });
  return s;
}

/** Rounded box with centred text. */
function box(s, x, y, w, h, text, o = {}) {
  s.addText(text, {
    shape: pres.shapes.ROUNDED_RECTANGLE,
    rectRadius: o.radius ?? 0.08,
    x, y, w, h,
    fill: { color: o.fill ?? C.background2 },
    line: o.line ? { color: o.line, width: o.lineWidth ?? 1, dashType: o.dash } : { color: o.fill ?? C.background2, width: 0.5 },
    fontSize: o.size ?? 13,
    bold: o.bold ?? false,
    color: o.color ?? C.text1,
    align: o.align ?? 'center',
    valign: o.valign ?? 'middle',
    margin: o.margin ?? 0.06,
    paraSpaceAfter: o.paraSpaceAfter,
    objectName: name(o.name ?? 'box'),
  });
}

/** Straight connector with an arrowhead at the end point. */
function arrow(s, x1, y1, x2, y2, o = {}) {
  s.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
    flipH: x2 < x1,
    flipV: y2 < y1,
    line: { color: o.color ?? C.accent6, width: o.width ?? 1.5, dashType: o.dash ?? 'solid', endArrowType: o.noHead ? undefined : 'triangle' },
    objectName: name('arrow'),
  });
}

function label(s, x, y, w, h, text, o = {}) {
  s.addText(text, {
    x, y, w, h,
    fontSize: o.size ?? 12,
    bold: o.bold ?? false,
    italic: o.italic ?? false,
    color: o.color ?? C.accent6,
    align: o.align ?? 'left',
    valign: o.valign ?? 'top',
    margin: o.margin ?? 0,
    isTextBox: true,
    objectName: name(o.name ?? 'label'),
  });
}

/** Number in a filled circle -- the deck's recurring marker. */
function badge(s, x, y, n, color, d = 0.42) {
  s.addText(String(n), {
    shape: pres.shapes.OVAL,
    x, y, w: d, h: d,
    fill: { color },
    line: { color, width: 0.5 },
    fontSize: d > 0.4 ? 15 : 12,
    bold: true,
    color: C.background1,
    align: 'center',
    valign: 'middle',
    margin: 0,
    objectName: name('badge'),
  });
}

function bullets(s, x, y, w, h, items, o = {}) {
  s.addText(
    items.map((t, i) => ({
      text: t,
      options: { bullet: { indent: 14 }, breakLine: i < items.length - 1, paraSpaceAfter: o.gap ?? 6 },
    })),
    { x, y, w, h, fontSize: o.size ?? 14, color: o.color ?? C.text1, valign: 'top', margin: 0, isTextBox: true, objectName: name('bullets') }
  );
}

/** Screenshot with a hairline frame, fitted inside (x, y, w, h). */
function shot(s, file, pxW, pxH, x, y, w, h, caption) {
  const r = Math.min(w / pxW, h / pxH);
  const iw = pxW * r;
  const ih = pxH * r;
  const ix = x + (w - iw) / 2;
  s.addImage({ path: A(file), x: ix, y, w: iw, h: ih, objectName: name('screenshot'), altText: caption || file });
  s.addShape(pres.shapes.RECTANGLE, {
    x: ix, y, w: iw, h: ih,
    fill: { color: 'FFFFFF', transparency: 100 },
    line: { color: 'D5DCE4', width: 0.75 },
    objectName: name('frame'),
  });
  if (caption) label(s, ix, y + ih + 0.08, iw, 0.32, caption, { size: 11, align: 'center' });
  return { x: ix, w: iw, h: ih };
}

// ================================================================ slides

// 1 -- cover
pres.addSection({ title: '开篇' });
{
  const s = pres.addSlide({ masterName: 'TITLE_DARK', sectionTitle: '开篇' });
  s.addText('MedScience 3.0', { placeholder: 'title' });
  s.addText(
    [
      { text: '可信科研智能体工作站 · 设计汇报', options: { breakLine: true } },
      { text: '让每一个科研结论都有据可查、可以撤回、说得清可信度', options: { fontSize: 16, color: 'B9C7D6' } },
    ],
    { placeholder: 'body' }
  );
  label(s, MX, 6.55, 8, 0.35, '2026 年 10 月  ·  版本 v3.0.0（预发布）', { size: 13, color: 'B9C7D6' });
  s.addNotes(
    '开场一句话：MedScience 是一个面向生物医学的科研智能体工作站。3.0 版本的重点不是“让 AI 说得更多”，而是让它的结论站得住：有证据、能撤回、可信度说得清，并且数据留在本机。'
  );
}

// 2 -- executive summary
pres.addSection({ title: '概要与动机' });
{
  const s = content('一页概要', '一句话：让 AI 科研助手的结论有证据、能撤回、说得清可信度，并且数据不出本机。', '概要与动机');
  const cards = [
    {
      t: '要解决的问题',
      c: C.accent3,
      b: 'AI 科研助手能很快给出结论，但结论依据什么、依据失效后怎么办、可信度到底多高，往往说不清。',
    },
    {
      t: '我们的做法',
      c: C.accent1,
      b: '三类设计：证据治理（结论必须挂靠已验证的证据）、多智能体协作（专家分工、审查把关）、本地运行（数据在本机，复用已有 AI 订阅）。',
    },
    {
      t: '当前进展',
      c: C.accent2,
      b: 'v3.0.0 已发布：macOS、Windows、Linux 安装包和本地 Web 版。26 套自动化测试在三个平台通过。真实任务上的对照实验尚待开展。',
    },
  ];
  const cw = (CW - 2 * 0.3) / 3;
  cards.forEach((card, i) => {
    const x = MX + i * (cw + 0.3);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.8, w: cw, h: 2.85, rectRadius: 0.1, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: name('card') });
    badge(s, x + 0.3, 2.05, i + 1, card.c);
    label(s, x + 0.85, 2.05, cw - 1.1, 0.42, card.t, { size: 18, bold: true, color: C.text2, valign: 'middle' });
    label(s, x + 0.3, 2.7, cw - 0.6, 1.85, card.b, { size: 15, color: C.text1 });
  });
  const kpis = [
    ['3 类', '系统设计'],
    ['26 位', '领域专家角色'],
    ['26 种', '本地 AI 命令行工具可接入'],
    ['4 种', '使用方式（三平台 + Web）'],
  ];
  const kw = CW / 4;
  kpis.forEach(([n, t], i) => {
    const x = MX + i * kw;
    label(s, x, 5.05, kw, 0.75, n, { size: 34, bold: true, color: C.accent1, align: 'center' });
    label(s, x, 5.8, kw, 0.4, t, { size: 13, align: 'center' });
  });
  s.addNotes(
    '这一页给出全貌。问题：结论的依据、撤回和可信度。做法：三类设计（下一页之后逐一展开）。进展：3.0 已经可以下载使用，自动化测试在三个平台持续通过；但还没有在真实科研任务上做对照实验——这一点在最后一页的“需要的支持”里提出。'
  );
}

// 3 -- motivation
{
  const s = content('为什么要做：科研 AI 落地的四个痛点', '每个痛点对应一项设计；后面各页逐一展开。', '概要与动机');
  const items = [
    ['结论难追溯，错误会固化', '引用的论文后来被撤稿，基于它的结论仍在被反复使用，没有人发现。', '证据账本：依据失效时，相关结论自动降级'],
    ['“多问几个 AI”不等于更可靠', '多个智能体容易互相附和；固定轮次的讨论消耗大量算力，却不一定更接近事实。', '信息增益取证：把分歧变成“下一步该查什么”'],
    ['“80% 可信”从何而来', '置信度常是人为设定的分数，无法核验，也说不清“不确定”到底是什么意思。', '共形三分判定：有统计口径，不确定就明说'],
    ['数据与成本', '临床数据不应离开本机；团队已经购买了 AI 订阅，却还要为 API 另外付费。', '本地运行时：复用本机已订阅的 AI 命令行工具'],
  ];
  const cw = (CW - 0.3) / 2;
  const ch = 2.45;
  items.forEach(([t, b, r], i) => {
    const x = MX + (i % 2) * (cw + 0.3);
    const y = 1.75 + Math.floor(i / 2) * (ch + 0.25);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: ch, rectRadius: 0.1, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: name('card') });
    badge(s, x + 0.3, y + 0.28, i + 1, C.accent3);
    label(s, x + 0.85, y + 0.28, cw - 1.1, 0.42, t, { size: 18, bold: true, color: C.text2, valign: 'middle' });
    label(s, x + 0.3, y + 0.85, cw - 0.6, 0.9, b, { size: 14, color: C.text1 });
    s.addText([{ text: '对应设计：', options: { bold: true, color: C.accent1 } }, { text: r, options: { color: C.text2 } }], {
      x: x + 0.3, y: y + ch - 0.62, w: cw - 0.6, h: 0.4, fontSize: 13.5, margin: 0, valign: 'middle', isTextBox: true, objectName: name('answer'),
    });
  });
  s.addNotes(
    '四个痛点都来自实际使用：撤稿论文被继续引用、多智能体互相附和、置信度说不清、临床数据和订阅成本。每个痛点下方标了对应的设计，第 8 到 12 页逐一展开。'
  );
}

// 4 -- differences
{
  const s = content('与同类方案的区别', '同类系统各有所长；MedScience 的差异在于“结论治理”与“本地可用”。', '概要与动机');
  const head = (t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: HEX.dk2 }, fontSize: 14, valign: 'middle' } });
  const cell = (t, o = {}) => ({ text: t, options: { fontSize: 13, color: HEX.dk1, valign: 'middle', ...o } });
  const rows = [
    [head('代表系统'), head('公开资料中的侧重'), head('MedScience 的不同点')],
    [cell('OpenAI Deep Research', { bold: true }), cell('多步网页检索，生成带引用的综合报告'), cell('证据持久保存、可以撤回；依据被撤稿时，相关结论自动降级')],
    [cell('Google AI co-scientist', { bold: true }), cell('多智能体生成、辩论、排序研究假设'), cell('分歧不靠多轮辩论消解，而是转为“预期收益最高”的取证请求')],
    [cell('Microsoft GraphRAG', { bold: true }), cell('知识图谱与社区摘要，改善大语料检索'), cell('关注“什么有资格被记住”：准入门禁、状态机与哈希链审计')],
    [cell('Sakana AI Scientist-v2', { bold: true }), cell('自动设计实验、编写代码并撰写论文'), cell('面向生物医学；判定有统计口径；数据与代码执行留在本机沙盒')],
  ];
  s.addTable(rows, {
    x: MX, y: 1.8, w: CW, colW: [2.9, 4.1, CW - 7.0],
    rowH: [0.55, 0.95, 0.95, 0.95, 0.95],
    border: { type: 'solid', pt: 0.75, color: 'D5DCE4' },
    fill: { color: 'FFFFFF' },
    margin: [0.06, 0.15, 0.06, 0.15],
    fontFace: THEME.bodyFontFace,
    objectName: name('table'),
  });
  label(s, MX, 6.55, CW, 0.35, '注：仅依据各系统公开发布的资料作比较，不推断其未公开的内部能力。', { size: 11 });
  s.addNotes(
    '这四个系统代表了同类方案的四个方向：检索报告、多智能体假设、图谱检索、自动实验。我们不是要替代它们，而是补上“结论治理”和“本地可用”这两块。表中只引用各系统公开的资料，不评价其未公开能力。'
  );
}

// 5 -- design classification
pres.addSection({ title: '整体设计' });
{
  const s = content('三类设计：从“怎么想”到“怎么跑”', '都是智能体系统层面的架构设计，不修改基础大模型本身，底层模型可以随时替换。', '整体设计');
  const cols = [
    {
      tag: 'A',
      t: '证据治理设计',
      kind: '智能体推理架构',
      q: '管：结论凭什么成立',
      c: C.accent1,
      items: ['① 证据账本：结论必须挂靠已验证的证据', '② 信息增益取证：意见分歧时，先查最有用的证据', '③ 共形三分判定：支持 / 反驳 / 不确定，各有统计含义'],
    },
    {
      tag: 'B',
      t: '多智能体协作设计',
      kind: '多智能体组织架构',
      q: '管：谁来做、谁把关',
      c: C.accent2,
      items: ['26 位领域专家、15 个团队模板', '队长拆解任务 → 成员并行 → 审查员把关 → 写作专家成文', '输入 @ 即可直接点名某位专家'],
    },
    {
      tag: 'C',
      t: '运行时与部署设计',
      kind: '工程与部署架构',
      q: '管：在哪里跑、用谁的额度',
      c: C.accent3,
      items: ['本地运行时：复用本机已订阅的 AI 命令行工具（如 Codex、Claude Code）', '同一引擎四种用法：macOS、Windows、Linux、本地 Web', '数据留在本机；代码在内核级沙盒中执行'],
    },
  ];
  const cw = (CW - 2 * 0.3) / 3;
  cols.forEach((col, i) => {
    const x = MX + i * (cw + 0.3);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.8, w: cw, h: 4.15, rectRadius: 0.1, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: name('card') });
    s.addText(col.tag, {
      shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.08, x: x + 0.3, y: 2.05, w: 0.55, h: 0.55,
      fill: { color: col.c }, line: { color: col.c }, fontSize: 20, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, objectName: name('tag'),
    });
    label(s, x + 1.0, 2.0, cw - 1.2, 0.4, col.t, { size: 19, bold: true, color: C.text2 });
    label(s, x + 1.0, 2.4, cw - 1.2, 0.3, col.kind, { size: 12 });
    label(s, x + 0.3, 2.85, cw - 0.6, 0.35, col.q, { size: 14, bold: true, color: col.c });
    bullets(s, x + 0.3, 3.35, cw - 0.55, 2.5, col.items, { size: 14, gap: 10 });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: 6.15, w: CW, h: 0.6, rectRadius: 0.08, fill: { color: 'E3F3F1' }, line: { color: 'E3F3F1' }, objectName: name('note') });
  label(s, MX + 0.3, 6.15, CW - 0.6, 0.6, '本次 3.0 的重点是 A 类（新增）；B、C 两类在 2.x 版本已具备，本版继续完善。', { size: 14, bold: true, color: C.text2, valign: 'middle' });
  s.addNotes(
    '这是对整个系统的分类。A 类是这次 3.0 的核心，属于智能体的推理架构；B 类是多智能体的组织方式；C 类是工程上的运行与部署。需要说明：这些都是“智能体系统”的架构设计，并没有训练或修改大模型本身，所以底层用哪家模型都可以。'
  );
}

// 6 -- architecture
{
  const s = content('总体架构', '五层结构；防护钩子贯穿每一次工具调用。', '整体设计');
  const lx = MX;
  const lw = 1.75; // layer label column
  const gx = lx + lw + 0.15;
  const gw = 8.35; // component area
  const hookX = gx + gw + 0.2;
  const hookW = MX + CW - hookX;
  const layers = [
    { n: '使用入口', c: C.accent6, items: ['桌面端（macOS / Windows / Linux）', '本地 Web（仅本机可访问）'] },
    { n: '协作层', c: C.accent2, items: ['队长规划', '成员并行执行', '审查员质量门', '写作专家综合'] },
    { n: '证据治理层', c: C.accent1, items: ['信息增益取证', '共形三分判定', '准入门禁', '证据账本'], hi: true },
    { n: '执行层', c: C.accent4, items: ['模型 API', '本地 CLI 运行时', '科研工具连接器', '内核级沙盒'] },
    { n: '数据层', c: C.accent3, items: ['本机 ~/.medscience：会话 · 证据账本 · 加密密钥库 · 配置'] },
  ];
  const top = 1.75;
  const lh = 0.82;
  const gap = 0.16;
  layers.forEach((L, i) => {
    const y = top + i * (lh + gap);
    box(s, lx, y, lw, lh, L.n, { fill: L.c, color: C.background1, bold: true, size: 15 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: gx, y, w: gw, h: lh, rectRadius: 0.08,
      fill: { color: L.hi ? 'E3F3F1' : HEX.lt2 }, line: { color: L.hi ? HEX.accent1 : HEX.lt2, width: L.hi ? 1.5 : 0.5 },
      objectName: name('layer'),
    });
    const n = L.items.length;
    const iw = (gw - 0.3 - (n - 1) * 0.15) / n;
    L.items.forEach((t, j) => {
      box(s, gx + 0.15 + j * (iw + 0.15), y + 0.14, iw, lh - 0.28, t, { fill: C.background1, line: 'D5DCE4', size: 13 });
    });
    if (L.hi) {
      s.addText('3.0 新增', {
        shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.05, x: gx + gw - 1.05, y: y - 0.16, w: 0.95, h: 0.3,
        fill: { color: C.accent1 }, line: { color: C.accent1 }, fontSize: 11, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, objectName: name('tag'),
      });
    }
  });
  const totalH = layers.length * lh + (layers.length - 1) * gap;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: hookX, y: top, w: hookW, h: totalH, rectRadius: 0.08, fill: { color: C.text2 }, line: { color: C.text2 }, objectName: name('hooks') });
  label(s, hookX + 0.1, top + 0.2, hookW - 0.2, 0.4, '防护钩子', { size: 16, bold: true, color: C.background1, align: 'center' });
  label(s, hookX + 0.15, top + 0.6, hookW - 0.3, 0.3, '不可绕过', { size: 11, color: 'B9C7D6', align: 'center' });
  ['密钥脱敏', '临床数据门', '证据数值核验', '引用完整性检查'].forEach((t, i) => {
    box(s, hookX + 0.2, top + 1.15 + i * 0.85, hookW - 0.4, 0.62, t, { fill: '27466A', color: C.background1, size: 13 });
  });
  s.addNotes(
    '从上到下五层：用户入口、协作层（科研小队）、证据治理层（3.0 新增，绿色框）、执行层、数据层。右侧的防护钩子贯穿每次工具调用：密钥脱敏、临床数据门、证据数值核验、引用完整性检查，这些都不可绕过。所有数据都在本机目录下。'
  );
}

// 7 -- data flow
{
  const s = content('一次研究提问的数据流转', '每一步都留下记录；依据失效时，结论会被“追回”。', '整体设计');
  const steps = [
    ['提问', '研究问题'],
    ['规划分工', '任务清单'],
    ['按收益取证', '工具结果'],
    ['数值核验', '会话证据 EV-n'],
    ['准入门禁', '候选证据'],
    ['证据账本', '已验证 / 已隔离'],
    ['共形判定', '预测集'],
    ['输出结论', '结论 + 证据编号'],
  ];
  const n = steps.length;
  const g = 0.2;
  const bw = (CW - (n - 1) * g) / n;
  const y = 2.25;
  const bh = 0.95;
  const gov = new Set([2, 4, 5, 6]); // steps carried by the governance layer
  steps.forEach(([t, d], i) => {
    const x = MX + i * (bw + g);
    badge(s, x + bw / 2 - 0.19, y - 0.5, i + 1, gov.has(i) ? C.accent1 : C.accent2, 0.38);
    box(s, x, y, bw, bh, t, { fill: gov.has(i) ? 'E3F3F1' : HEX.lt2, line: gov.has(i) ? HEX.accent1 : undefined, size: 13.5, bold: true, color: C.text2 });
    label(s, x - 0.05, y + bh + 0.1, bw + 0.1, 0.5, d, { size: 11.5, align: 'center' });
    if (i < n - 1) arrow(s, x + bw + 0.02, y + bh / 2, x + bw + g - 0.02, y + bh / 2, { color: C.accent6, width: 1.25 });
  });
  // Legend
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: 3.9, w: 0.3, h: 0.2, rectRadius: 0.03, fill: { color: 'E3F3F1' }, line: { color: HEX.accent1 }, objectName: name('legend') });
  label(s, MX + 0.4, 3.85, 5, 0.3, '绿色：证据治理层（3.0 新增）负责的步骤', { size: 11.5, valign: 'middle' });

  // Retraction feedback loop
  const ly = 4.55;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: ly, w: CW, h: 2.15, rectRadius: 0.1, fill: { color: 'FBF4EC' }, line: { color: 'FBF4EC' }, objectName: name('loop-panel') });
  label(s, MX + 0.3, ly + 0.2, 6, 0.4, '依据失效时的回路（撤稿 / 关注声明）', { size: 15, bold: true, color: C.text2 });
  const fg = 0.45;
  const fw = (CW - 0.6 - 3 * fg) / 4;
  const fx = [0, 1, 2, 3].map((i) => MX + 0.3 + i * (fw + fg));
  const fy = ly + 0.75;
  const fl = ['导入撤稿数据\n（Retraction Watch 等）', '扫描整个证据账本', '相关证据：撤销 / 标为有争议', '依赖它的结论：\n自动转为“有争议”'];
  fl.forEach((t, i) => {
    box(s, fx[i], fy, fw, 0.9, t, { fill: C.background1, line: HEX.accent3, size: 13, color: C.text1 });
    if (i < fl.length - 1) arrow(s, fx[i] + fw + 0.03, fy + 0.45, fx[i + 1] - 0.03, fy + 0.45, { color: C.accent3, width: 1.5 });
  });
  label(s, MX + 0.3, ly + 1.75, CW - 0.6, 0.3, '同一次操作完成，并写入哈希链记录原因；恢复证据不会自动恢复结论，需要重新核验。', { size: 11.5 });
  s.addNotes(
    '上排是一次提问的完整路径，下方小字是每一步产生的数据对象。绿色的四步由 3.0 新增的证据治理层负责。下面的橙色区域是回路：导入撤稿数据后扫描账本，被撤稿的证据会被撤销，依赖它的结论在同一个操作里自动转为“有争议”，原因写进哈希链，可以审计。'
  );
}

// 8 -- design point 1: ledger
pres.addSection({ title: '三个设计点' });
{
  const s = content('设计点 ①  证据账本：结论必须有据可查、可以撤回', '每条证据经准入门禁才算数；依据失效，结论自动降级。', '三个设计点');
  // state machine (left)
  const sx = MX;
  const sw = 1.55;
  const sh = 0.62;
  const colX = [sx, sx + 2.45, sx + 4.75];
  const st = {
    cand: [colX[0], 2.55, '候选', HEX.accent6],
    ver: [colX[1], 2.55, '已验证', HEX.accent1],
    con: [colX[2], 1.75, '有争议', HEX.accent3, '被反驳'],
    sup: [colX[2], 2.55, '已取代', HEX.accent2, '被取代'],
    rev: [colX[2], 3.35, '已撤销', HEX.accent5, '来源撤稿'],
    qua: [colX[0], 4.3, '已隔离', 'A0522D'],
  };
  Object.values(st).forEach(([x, y, t, c, why]) => {
    box(s, x, y, sw, sh, t, { fill: c, color: C.background1, bold: true, size: 15 });
    if (why) label(s, x + sw + 0.1, y, 0.95, sh, why, { size: 11, valign: 'middle' });
  });
  const mid = (k) => [st[k][0] + sw / 2, st[k][1] + sh / 2];
  const right = (k) => [st[k][0] + sw, st[k][1] + sh / 2];
  const left = (k) => [st[k][0], st[k][1] + sh / 2];
  arrow(s, ...right('cand'), ...left('ver'), { color: C.text2 });
  label(s, colX[0] + sw, 2.15, 0.9, 0.4, '通过门禁', { size: 11, align: 'center', valign: 'bottom' });
  arrow(s, ...right('ver'), ...left('con'), { color: C.text2 });
  arrow(s, ...right('ver'), ...left('sup'), { color: C.text2 });
  arrow(s, ...right('ver'), ...left('rev'), { color: C.text2 });
  arrow(s, mid('cand')[0], st.cand[1] + sh, mid('qua')[0], st.qua[1], { color: C.text2 });
  label(s, mid('cand')[0] + 0.1, 3.5, 1.3, 0.5, '未通过门禁', { size: 11, valign: 'middle' });
  arrow(s, ...right('qua'), st.rev[0], st.rev[1] + sh, { color: C.text2, dash: 'dash' });
  label(s, colX[1] - 0.2, 4.45, 2.2, 0.3, '确认无效', { size: 10.5, align: 'center' });

  // cascade example
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: 5.25, w: 7.0, h: 1.3, rectRadius: 0.1, fill: { color: 'FBF4EC' }, line: { color: 'FBF4EC' }, objectName: name('example') });
  label(s, MX + 0.25, 5.38, 6.5, 0.35, '举例：一篇论文被撤稿', { size: 14, bold: true, color: C.text2 });
  label(s, MX + 0.25, 5.78, 6.5, 0.9, '该证据转为“已撤销” → 引用它的所有已验证结论，在同一次操作中转为“有争议”，并记录原因。测试用例中，受影响的已验证结论由 2 条降为 0 条。', { size: 13 });

  // right column
  const rx = MX + 7.6;
  const rw = CW - 7.6;
  const pts = [
    ['准入门禁', '来源、时效、隐私、数值合理性、撤稿五项检查；不通过即隔离，原因可查。'],
    ['依赖级联', '证据失效时，依赖它的结论自动降级；恢复证据不会自动恢复结论。'],
    ['防篡改', '每次变更追加写入哈希链；文件被改动会被发现，账本随即锁为只读。'],
  ];
  pts.forEach(([t, b], i) => {
    const y = 1.8 + i * 1.6;
    badge(s, rx, y, i + 1, C.accent1);
    label(s, rx + 0.6, y - 0.02, rw - 0.6, 0.45, t, { size: 17, bold: true, color: C.text2, valign: 'middle' });
    label(s, rx + 0.6, y + 0.48, rw - 0.6, 0.95, b, { size: 14 });
  });
  s.addNotes(
    '左边是证据和结论的六种状态，只能沿箭头迁移。新证据先是“候选”，通过准入门禁才“已验证”，否则“已隔离”。关键在依赖级联：一篇论文被撤稿，依赖它的结论会自动转为“有争议”，不需要人工排查。所有变更写入哈希链，事后可审计，被篡改能发现。'
  );
}

// 9 -- design point 2: information gain
{
  const s = content('设计点 ②  信息增益取证：意见分歧时，先查最能分出高下的证据', '不再靠多轮辩论“说服”对方，而是在预算内选择最有价值的下一次查询。', '三个设计点');
  const steps = [
    ['汇总专家意见', '各专家的立场与把握程度'],
    ['计算分歧度', '意见越分散，越需要取证'],
    ['选择下一次查询', '预期信息增益 ÷ 成本 最高者'],
    ['执行并更新判断', '用查询结果更新各假设的可能性'],
    ['停止或升级', '足够确定即停；分歧仍大则请跨领域专家'],
  ];
  const x = MX;
  const w = 5.6;
  steps.forEach(([t, d], i) => {
    const y = 1.8 + i * 0.98;
    badge(s, x, y + 0.12, i + 1, C.accent1, 0.42);
    box(s, x + 0.6, y, w - 0.6, 0.68, '', { fill: C.background2 });
    label(s, x + 0.8, y + 0.04, w - 1.0, 0.32, t, { size: 15, bold: true, color: C.text2 });
    label(s, x + 0.8, y + 0.36, w - 1.0, 0.3, d, { size: 12 });
    if (i < steps.length - 1) arrow(s, x + 0.21, y + 0.56, x + 0.21, y + 1.08, { color: C.accent1, width: 1.25 });
  });
  // chart (right)
  const cx = MX + 6.1;
  const cw = CW - 6.1;
  label(s, cx, 1.75, cw, 0.4, '同一问题下，三类查询的预期信息增益（比特）', { size: 15, bold: true, color: C.text2 });
  s.addChart(
    pres.charts.BAR,
    [{ name: '预期信息增益', labels: ['UniProt 序列信息', '临床试验登记', 'ChEMBL 活性数据'], values: [0.039, 0.105, 0.259] }],
    {
      x: cx, y: 2.2, w: cw, h: 2.6,
      barDir: 'bar',
      chartColors: [HEX.accent1],
      showValue: true,
      dataLabelPosition: 'outEnd',
      dataLabelFormatCode: '0.000',
      dataLabelFontSize: 12,
      dataLabelFontFace: '+mn-lt',
      dataLabelColor: HEX.dk1,
      catAxisLabelFontSize: 12,
      catAxisLabelFontFace: '+mn-lt',
      catAxisLabelColor: HEX.dk1,
      valAxisHidden: true,
      valGridLine: { style: 'none' },
      catGridLine: { style: 'none' },
      showLegend: false,
      barGapWidthPct: 60,
      objectName: name('chart'),
    }
  );
  label(s, cx, 4.85, cw, 0.5, '默认参数下的示例：先查 ChEMBL 活性数据最能区分“支持 / 反驳”。参数可用真实运行数据重新估计。', { size: 11.5 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx, y: 5.55, w: cw, h: 1.2, rectRadius: 0.1, fill: { color: 'E3F3F1' }, line: { color: 'E3F3F1' }, objectName: name('callout') });
  label(s, cx + 0.25, 5.65, cw - 0.5, 1.0, '安全约定：工具调用失败（如网络中断）只消耗预算，绝不会被当作“反证”。', { size: 14, bold: true, color: C.text2, valign: 'middle' });
  s.addNotes(
    '左边是流程：先汇总专家意见、算出分歧度，然后在每种查询里挑“预期信息增益除以成本”最高的去做，拿到结果更新判断，足够确定就停，分歧仍大就升级给跨领域专家。右图是一个具体例子：在同一问题下，查 ChEMBL 活性数据最能分出高下。这些数值来自默认参数，可以用真实数据重新估计。另外，工具失败只扣预算，不会被当成反对意见。'
  );
}

// 10 -- design point 3: conformal
{
  const s = content('设计点 ③  共形三分判定：“不确定”有明确的统计含义', '给出的是一个“可能结果的集合”；集合里只有一个答案时才下结论。', '三个设计点');
  // pipeline (top)
  const pipe = [
    ['证据特征', '序列 · 活性 · 临床 · 文献 · 矛盾'],
    ['打分器', '估计“支持”的可能性'],
    ['校准阈值', '由已标注样本按类别确定'],
    ['预测集', '在错误率 α 下可能的结果'],
  ];
  const n = pipe.length;
  const g = 0.35;
  const bw = (CW - (n - 1) * g) / n;
  pipe.forEach(([t, d], i) => {
    const x = MX + i * (bw + g);
    box(s, x, 1.8, bw, 0.55, t, { fill: i === 3 ? C.accent1 : C.text2, color: C.background1, bold: true, size: 15 });
    label(s, x, 2.43, bw, 0.35, d, { size: 12, align: 'center' });
    if (i < n - 1) arrow(s, x + bw + 0.04, 2.075, x + bw + g - 0.04, 2.075, { color: C.accent6 });
  });
  // mapping table
  const head = (t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: HEX.dk2 }, fontSize: 14, valign: 'middle' } });
  const cell = (t, o = {}) => ({ text: t, options: { fontSize: 14, color: HEX.dk1, valign: 'middle', ...o } });
  s.addTable(
    [
      [head('预测集'), head('判定'), head('含义')],
      [cell('{ 支持 }', { bold: true }), cell('支持', { color: HEX.accent1, bold: true }), cell('只有“支持”与校准数据相符')],
      [cell('{ 反驳 }', { bold: true }), cell('反驳', { color: HEX.accent5, bold: true }), cell('只有“反驳”与校准数据相符')],
      [cell('{ 支持，反驳 }', { bold: true }), cell('不确定', { color: HEX.accent3, bold: true }), cell('现有证据无法区分两种结果')],
      [cell('{ }（空）', { bold: true }), cell('不确定', { color: HEX.accent3, bold: true }), cell('情况罕见、不像任何已知样本，需人工复核')],
    ],
    {
      x: MX, y: 3.05, w: 7.3, colW: [2.1, 1.3, 3.9], rowH: [0.5, 0.55, 0.55, 0.55, 0.55],
      border: { type: 'solid', pt: 0.75, color: 'D5DCE4' }, fill: { color: 'FFFFFF' }, margin: [0.05, 0.15, 0.05, 0.15], fontFace: THEME.bodyFontFace,
      objectName: name('table'),
    }
  );
  const rx = MX + 7.7;
  const rw = CW - 7.7;
  const pts = [
    ['有保证', '校准后，每一类的出错率不超过设定的 α（如 10%）。'],
    ['不硬猜', '没有校准数据时，界面明确显示“未校准”，不声称任何覆盖率。'],
    ['只看证据', '评分只来自工具返回的数据，与靶点名称无关（已有回归测试）。'],
  ];
  pts.forEach(([t, b], i) => {
    const y = 3.05 + i * 1.22;
    badge(s, rx, y, i + 1, C.accent1);
    label(s, rx + 0.6, y - 0.02, rw - 0.6, 0.45, t, { size: 17, bold: true, color: C.text2, valign: 'middle' });
    label(s, rx + 0.6, y + 0.45, rw - 0.6, 0.7, b, { size: 13.5 });
  });
  s.addNotes(
    '传统做法给一个分数再拍一个阈值。这里换成“预测集”：在设定的错误率下，哪些结果与已标注数据相符。只有一个答案时才下结论；两个都可能，就是证据不足以区分；一个都不像，说明情况罕见，需要人工看。校准后错误率有理论保证。没有校准数据时，系统会明确标注“未校准”，不会给出虚假的可信度。'
  );
}

// 11 -- multi-agent collaboration
pres.addSection({ title: '协作与运行时' });
{
  const s = content('多智能体协作设计：像课题组一样分工与把关', '队长拆解、成员并行、审查员把关、写作专家成文；每条发现都必须附证据编号。', '协作与运行时');
  const flow = [
    ['研究课题', '用户发给小队'],
    ['队长（PI）规划', '拆解为有依赖关系的任务'],
    ['审批计划（可选）', '可设为“需队长 / 人工审批”'],
    ['成员并行执行', '按依赖调度，并发数有上限'],
    ['交接成果', '每条发现须附证据编号'],
    ['质量门', '规则检查 + 科研审查员'],
    ['综合成报告', '写作专家撰写，附证据索引'],
  ];
  const x = MX;
  const w = 5.2;
  const step = 0.7;
  flow.forEach(([t, d], i) => {
    const y = 1.75 + i * step;
    const hi = i === 5;
    box(s, x, y, w, 0.56, '', { fill: hi ? 'E3F3F1' : C.background2, line: hi ? HEX.accent1 : undefined });
    label(s, x + 0.2, y, 2.3, 0.56, t, { size: 14, bold: true, color: C.text2, valign: 'middle' });
    label(s, x + 2.5, y, w - 2.6, 0.56, d, { size: 12, valign: 'middle' });
    if (i < flow.length - 1) arrow(s, x + w / 2, y + 0.56, x + w / 2, y + step, { color: C.accent2, width: 1.25 });
  });
  shot(s, 'usage-team.jpg', 1800, 892, MX + 5.6, 1.85, CW - 5.6, 3.9, '小队详情：成员、队长与小队约定（群公告）');
  const facts = [
    ['26 位', '领域专家'],
    ['15 个', '团队模板'],
    ['严格区分', '工具失败 ≠ 阴性结果'],
  ];
  const fx = MX + 5.6;
  const fw = (CW - 5.6) / 3;
  facts.forEach(([n, t], i) => {
    label(s, fx + i * fw, 6.3, fw, 0.42, n, { size: 20, bold: true, color: C.accent2, align: 'center' });
    label(s, fx + i * fw, 6.7, fw, 0.3, t, { size: 11.5, align: 'center' });
  });
  s.addNotes(
    '科研小队模拟课题组：队长先把课题拆成有依赖关系的任务，可以设为需要审批计划；成员按依赖并行执行，交接时每条发现都要附证据编号；然后经过质量门，既有规则检查也有科研审查员；最后由写作专家成文。内置 26 位专家、15 个团队模板。系统会严格区分“工具没跑通”和“科学上的阴性结果”，避免把网络故障误当成研究发现。'
  );
}

// 12 -- local runtime
{
  const s = content('运行时设计：直接使用本机已有的 AI 订阅', '同一个研究请求，可以走模型 API，也可以交给本机已登录的 AI 命令行工具。', '协作与运行时');
  const x = MX;
  box(s, x, 1.85, 2.0, 0.75, '研究请求', { fill: C.text2, color: C.background1, bold: true, size: 15 });
  arrow(s, x + 2.0, 2.225, x + 2.5, 2.225, { color: C.accent6 });
  box(s, x + 2.5, 1.85, 1.9, 0.75, '执行路由', { fill: C.accent6, color: C.background1, bold: true, size: 15 });
  // branches
  const bx = x + 4.9;
  const bw = 2.6;
  arrow(s, x + 4.4, 2.1, bx, 1.95, { color: C.accent6 });
  arrow(s, x + 4.4, 2.35, bx, 3.35, { color: C.accent6 });
  box(s, bx, 1.6, bw, 0.75, '模型 API', { fill: C.background2, line: 'D5DCE4', bold: true, size: 15, color: C.text2 });
  label(s, bx, 2.38, bw, 0.4, '按调用计费，需要 API 密钥', { size: 12, align: 'center' });
  box(s, bx, 3.0, bw, 0.75, '本地 CLI 运行时', { fill: C.accent3, color: C.background1, bold: true, size: 15 });
  label(s, bx - 0.3, 3.78, bw + 0.6, 0.4, '沿用已有订阅，无需 API 密钥', { size: 12, align: 'center', color: C.text2, bold: true });
  const pts = [
    '自动检测本机已安装的工具：Codex、Claude Code、Cursor Agent、Qwen Code 等 26 种',
    '每个会话使用独立配置目录，不混入日常使用记录',
    '执行命令前先征得用户同意（Codex 全流程支持）',
    '进程统一管理，会话结束即回收',
  ];
  bullets(s, x, 4.45, 7.45, 2.2, pts, { size: 13.5, gap: 8 });
  shot(s, 'usage-local-runtime.jpg', 856, 890, MX + 7.85, 1.65, CW - 7.85, 4.75, '本机实测：自动检测到 Claude Code v2.1.288');
  label(s, MX, 6.62, CW, 0.38, '说明：Codex 走完整协议并支持审批；Claude Code 已验证会话隔离；其余工具为通用接入，按实际使用逐步验证。使用前请确认相应订阅的服务条款允许此类用法。', { size: 10.5 });
  s.addNotes(
    '很多团队已经购买了 ChatGPT（Codex）或 Claude 的订阅。本地运行时让 MedScience 直接调用本机已登录的命令行工具，沿用现有额度，不需要再申请 API 密钥。每个会话有独立配置目录，不会混入日常使用记录；Codex 还支持执行命令前逐项审批。右图是本机实测，检测到了 Claude Code。需要注意的是，除 Codex 和 Claude Code 外，其他工具目前是通用接入，另外请确认订阅条款允许这样使用。'
  );
}

// 13 -- usage 1
pres.addSection({ title: '使用说明' });
{
  const s = content('使用说明（一）：三步开始一次研究', '', '使用说明');
  const steps = [
    ['安装', '从 GitHub Releases 下载对应平台的安装包；或在源码目录运行 npm run web，用浏览器打开。'],
    ['配置运行时', '在“运行时（模型配置）”中绑定本机 AI 命令行工具，或填写一个模型 API。'],
    ['提问', '在输入框直接提问；输入 @ 可点名某位专家，或把课题交给科研小队。'],
  ];
  const sw = (CW - 2 * 0.3) / 3;
  steps.forEach(([t, d], i) => {
    const x = MX + i * (sw + 0.3);
    badge(s, x, 1.15, i + 1, C.accent2);
    label(s, x + 0.55, 1.15, sw - 0.6, 0.42, t, { size: 17, bold: true, color: C.text2, valign: 'middle' });
    label(s, x + 0.55, 1.6, sw - 0.6, 0.75, d, { size: 12.5 });
  });
  const half = (CW - 0.4) / 2;
  shot(s, 'usage-ask-mention.jpg', 1800, 448, MX, 2.75, half, 2.3, '输入 @ 点名专家（此处为“药理学专家”）');
  shot(s, 'usage-tools.jpg', 1800, 612, MX + half + 0.4, 2.75, half, 2.3, '智能体调用科研工具，每一步都有记录');
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: 5.65, w: CW, h: 0.95, rectRadius: 0.1, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: name('tip') });
  label(s, MX + 0.3, 5.65, CW - 0.6, 0.95, '四种用法共用同一套本机数据：在桌面端开始的研究，打开本地 Web 版也能看到；数据只保存在本机 ~/.medscience 目录。', { size: 14, valign: 'middle', color: C.text1 });
  s.addNotes(
    '三步即可开始：安装、配置运行时、提问。截图来自真实运行的 3.0 应用。左图是输入 @ 点名专家；右图是智能体调用文献检索、数据分析等工具，每一步都有记录、可展开查看。'
  );
}

// 14 -- usage 2
{
  const s = content('使用说明（二）：查看证据，追溯结论', '每个结论都能追到原始文献与证据记录。', '使用说明');
  const left = shot(s, 'usage-evidence-citations.jpg', 1800, 1792, MX, 1.75, 4.45, 4.45, '① 结论下方列出证据与原始文献，可一键打开原文');
  shot(s, 'usage-ledger.jpg', 1800, 1272, MX + left.w + 0.35, 1.75, CW - left.w - 0.35, 4.45, '② 证据账本：状态、来源、完整历史；可导入撤稿数据批量核查');
  label(s, MX, 6.68, CW, 0.3, '截图来自真实运行的 v3.0 应用。演示环境使用离线示例模型生成文字；文献列表为 PubMed 实时检索结果。', { size: 10.5 });
  s.addNotes(
    '左图：每个结论下方列出了证据和原始文献，都可以点开原文核对，这里的 8 篇文献是 PubMed 实时检索的真实结果。右图：证据账本，能看到每条证据的状态、来源、完整历史和哈希；在这里可以导入撤稿数据批量核查。需要说明，演示环境用的是离线示例模型，所以结论文字是演示用的，文献是真实的。'
  );
}

// 15 -- status and next steps
pres.addSection({ title: '进展与下一步' });
{
  const s = content('当前进展与下一步', '设计已全部落地并可下载使用；有效性还需要真实任务上的对照实验来证明。', '进展与下一步');
  const cols = [
    {
      t: '已完成',
      c: C.accent1,
      items: [
        'v3.0.0 已发布：macOS、Windows、Linux 安装包和本地 Web 版',
        '三类设计全部落地，并接入桌面端界面',
        '26 套自动化测试在三个平台持续通过',
        '修正旧版“按靶点名称打分”的问题，评分只看证据',
      ],
    },
    {
      t: '尚待验证',
      c: C.accent3,
      items: [
        '尚未在真实科研任务上做对照实验',
        '判定目前处于“未校准”状态，尚无覆盖率保证',
        '部分本地命令行工具仅为通用接入，待逐一验证',
      ],
    },
    {
      t: '下一步 · 需要的支持',
      c: C.accent2,
      items: [
        '组织领域专家标注一批真实假设（支持 / 反驳），用于校准与评测',
        '开展同等预算的对照实验：与扁平记忆、多智能体辩论比较',
        '结果稳定后合入主分支发布正式版，并整理成论文',
      ],
    },
  ];
  const cw = (CW - 2 * 0.3) / 3;
  cols.forEach((col, i) => {
    const x = MX + i * (cw + 0.3);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.8, w: cw, h: 4.3, rectRadius: 0.1, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: name('card') });
    badge(s, x + 0.3, 2.05, i + 1, col.c);
    label(s, x + 0.85, 2.05, cw - 1.1, 0.42, col.t, { size: 18, bold: true, color: C.text2, valign: 'middle' });
    bullets(s, x + 0.3, 2.75, cw - 0.55, 3.2, col.items, { size: 15, gap: 12 });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: 6.3, w: CW, h: 0.6, rectRadius: 0.08, fill: { color: C.text2 }, line: { color: C.text2 }, objectName: name('ask') });
  label(s, MX + 0.3, 6.3, CW - 0.6, 0.6, '请审阅：是否支持开展专家标注与同等预算对照实验（下一步第 1、2 项）。', { size: 15, bold: true, color: C.background1, valign: 'middle' });
  s.addNotes(
    '最后是进展和需要的支持。设计已经全部落地并发布，可以下载试用。尚待验证的是有效性：目前还没有在真实任务上做对照实验，判定处于未校准状态。下一步最需要的是领域专家标注一批真实假设，用于校准和评测；然后做同等预算的对照实验；结果稳定后发布正式版并整理论文。'
  );
}

// ------------------------------------------------------------------ write
(async () => {
  await pres.writeFile({ fileName: OUT });
  try {
    const { applyTheme } = require(process.env.PPTX_APPLY_THEME || 'apply_theme');
    await applyTheme(OUT, THEME);
  } catch (err) {
    if (process.env.PPTX_APPLY_THEME) throw err;
    console.warn('applyTheme not found; theme colours fall back to Office defaults. Set PPTX_APPLY_THEME to the pptx skill helper.');
  }
  console.log('wrote', OUT);
})();
