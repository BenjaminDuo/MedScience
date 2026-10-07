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
  title: 'TITLE_LIGHT',
  background: { color: HEX.lt1 },
  objects: [
    { rect: { x: MX, y: 1.95, w: 1.1, h: 0.09, fill: { color: HEX.accent1 } } },
    { rect: { x: 0, y: 7.2, w: W, h: 0.3, fill: { color: HEX.lt2 } } },
    {
      placeholder: {
        options: { name: 'title', type: 'title', x: MX, y: 2.3, w: 11.5, h: 1.2, fontSize: 48, bold: true, color: C.text2, align: 'left', valign: 'bottom', margin: 0 },
        text: '',
      },
    },
    {
      placeholder: {
        options: { name: 'body', type: 'body', x: MX, y: 3.6, w: 11.5, h: 1.6, fontSize: 22, color: C.text1, align: 'left', valign: 'top', margin: 0 },
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
// Storyline (12 slides): why -> what -> how it flows -> key designs ->
// supporting designs -> how to use -> status and the ask.

const TEAL_TINT = 'E3F3F1';
const AMBER_TINT = 'FBF4EC';
const CAT = { A: C.accent1, B: C.accent2, C: C.accent3 };

// A-class pain points and designs, in the author's exact wording.
const PAIN_A1 = '模型训练知识或旧检索结果中包含已经撤回、终止、失败复现或出现安全信号的证据，但模型仍把它们当作有效支持。';
const PAIN_A2 = '同一临床试验、同一患者队列可能产生多篇论文。模型容易把论文数量误认为独立证据数量；但简单去重又会丢掉长期随访、安全性和亚组信息。';
const PAIN_A3 = '普通检索智能体倾向于继续寻找支持性文献，很少主动寻找反证、失败复现或独立来源，容易形成确认偏差。';
const DESIGN_A1 = ['为每个 claim 维护状态：supported、contested、refuted、expired', '将新事件分类为撤回、试验终止、失败复现、安全信号等', '只更新受影响的 claim 或 endpoint', '不允许无关证据失效导致整个报告一起崩溃'];
const DESIGN_A2 = ['同一试验的多篇论文只贡献一次独立性权重；', '不同论文提供的互补 endpoint 仍然保留；', '独立研究增加证据强度，同源论文主要增加信息覆盖，而不是独立性。'];
const DESIGN_A3 = ['最可能改变当前结论的证据；', '与现有结论矛盾的证据；', '与已有来源最不依赖的证据；', '预期信息增益最高的证据。'];
const DESIGN_A3_NOTE = '它不是简单选择“相关性最高”的论文，而是主动寻找最有可能改变决策的证据。';

function card(s, x, y, w, h, fill = C.background2) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: fill }, line: { color: fill }, objectName: name('card') });
}

// 1 -- cover
pres.addSection({ title: '开篇' });
{
  const s = pres.addSlide({ masterName: 'TITLE_LIGHT', sectionTitle: '开篇' });
  s.addText('MedScience 3.0', { placeholder: 'title' });
  s.addText(
    [
      { text: '面向生物医学研究的科研智能体系统 · 设计汇报', options: { breakLine: true } },
      { text: '让每一个科研结论都有据可查、可以撤回、说得清可信度', options: { fontSize: 16, color: HEX.accent6 } },
    ],
    { placeholder: 'body' }
  );
  label(s, MX, 6.55, 8, 0.35, '2026 年 10 月  ·  版本 v3.0.0（预发布）', { size: 13, color: C.accent6 });
  s.addNotes(
    '开场一句话：MedScience 是一个面向生物医学研究的科研智能体系统，不是通用聊天助手。3.0 的重点不是让 AI 说得更多，而是让它的结论站得住：有证据、能撤回、可信度说得清，并且数据留在本机。'
  );
}

// 2 -- executive summary
pres.addSection({ title: '为什么' });
{
  const s = content('一页概要', '一句话：面向生物医学研究——让科研结论有证据、能撤回、说得清可信度，科研数据不出本机。', '为什么');
  const cards = [
    ['要解决的问题', C.accent3, 'AI 能很快给出科研结论，但依据哪些文献和数据、依据被新研究推翻后怎么办、可信度多高，往往说不清。'],
    ['我们的做法', C.accent1, '三类设计：证据治理（时间证据状态机、临床试验等价类聚合、矛盾优先主动验证）、多智能体协作（像课题组一样分工）、本地运行（数据留在本机）。'],
    ['当前进展', C.accent2, 'v3.0.0 已发布：三平台安装包和本地 Web 版。B、C 已落地；A 类中状态机已有原型，等价类聚合与矛盾优先验证在设计中。'],
  ];
  const cw = (CW - 2 * 0.3) / 3;
  cards.forEach(([t, c, b], i) => {
    const x = MX + i * (cw + 0.3);
    card(s, x, 1.8, cw, 2.85);
    badge(s, x + 0.3, 2.05, i + 1, c);
    label(s, x + 0.85, 2.05, cw - 1.1, 0.42, t, { size: 18, bold: true, color: C.text2, valign: 'middle' });
    label(s, x + 0.3, 2.7, cw - 0.6, 1.85, b, { size: 15, color: C.text1 });
  });
  const kpis = [
    ['3 类', '系统设计'],
    ['26 位', '科研领域专家角色'],
    ['26 种', '本地 AI 命令行工具可接入'],
    ['4 种', '使用方式（三平台 + Web）'],
  ];
  const kw = CW / 4;
  kpis.forEach(([n, t], i) => {
    label(s, MX + i * kw, 5.05, kw, 0.75, n, { size: 34, bold: true, color: C.accent1, align: 'center' });
    label(s, MX + i * kw, 5.8, kw, 0.4, t, { size: 13, align: 'center' });
  });
  s.addNotes(
    '这一页给出全貌：问题是什么、我们怎么做、做到哪一步。后面按“为什么、怎么设计、怎么用、下一步”的顺序展开，共 12 页。'
  );
}

// 3 -- problem and positioning
{
  const s = content('问题与定位：科研场景的四个痛点', '同类科研智能体各有所长；MedScience 的差异在于“结论治理”与“本地可用”。', '为什么');
  const head = (t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: HEX.dk2 }, fontSize: 14, valign: 'middle' } });
  const cell = (t, o = {}) => ({ text: t, options: { fontSize: 13, color: HEX.dk1, valign: 'middle', ...o } });
  const ours = (t) => cell(t, { color: HEX.dk2, bold: true });
  const pain = (t, body) => ({ text: [{ text: t, options: { bold: true, breakLine: true } }, { text: body }], options: { fontSize: 11.5, color: HEX.dk1, valign: 'middle' } });
  s.addTable(
    [
      [head('痛点'), head('同类方案的常见做法'), head('MedScience 的设计')],
      [pain('① 依据已失效，模型仍当作有效支持', PAIN_A1), cell('依赖模型训练知识或一次性检索\n（如 OpenAI Deep Research）'), ours('A1 时间证据状态机')],
      [pain('② 论文数量被误认为独立证据数量', PAIN_A2), cell('按篇列出引用\n（公开资料未见同源识别）'), ours('A2 临床试验等价类聚合')],
      [pain('③ 只找支持性文献，形成确认偏差', PAIN_A3), cell('按相关性检索；多智能体生成与辩论\n（如 Google AI co-scientist）'), ours('A3 矛盾优先主动验证')],
      [pain('④ 数据与成本', '临床数据不应出本机；已有订阅仍要另付 API 费。'), cell('以云端服务为主，按 API 调用计费'), ours('C 本地运行时：数据留本机，复用已订阅的 AI 命令行工具')],
    ],
    {
      x: MX, y: 1.7, w: CW, colW: [6.2, 3.0, CW - 9.2],
      rowH: [0.45, 1.15, 1.25, 1.05, 0.8],
      border: { type: 'solid', pt: 0.75, color: 'D5DCE4' },
      fill: { color: 'FFFFFF' },
      margin: [0.05, 0.12, 0.05, 0.12],
      fontFace: THEME.bodyFontFace,
      objectName: name('table'),
    }
  );
  label(s, MX, 6.62, CW, 0.32, '注：同类方案仅依据其公开发布的资料概括，不推断未公开的内部能力。', { size: 11 });
  s.addNotes(
    '左列是四个痛点，中间是同类方案通常怎么做，右列是我们的设计。前三个痛点对应证据治理的三个设计：依据已经失效、模型仍把它当作有效支持，对应时间证据状态机；同一试验的多篇论文被当成多条独立证据、而简单去重又会丢信息，对应临床试验等价类聚合；检索时只找支持性文献、形成确认偏差，对应矛盾优先主动验证。第四个痛点是数据与成本，对应本地运行时。同类方案只引用公开资料，不评价其未公开能力。'
  );
}

// 4 -- architecture with the three design categories
pres.addSection({ title: '怎么设计' });
{
  const s = content('总体架构：三类设计落在五层结构中', '均为科研智能体系统层面的架构设计，不修改基础大模型；底层模型可以随时替换。', '怎么设计');
  // legend
  const legend = [
    ['A', '证据治理设计', '管“结论凭什么成立”', CAT.A],
    ['B', '多智能体协作设计', '管“谁来做、谁把关”', CAT.B],
    ['C', '运行时与部署设计', '管“在哪里跑、用谁的额度”', CAT.C],
  ];
  const lw = CW / 3;
  legend.forEach(([k, t, d, c], i) => {
    const x = MX + i * lw;
    s.addText(k, { shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.06, x, y: 1.7, w: 0.42, h: 0.42, fill: { color: c }, line: { color: c }, fontSize: 15, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, objectName: name('tag') });
    label(s, x + 0.55, 1.66, lw - 0.6, 0.28, t, { size: 14, bold: true, color: C.text2 });
    label(s, x + 0.55, 1.93, lw - 0.6, 0.26, d, { size: 11.5 });
  });

  const lx = MX;
  const lab = 1.75;
  const gx = lx + lab + 0.15;
  const gw = 8.35;
  const hookX = gx + gw + 0.2;
  const hookW = MX + CW - hookX;
  const layers = [
    { n: '使用入口', k: 'C', items: ['桌面端（macOS / Windows / Linux）', '本地 Web（仅本机可访问）'] },
    { n: '协作层', k: 'B', items: ['队长规划', '成员并行执行', '审查员质量门', '写作专家综合'] },
    { n: '证据治理层', k: 'A', items: ['时间证据状态机', '临床试验等价类聚合', '矛盾优先主动验证'], hi: true },
    { n: '执行层', k: 'C', items: ['模型 API', '本地 CLI 运行时', '科研数据库连接器', '内核级沙盒'] },
    { n: '数据层', k: 'C', items: ['本机 ~/.medscience：会话 · 加密密钥库 · 配置 · 公开数据缓存'] },
  ];
  const top = 2.45;
  const lh = 0.72;
  const gap = 0.13;
  layers.forEach((L, i) => {
    const y = top + i * (lh + gap);
    box(s, lx, y, lab, lh, `${L.k} · ${L.n}`, { fill: CAT[L.k], color: C.background1, bold: true, size: 14 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: gx, y, w: gw, h: lh, rectRadius: 0.08,
      fill: { color: L.hi ? TEAL_TINT : HEX.lt2 }, line: { color: L.hi ? HEX.accent1 : HEX.lt2, width: L.hi ? 1.5 : 0.5 },
      objectName: name('layer'),
    });
    const n = L.items.length;
    const iw = (gw - 0.3 - (n - 1) * 0.15) / n;
    L.items.forEach((t, j) => box(s, gx + 0.15 + j * (iw + 0.15), y + 0.12, iw, lh - 0.24, t, { fill: C.background1, line: 'D5DCE4', size: 12.5 }));
  });
  const totalH = layers.length * lh + (layers.length - 1) * gap;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: hookX, y: top, w: hookW, h: totalH, rectRadius: 0.08, fill: { color: C.text2 }, line: { color: C.text2 }, objectName: name('hooks') });
  label(s, hookX + 0.1, top + 0.15, hookW - 0.2, 0.4, '防护钩子', { size: 15, bold: true, color: C.background1, align: 'center' });
  label(s, hookX + 0.1, top + 0.52, hookW - 0.2, 0.3, '贯穿每次工具调用', { size: 10.5, color: 'B9C7D6', align: 'center' });
  ['密钥脱敏', '临床数据门', '证据数值核验', '引用完整性检查'].forEach((t, i) => {
    box(s, hookX + 0.18, top + 0.95 + i * 0.72, hookW - 0.36, 0.56, t, { fill: '27466A', color: C.background1, size: 12 });
  });
  s.addNotes(
    '这一页同时回答“有哪几类设计”和“它们在系统里的位置”。A 类证据治理是绿色这一层：时间证据状态机（已有原型）、临床试验等价类聚合、矛盾优先主动验证（设计中）；B 类是协作层，即科研小队的组织方式；C 类是运行与部署，包括使用入口、执行层和本机数据层，在 2.x 已具备。右侧防护钩子贯穿每一次工具调用。需要强调：这些都是智能体系统层面的设计，没有训练或修改大模型本身。'
  );
}

// 5 -- data flow
{
  const s = content('一次科研提问的数据流转', '每一步都留下记录；依据被新研究推翻时，结论会被“追回”。', '怎么设计');
  const steps = [
    ['提问', '研究问题'],
    ['规划分工', '任务清单'],
    ['检索证据', '标题 + 摘要'],
    ['等价类聚合', 'claim → 试验 → 队列'],
    ['矛盾优先验证', '反证 / 失败复现'],
    ['状态机更新', '四种 claim 状态'],
    ['综合判断', '审查员把关'],
    ['输出结论', '结论 + 证据编号'],
  ];
  const n = steps.length;
  const g = 0.2;
  const bw = (CW - (n - 1) * g) / n;
  const y = 2.25;
  const bh = 0.95;
  const gov = new Set([3, 4, 5]);
  steps.forEach(([t, d], i) => {
    const x = MX + i * (bw + g);
    badge(s, x + bw / 2 - 0.19, y - 0.5, i + 1, gov.has(i) ? C.accent1 : C.accent2, 0.38);
    box(s, x, y, bw, bh, t, { fill: gov.has(i) ? TEAL_TINT : HEX.lt2, line: gov.has(i) ? HEX.accent1 : undefined, size: 13.5, bold: true, color: C.text2 });
    label(s, x - 0.05, y + bh + 0.1, bw + 0.1, 0.5, d, { size: 11.5, align: 'center' });
    if (i < n - 1) arrow(s, x + bw + 0.02, y + bh / 2, x + bw + g - 0.02, y + bh / 2, { color: C.accent6, width: 1.25 });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: 3.9, w: 0.3, h: 0.2, rectRadius: 0.03, fill: { color: TEAL_TINT }, line: { color: HEX.accent1 }, objectName: name('legend') });
  label(s, MX + 0.4, 3.85, 6, 0.3, '绿色：由证据治理层（A 类）完成的步骤', { size: 11.5, valign: 'middle' });

  const ly = 4.55;
  card(s, MX, ly, CW, 2.15, AMBER_TINT);
  label(s, MX + 0.3, ly + 0.2, 6, 0.4, '新事件到来时的回路（时间证据状态机）', { size: 15, bold: true, color: C.text2 });
  const fg = 0.45;
  const fw = (CW - 0.6 - 3 * fg) / 4;
  const fy = ly + 0.75;
  ['新事件：撤回 / 试验终止 /\n失败复现 / 安全信号', '分类事件类型', '只更新受影响的\nclaim 或 endpoint', '无关结论保持不变，\n报告不会整体崩溃'].forEach((t, i, arr) => {
    const x = MX + 0.3 + i * (fw + fg);
    box(s, x, fy, fw, 0.9, t, { fill: C.background1, line: HEX.accent3, size: 13, color: C.text1 });
    if (i < arr.length - 1) arrow(s, x + fw + 0.03, fy + 0.45, x + fw + fg - 0.03, fy + 0.45, { color: C.accent3, width: 1.5 });
  });
  label(s, MX + 0.3, ly + 1.75, CW - 0.6, 0.3, '例：2024 年伏塞洛托（Oxbryta）出现安全信号撤市 → 依赖“批准”的 claim 更新为 refuted → 只依赖 HOPE 试验的“能提高血红蛋白”保持不变。', { size: 11.5 });
  s.addNotes(
    '上排是一次科研提问的完整路径，每一步下面的小字是这一步产生的数据。绿色三步是证据治理层：先把检索到的论文按 claim、试验、患者队列聚合成等价类；再在固定预算内优先查找最可能改变结论的证据，包括反证和失败复现；最后由时间证据状态机更新每个 claim 的状态。下方是新事件到来时的回路：撤回、试验终止、失败复现或安全信号出现后，只更新受影响的 claim 或 endpoint，其余结论保持不变。'
  );
}

// 6-8 -- A class: the three evidence-governance designs. The pain-point and design
// wording below is the author's, fixed verbatim; slide 3 reuses the same strings.
function painCard(s, x, y, w, h, text) {
  card(s, x, y, w, h, AMBER_TINT);
  label(s, x + 0.25, y + 0.15, w - 0.5, 0.3, '痛点：', { size: 13, bold: true, color: C.accent3 });
  label(s, x + 0.25, y + 0.47, w - 0.5, h - 0.6, text, { size: 12.5, color: C.text1 });
}
function designHeader(s, x, y, w, text) {
  label(s, x, y, w, 0.32, text, { size: 13, bold: true, color: C.accent1 });
}

// 6 -- A1 temporal evidence state machine (example replayed in packages/core/tests/test-evidence-ledger.ts [8])
{
  const s = content('A 类设计 1：时间证据状态机', '证据会随时间失效；结论的状态必须跟着证据的最新事件走，而且只动受影响的部分。', '怎么设计');
  const lw = 6.3;
  painCard(s, MX, 1.7, lw, 1.45, PAIN_A1);
  card(s, MX, 3.3, lw, 3.35);
  designHeader(s, MX + 0.25, 3.42, lw - 0.5, '设计：');
  bullets(s, MX + 0.25, 3.85, lw - 0.5, 2.75, DESIGN_A1, { size: 14.5, gap: 14 });

  const rx = MX + lw + 0.3;
  const rw = CW - lw - 0.3;
  label(s, rx, 1.72, rw, 0.32, 'claim 的四种状态', { size: 13, bold: true, color: C.text2 });
  const states = [['supported', HEX.accent1], ['contested', HEX.accent3], ['refuted', HEX.accent5], ['expired', HEX.accent6]];
  const sw = (rw - 0.3) / 4;
  states.forEach(([t, c], i) => box(s, rx + i * (sw + 0.1), 2.1, sw, 0.5, t, { fill: c, color: C.background1, bold: true, size: 12 }));
  label(s, rx, 2.78, rw, 0.32, '触发状态变化的新事件', { size: 13, bold: true, color: C.text2 });
  ['撤回', '试验终止', '失败复现', '安全信号'].forEach((t, i) => box(s, rx + i * (sw + 0.1), 3.15, sw, 0.45, t, { fill: C.background1, line: HEX.accent3, size: 12, color: C.text1 }));

  card(s, rx, 3.8, rw, 2.85, AMBER_TINT);
  label(s, rx + 0.2, 3.9, rw - 0.4, 0.32, '例：伏塞洛托（Oxbryta），镰状细胞病', { size: 12.5, bold: true, color: C.text2 });
  const ehead = (t) => ({ text: t, options: { bold: true, color: HEX.dk2, fill: { color: 'F3E3CF' }, fontSize: 10.5, valign: 'middle' } });
  const ecell = (t, o = {}) => ({ text: t, options: { fontSize: 10.5, color: HEX.dk1, valign: 'middle', ...o } });
  s.addTable(
    [
      [ehead('时间'), ehead('事件'), ehead('claim A\n可用于治疗该病'), ehead('claim B\n能提高血红蛋白')],
      [ecell('2019'), ecell('HOPE 试验 + 加速批准'), ecell('supported', { color: HEX.accent1, bold: true }), ecell('supported', { color: HEX.accent1, bold: true })],
      [ecell('2024'), ecell('安全信号，撤市'), ecell('→ refuted', { color: HEX.accent5, bold: true }), ecell('不受影响', { bold: true })],
    ],
    { x: rx + 0.2, y: 4.3, w: rw - 0.4, colW: [0.55, 1.75, 1.45, rw - 0.4 - 3.75], rowH: [0.46, 0.32, 0.32], border: { type: 'solid', pt: 0.5, color: 'E6D3BC' }, fill: { color: 'FFFFFF' }, margin: [0.02, 0.06, 0.02, 0.06], fontFace: THEME.bodyFontFace, objectName: name('table') }
  );
  label(s, rx + 0.2, 5.5, rw - 0.4, 1.05, '只更新依赖“批准”的 claim A；claim B 只依赖 HOPE 试验，保持不变——无关证据失效不会让整个报告崩溃。HOPE 试验：NEJM 2019，PMID 31199090。', { size: 10.5, color: C.text1 });
  label(s, MX, 6.75, CW, 0.28, '实现状态：3.0 证据账本已实现依赖级联与撤稿扫描（原型），状态名称将对齐为上述四种；此例已写成自动化测试。', { size: 10 });
  s.addNotes(
    '第一个设计是时间证据状态机。痛点是：模型训练知识或旧检索结果里，包含已经撤回、终止、失败复现或出现安全信号的证据，模型仍把它们当作有效支持。设计上，每个 claim 维护四种状态：supported、contested、refuted、expired；新事件被分类为撤回、试验终止、失败复现、安全信号等；只更新受影响的 claim 或 endpoint，不允许无关证据失效导致整个报告一起崩溃。右下的伏塞洛托是真实例子：2024 年因上市后安全信号撤市，依赖“批准”的 claim A 被更新，而只依赖 HOPE 试验的 claim B 不受影响。3.0 的证据账本已经实现了依赖级联和撤稿扫描，是这个设计的原型，状态名称会对齐。'
  );
}

// 7 -- A2 clinical-trial equivalence classes
// Measured basis: packages/core/evaluation/source-redundancy and illusory-corroboration.
{
  const s = content('A 类设计 2：临床试验等价类聚合', '同一试验的多篇论文是一个“等价类”：独立性只算一次，信息一篇不丢。', '怎么设计');
  const lw = 6.3;
  painCard(s, MX, 1.7, lw, 1.7, PAIN_A2);
  card(s, MX, 3.55, lw, 3.1);
  designHeader(s, MX + 0.25, 3.67, lw - 0.5, '设计：');
  label(s, MX + 0.25, 4.02, lw - 0.5, 0.3, '按三层结构组织证据：', { size: 13, color: C.text1 });
  label(s, MX + 0.25, 4.36, lw - 0.5, 0.36, 'claim → study/trial → patient cohort', { size: 15, bold: true, color: C.text2 });
  bullets(s, MX + 0.25, 4.85, lw - 0.5, 1.75, DESIGN_A2, { size: 12.5, gap: 8 });

  // three-layer diagram with the monarchE example
  const rx = MX + lw + 0.3;
  const rw = CW - lw - 0.3;
  card(s, rx, 1.7, rw, 4.95);
  label(s, rx + 0.2, 1.8, rw - 0.4, 0.32, '例：阿贝西利用于乳腺癌', { size: 12.5, bold: true, color: C.text2 });
  box(s, rx + 0.2, 2.2, rw - 0.4, 0.5, 'claim：阿贝西利对 HR+/HER2− 乳腺癌有效', { fill: C.text2, color: C.background1, bold: true, size: 12 });
  const tw2 = (rw - 0.6) / 2;
  arrow(s, rx + 0.2 + tw2 / 2, 2.72, rx + 0.2 + tw2 / 2, 3.0, { color: C.text2 });
  arrow(s, rx + 0.4 + tw2 * 1.5, 2.72, rx + 0.4 + tw2 * 1.5, 3.0, { color: C.text2 });
  box(s, rx + 0.2, 3.02, tw2, 0.62, 'study/trial：monarchE\nNCT03155997', { fill: C.accent3, color: C.background1, bold: true, size: 11 });
  box(s, rx + 0.4 + tw2, 3.02, tw2, 0.62, 'study/trial：\n其他独立试验', { fill: C.accent1, color: C.background1, bold: true, size: 11 });
  arrow(s, rx + 0.2 + tw2 / 2, 3.66, rx + 0.2 + tw2 / 2, 3.9, { color: C.text2 });
  box(s, rx + 0.2, 3.92, tw2, 0.45, 'patient cohort：同一批受试者', { fill: C.background1, line: HEX.accent3, size: 10.5, color: C.text1 });
  label(s, rx + 0.2, 4.45, tw2, 0.3, '检索到 6 篇论文：', { size: 10.5, bold: true, color: C.text2 });
  ['主结果', '亚组分析', '长期随访', '安全性'].forEach((t, i) => box(s, rx + 0.2 + (i % 2) * (tw2 / 2 + 0.03), 4.78 + Math.floor(i / 2) * 0.42, tw2 / 2 - 0.03, 0.36, t, { fill: C.background1, line: 'D5DCE4', size: 10.5, color: C.text1 }));
  label(s, rx + 0.4 + tw2, 3.95, tw2, 1.7, '独立性权重：1\n（不是 6）\n\n互补 endpoint：\n全部保留', { size: 12, bold: true, color: C.accent1 });
  label(s, rx + 0.2, 5.68, rw - 0.4, 0.9, '实测：94 个问题中，含试验证据的问题 40% 存在同源论文；对照实验中给出摘要时模型受影响约 1 分（满分 100），只给标题时尚待检验。', { size: 10, color: C.accent6 });
  label(s, MX, 6.75, CW, 0.28, '实现状态：设计中；同源识别使用 PubMed 试验关联与摘要中的 NCT 编号，数据与脚本已存档（packages/core/evaluation）。', { size: 10 });
  s.addNotes(
    '第二个设计是临床试验等价类聚合。痛点是：同一临床试验、同一患者队列可能产生多篇论文，模型容易把论文数量误认为独立证据数量；但简单去重又会丢掉长期随访、安全性和亚组信息。设计上，证据按 claim、study/trial、patient cohort 三层组织：同一试验的多篇论文只贡献一次独立性权重，不同论文提供的互补 endpoint 仍然保留；独立研究增加证据强度，同源论文主要增加信息覆盖，而不是独立性。右边是真实例子：阿贝西利的前 20 篇检索结果中，有 6 篇来自同一个试验 monarchE，它们的独立性权重是 1，但主结果、亚组、长期随访、安全性这些信息都保留。需要如实说明：我们的实测显示同源论文很普遍，但在给出摘要的条件下，模型受影响只有约 1 分，只给标题的情况还没有检验。'
  );
}

// 8 -- A3 contradiction-first active verification
{
  const s = content('A 类设计 3：矛盾优先主动验证', '取证不是找“最相关”，而是找“最可能改变结论”的证据。', '怎么设计');
  const lw = 6.3;
  painCard(s, MX, 1.7, lw, 1.45, PAIN_A3);
  card(s, MX, 3.3, lw, 3.0);
  designHeader(s, MX + 0.25, 3.42, lw - 0.5, '设计：');
  label(s, MX + 0.25, 3.78, lw - 0.5, 0.3, '在固定证据预算下，优先选择：', { size: 13, color: C.text1 });
  DESIGN_A3.forEach((t, i) => {
    const y = 4.18 + i * 0.47;
    badge(s, MX + 0.3, y, i + 1, C.accent1, 0.34);
    label(s, MX + 0.75, y - 0.02, lw - 1.0, 0.38, t, { size: 13, color: C.text1, valign: 'middle' });
  });

  const rx = MX + lw + 0.3;
  const rw = CW - lw - 0.3;
  const half = (rw - 0.2) / 2;
  card(s, rx, 1.7, half, 2.95);
  label(s, rx + 0.2, 1.82, half - 0.4, 0.32, '普通检索智能体', { size: 13, bold: true, color: C.accent6 });
  bullets(s, rx + 0.2, 2.25, half - 0.4, 2.3, ['按相关性排序取前 N 篇', '继续寻找支持性文献', '很少主动找反证', '容易形成确认偏差'], { size: 12, gap: 6, color: C.accent6 });
  card(s, rx + half + 0.2, 1.7, half, 2.95, TEAL_TINT);
  label(s, rx + half + 0.4, 1.82, half - 0.4, 0.32, 'MedScience', { size: 13, bold: true, color: C.accent1 });
  bullets(s, rx + half + 0.4, 2.25, half - 0.4, 2.3, ['在固定预算内排序', '先查可能推翻结论的证据', '主动找失败复现', '优先找独立来源'], { size: 12, gap: 6 });
  card(s, rx, 4.8, rw, 1.5, AMBER_TINT);
  label(s, rx + 0.2, 4.9, rw - 0.4, 0.32, '例：17-OHPC（Makena）预防早产', { size: 12.5, bold: true, color: C.text2 });
  label(s, rx + 0.2, 5.22, rw - 0.4, 1.05, '已有支持：Meis 试验（NEJM 2003，PMID 12802023）。矛盾优先会主动去找最可能推翻它的证据——确证试验 PROLONG（Am J Perinatol 2020，PMID 31652479）未见效果，FDA 于 2023 年撤销批准。', { size: 11, color: C.text1 });
  box(s, MX, 6.42, CW, 0.45, DESIGN_A3_NOTE, { fill: C.background1, line: HEX.accent1, size: 12, bold: true, color: C.text2, align: 'left', margin: 0.12 });
  s.addNotes(
    '第三个设计是矛盾优先主动验证。痛点是：普通检索智能体倾向于继续寻找支持性文献，很少主动寻找反证、失败复现或独立来源，容易形成确认偏差。设计上，在固定证据预算下，优先选择最可能改变当前结论的证据、与现有结论矛盾的证据、与已有来源最不依赖的证据，以及预期信息增益最高的证据。它不是简单选择“相关性最高”的论文，而是主动寻找最有可能改变决策的证据。以 Makena 为例：已有 Meis 试验支持，矛盾优先会主动去找最可能推翻它的确证试验 PROLONG。实现上，3.0 已有按预期信息增益排序的规划器原型，“矛盾优先”和“来源独立性”两个排序因素是新增的设计。'
  );
}

// 9 -- B class: multi-agent collaboration
{
  const s = content('B 类设计：多智能体协作：像课题组一样分工', 'B 类管“谁来做、谁把关”：像课题组一样，有人规划、有人执行、有人审查、有人成文。', '怎么设计');
  const flow = [['研究课题', '用户提出'], ['队长规划', 'PI 拆解任务'], ['成员并行', '领域专家执行'], ['质量门', '规则 + 审查员'], ['综合报告', '写作专家成文']];
  const fg = 0.35;
  const fw = (CW - (flow.length - 1) * fg) / flow.length;
  flow.forEach(([t, d], i) => {
    const x = MX + i * (fw + fg);
    box(s, x, 1.85, fw, 0.75, t, { fill: i === 3 ? TEAL_TINT : HEX.lt2, line: i === 3 ? HEX.accent1 : undefined, size: 15, bold: true, color: C.text2 });
    label(s, x, 2.68, fw, 0.3, d, { size: 11.5, align: 'center' });
    if (i < flow.length - 1) arrow(s, x + fw + 0.03, 2.22, x + fw + fg - 0.03, 2.22, { color: C.accent2, width: 1.5 });
  });
  const roles = [
    ['队长（PI）', '把课题拆成有依赖的任务；可要求先审批计划，再开始执行。'],
    ['领域专家成员', '26 位领域专家角色并行工作；交接时每条发现都必须附证据编号。'],
    ['质量门', '规则检查 + 科研审查员；工具失败不算“阴性结果”。'],
    ['写作专家', '把通过质量门的发现综合成报告，结论附证据编号。'],
  ];
  const cw = (CW - 3 * 0.25) / 4;
  roles.forEach(([t, b], i) => {
    const x = MX + i * (cw + 0.25);
    card(s, x, 3.25, cw, 2.15);
    s.addText(String(i + 1), { shape: pres.shapes.OVAL, x: x + 0.25, y: 3.45, w: 0.4, h: 0.4, fill: { color: CAT.B }, line: { color: CAT.B }, fontSize: 14, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, objectName: name('badge') });
    label(s, x + 0.75, 3.43, cw - 0.9, 0.45, t, { size: 15, bold: true, color: C.text2, valign: 'middle' });
    label(s, x + 0.25, 4.0, cw - 0.45, 1.3, b, { size: 12.5, color: C.text1 });
  });
  const facts = [['26 位', '领域专家角色'], ['15 个', '团队模板'], ['@', '直接点名专家']];
  const kw = CW / 3;
  facts.forEach(([n, t], i) => {
    label(s, MX + i * kw, 5.6, kw, 0.6, n, { size: 28, bold: true, color: C.accent2, align: 'center' });
    label(s, MX + i * kw, 6.2, kw, 0.3, t, { size: 12, align: 'center' });
  });
  label(s, MX, 6.72, CW, 0.28, '实现状态：2.x 已具备，3.0 继续完善。', { size: 10 });
  s.addNotes(
    'B 类设计是多智能体协作，像课题组一样分工。队长（PI）把课题拆成有依赖的任务，可以要求先审批计划；领域专家成员并行执行，交接时每条发现都必须附证据编号；质量门由规则检查和科研审查员组成，工具失败不算“阴性结果”；最后由写作专家综合成文。系统内置 26 位领域专家角色、15 个团队模板，也可以用 @ 直接点名某位专家。这部分在 2.x 已经具备，3.0 继续完善。'
  );
}

// 10 -- C class: local runtime
{
  const s = content('C 类设计：本地运行时：直接用已有 AI 订阅', 'C 类管“在哪里跑、用谁的额度”：科研与临床数据留在本机，复用已订阅的 AI 命令行工具。', '怎么设计');
  const lw = 6.6;
  card(s, MX, 1.75, lw, 4.9);
  box(s, MX + 0.3, 2.35, 1.6, 0.7, '研究请求', { fill: C.text2, color: C.background1, bold: true, size: 14 });
  arrow(s, MX + 1.92, 2.7, MX + 2.3, 2.7, { color: C.accent6 });
  box(s, MX + 2.3, 2.35, 1.5, 0.7, '执行路由', { fill: C.accent6, color: C.background1, bold: true, size: 14 });
  const tx = MX + 4.25;
  const tw = lw - 4.25 - 0.3;
  arrow(s, MX + 3.82, 2.55, tx, 2.13, { color: C.accent6 });
  arrow(s, MX + 3.82, 2.85, tx, 3.27, { color: C.accent6 });
  box(s, tx, 1.9, tw, 0.5, '模型 API · 按调用计费', { fill: C.background1, line: 'D5DCE4', size: 12, color: C.text2 });
  box(s, tx, 3.02, tw, 0.5, '本地 CLI · 用已有订阅', { fill: C.accent3, color: C.background1, bold: true, size: 12 });
  bullets(s, MX + 0.3, 3.85, lw - 0.6, 2.0, [
    '自动检测本机已登录的 26 种 AI 命令行工具（如 Codex、Claude Code）',
    '每个会话独立配置目录，不混入日常使用记录',
    '执行命令前先征得同意（Codex 全流程支持）；数据留在本机',
    '临床数据门：原始病历与影像在本机沙盒内处理，外发需授权',
  ], { size: 13, gap: 8 });
  label(s, MX + 0.3, 5.95, lw - 0.6, 0.6, '说明：Codex 走完整协议并支持审批；Claude Code 已验证会话隔离；其余工具为通用接入。使用前请确认订阅条款允许此类用法。', { size: 10.5 });
  const rx = MX + lw + 0.3;
  shot(s, 'usage-local-runtime.jpg', 856, 890, rx, 1.75, CW - lw - 0.3, 4.55, '运行时页面：自动检测到本机的 Claude Code');
  label(s, MX, 6.72, CW, 0.28, '实现状态：2.x 已具备，3.0 继续完善。', { size: 10 });
  s.addNotes(
    'C 类设计是本地运行时，直接用已有 AI 订阅。很多团队已经买了 ChatGPT（Codex）或 Claude 的订阅，MedScience 可以直接调用本机已登录的命令行工具，沿用现有额度，不需要另付 API 费用；同时科研与临床数据留在本机，原始病历与影像在本机沙盒内处理，外发需要授权。右边是真实截图：运行时页面自动检测到了本机的 Claude Code。需要说明：除 Codex 和 Claude Code 外，其余工具是通用接入，并请确认订阅条款允许这样使用。'
  );
}

// 11 -- usage
pres.addSection({ title: '怎么用' });
{
  const s = content('使用说明：四步完成一次可追溯的研究', '截图来自真实运行的 v3.0 应用。', '怎么用');
  const colW = (CW - 2 * 0.35) / 3;
  const steps = [
    ['配置运行时', '安装后打开“运行时（模型配置）”，绑定本机 AI 命令行工具或填写模型 API。'],
    ['提问', '直接提问；输入 @ 点名专家，或交给科研小队。'],
    ['查看证据', '查看每条证据的来源与状态（3.0 证据页）。'],
  ];
  label(s, MX, 1.62, CW, 0.32, '① 安装：从 GitHub Releases 下载对应平台安装包；或在源码目录运行 npm run web，用浏览器打开。', { size: 13, color: C.text1 });
  steps.forEach(([t, d], i) => {
    const x = MX + i * (colW + 0.35);
    badge(s, x, 2.08, i + 2, C.accent2, 0.38);
    label(s, x + 0.5, 2.06, colW - 0.5, 0.42, t, { size: 16, bold: true, color: C.text2, valign: 'middle' });
    label(s, x, 2.52, colW, 0.55, d, { size: 12, color: C.text1 });
  });
  const y0 = 3.15;
  const x1 = MX;
  const x2 = MX + colW + 0.35;
  const x3 = MX + 2 * (colW + 0.35);
  shot(s, 'usage-local-runtime.jpg', 856, 890, x1, y0, colW, 3.1, '自动检测到本机的 Claude Code');
  shot(s, 'usage-ask-mention.jpg', 1800, 448, x2, y0, colW, 1.0);
  shot(s, 'usage-tools.jpg', 1800, 612, x2, y0 + 1.15, colW, 1.6, '@ 点名专家；工具调用逐步可查');
  shot(s, 'usage-ledger.jpg', 1800, 1272, x3, y0, colW, 3.3, '3.0 证据页：来源、状态、历史');
  label(s, MX, 6.75, CW, 0.28, '演示环境使用离线示例模型生成文字；文献为 PubMed 实时检索结果。', { size: 10.5 });
  s.addNotes(
    '四步即可：安装、配置运行时、提问、查看证据。左图是运行时自动检测到本机的 Claude Code；中间是用 @ 点名专家，以及智能体调用工具的记录；右图是 3.0 的证据页，每条证据的来源和状态都能查到。截图都来自真实运行的 3.0 应用。'
  );
}

// 12 -- status and next steps
pres.addSection({ title: '下一步' });
{
  const s = content('当前进展与下一步', 'B、C 已落地；A 类三个设计中，时间证据状态机已有原型，其余两个在设计中。', '下一步');
  const cols = [
    ['已完成', C.accent1, ['v3.0.0 已发布：三平台安装包和本地 Web 版', 'B 多智能体协作、C 本地运行时已落地', 'A1 状态机原型：依赖级联与撤稿扫描，真实案例写成自动化测试', '实测：40% 的问题存在同源论文']],
    ['尚待完成', C.accent3, ['A1 状态名称对齐四种状态，接入试验终止、安全信号等事件源', 'A2 等价类聚合、A3 矛盾优先验证尚未实现', '文献检索目前只返回标题，需附上摘要']],
    ['下一步 · 需要的支持', C.accent2, ['实现 A1–A3 三个设计并接入正式流程', '无人工标注的评测：用公开结局（获批 / 疗效失败）检验三个设计', '在结论不确定的问题上复核同源影响（只给标题 vs 附摘要）', '结果稳定后发布正式版，并整理成论文']],
  ];
  const cw = (CW - 2 * 0.3) / 3;
  cols.forEach(([t, c, items], i) => {
    const x = MX + i * (cw + 0.3);
    card(s, x, 1.8, cw, 4.3);
    badge(s, x + 0.3, 2.05, i + 1, c);
    label(s, x + 0.85, 2.05, cw - 1.1, 0.42, t, { size: 18, bold: true, color: C.text2, valign: 'middle' });
    bullets(s, x + 0.3, 2.75, cw - 0.55, 3.25, items, { size: 14, gap: 9 });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: 6.3, w: CW, h: 0.6, rectRadius: 0.08, fill: { color: C.text2 }, line: { color: C.text2 }, objectName: name('ask') });
  label(s, MX + 0.3, 6.3, CW - 0.6, 0.6, '请审阅：是否支持实现 A 类三个设计并开展评测（下一步第 1、2 项）。', { size: 15, bold: true, color: C.background1, valign: 'middle' });
  s.addNotes(
    '最后是进展和请求。B、C 两类设计已经落地并发布。A 类三个设计中，时间证据状态机已有原型：3.0 的证据账本实现了依赖级联和撤稿扫描，并用真实案例写成了自动化测试，下一步要把状态对齐为 supported、contested、refuted、expired 四种，并接入试验终止、安全信号等事件源；临床试验等价类聚合和矛盾优先主动验证还在设计中。下一步是实现这三个设计，并用公开结局做无人工标注的评测；同时在结论不确定的问题上复核同源影响。结果稳定后发布正式版，并整理成论文。'
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
