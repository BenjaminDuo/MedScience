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
// Storyline (11 slides): why -> what -> how it flows -> key designs ->
// supporting designs -> how to use -> status and the ask.

const TEAL_TINT = 'E3F3F1';
const AMBER_TINT = 'FBF4EC';
const CAT = { A: C.accent1, B: C.accent2, C: C.accent3 };

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
    ['我们的做法', C.accent1, '三类设计：证据治理（识别同源证据，按独立证据线定级）、多智能体协作（像课题组一样分工、审查把关）、本地运行（科研与临床数据留在本机）。'],
    ['当前进展', C.accent2, 'v3.0.0 已发布：三平台安装包和本地 Web 版。证据治理新方案已完成小规模实测（40% 的问题存在同源证据），待接入系统。'],
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
    '这一页给出全貌：问题是什么、我们怎么做、做到哪一步。后面按“为什么、怎么设计、怎么用、下一步”的顺序展开，共 11 页。'
  );
}

// 3 -- problem and positioning
{
  const s = content('问题与定位：科研场景的四个痛点', '同类科研智能体各有所长；MedScience 的差异在于“结论治理”与“本地可用”。', '为什么');
  const head = (t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: HEX.dk2 }, fontSize: 14, valign: 'middle' } });
  const cell = (t, o = {}) => ({ text: t, options: { fontSize: 13, color: HEX.dk1, valign: 'middle', ...o } });
  const ours = (t) => cell(t, { color: HEX.dk2, bold: true });
  s.addTable(
    [
      [head('痛点'), head('同类方案的常见做法'), head('MedScience 的回应')],
      [
        cell('① 结论难追溯，错误会固化\n依据的试验或数据被新研究推翻，结论仍被反复引用'),
        cell('检索后生成带引用的报告\n（如 OpenAI Deep Research）'),
        ours('实时状态核验：依据被推翻，相关结论当场降级'),
      ],
      [
        cell('② 证据看似很多，其实同源\n同一试验衍生多篇论文，被重复计数'),
        cell('按篇列出引用\n（公开资料未见同源识别）'),
        ours('独立证据线定级：同源合并，看有几条独立证据'),
      ],
      [
        cell('③ 假设成立与否，可信度说不清\n“80% 可信”从何而来，无法核验'),
        cell('自动打分或排名\n（分数本身缺少统计口径）'),
        ours('按证据类型定级：遗传学、动物模型、临床相互印证'),
      ],
      [
        cell('④ 数据与成本\n临床数据不应出本机；已有订阅仍要另付 API 费'),
        cell('以云端服务为主，按 API 调用计费'),
        ours('本地运行：数据留本机，复用已订阅的 AI 命令行工具'),
      ],
    ],
    {
      x: MX, y: 1.75, w: CW, colW: [4.2, 3.7, CW - 7.9],
      rowH: [0.5, 1.0, 1.0, 1.0, 1.0],
      border: { type: 'solid', pt: 0.75, color: 'D5DCE4' },
      fill: { color: 'FFFFFF' },
      margin: [0.06, 0.15, 0.06, 0.15],
      fontFace: THEME.bodyFontFace,
      objectName: name('table'),
    }
  );
  label(s, MX, 6.55, CW, 0.35, '注：同类方案仅依据其公开发布的资料概括，不推断未公开的内部能力。', { size: 11 });
  s.addNotes(
    '左列是四个痛点，中间是同类方案通常怎么做，右列是我们的回应。前三个对应证据治理设计，其中第二个“同源证据被重复计数”是我们的核心切入点；第四个对应本地运行时。同类方案只引用公开资料，不评价其未公开能力。'
  );
}

// 4 -- architecture with the three design categories
pres.addSection({ title: '怎么设计' });
{
  const s = content('总体架构：三类设计落在五层结构中', '均为科研智能体系统层面的架构设计，不修改基础大模型；底层模型可以随时替换。', '怎么设计');
  // legend
  const legend = [
    ['A', '证据治理设计', '管“结论凭什么成立”（新方案，已实测）', CAT.A],
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
    { n: '证据治理层', k: 'A', items: ['即时来源溯源', '同源合并', '独立证据线定级', '实时状态核验'], hi: true },
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
    '这一页同时回答“有哪几类设计”和“它们在系统里的位置”。A 类证据治理是新的一层（绿色框）：即时溯源、同源合并、独立证据线定级、实时状态核验，已完成实测，待接入系统；B 类是协作层，即科研小队的组织方式；C 类是运行与部署，包括使用入口、执行层和本机数据层，在 2.x 已具备。右侧防护钩子贯穿每一次工具调用。需要强调：这些都是智能体系统层面的设计，没有训练或修改大模型本身。'
  );
}

// 5 -- data flow
{
  const s = content('一次科研提问的数据流转', '每一步都留下记录；依据被新研究推翻时，结论会被“追回”。', '怎么设计');
  const steps = [
    ['提问', '研究问题'],
    ['规划分工', '任务清单'],
    ['检索证据', '文献与数据库结果'],
    ['数值核验', '会话证据 EV-n'],
    ['来源溯源', '上游试验 / 数据集'],
    ['同源合并', '独立证据线'],
    ['定级', '支持 / 反证 / 类型'],
    ['输出结论', '结论 + 证据线'],
  ];
  const n = steps.length;
  const g = 0.2;
  const bw = (CW - (n - 1) * g) / n;
  const y = 2.25;
  const bh = 0.95;
  const gov = new Set([4, 5, 6]);
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
  label(s, MX + 0.3, ly + 0.2, 6, 0.4, '依据被推翻时的回路', { size: 15, bold: true, color: C.text2 });
  const fg = 0.45;
  const fw = (CW - 0.6 - 3 * fg) / 4;
  const fy = ly + 0.75;
  ['回答时核验每个来源\n（撤稿 / 试验终止 / 撤市）', '发现已失效的来源', '依赖它的结论：\n当场降级', '提示复核：列出\n受影响的证据线'].forEach((t, i, arr) => {
    const x = MX + 0.3 + i * (fw + fg);
    box(s, x, fy, fw, 0.9, t, { fill: C.background1, line: HEX.accent3, size: 13, color: C.text1 });
    if (i < arr.length - 1) arrow(s, x + fw + 0.03, fy + 0.45, x + fw + fg - 0.03, fy + 0.45, { color: C.accent3, width: 1.5 });
  });
  label(s, MX + 0.3, ly + 1.75, CW - 0.6, 0.3, '例：2024 年伏塞洛托（Oxbryta）因上市后数据显示死亡增多而撤市 → 核验发现“批准”已失效 → “可用于治疗镰状细胞病”的结论当场降级。', { size: 11.5 });
  s.addNotes(
    '上排是一次科研提问的完整路径，每一步下面的小字是这一步产生的数据。绿色三步是证据治理层：把每条证据追溯到上游的试验或数据集，同源的合并成一条独立证据线，再按支持、反证和证据类型给结论定级。下方是回路：每次回答时实时核验来源的当前状态，比如论文撤稿、试验因无效终止、药品撤市，一旦失效，依赖它的结论当场降级并提示复核。全部用公开数据库现查现算，不需要自建证据库。'
  );
}

// 6 -- core design: independent lines of evidence
// Example and counts: packages/core/evaluation/source-redundancy (abemaciclib /
// monarchE NCT03155997: 6 of the top 20 papers).
{
  const s = content('核心设计：独立证据线定级——看有几条独立证据，而不是引用了几篇', 'A 类设计：即时追溯每条证据的来源，同源合并，按独立证据线给结论定级。', '怎么设计');
  // ---- left: real example of same-source papers
  const lw = 7.3;
  card(s, MX, 1.75, lw, 4.95);
  label(s, MX + 0.3, 1.9, lw - 0.6, 0.36, '真实例子：“阿贝西利能否用于乳腺癌”，系统检索到的前 20 篇论文', { size: 13.5, bold: true, color: C.text2 });
  const px = MX + 0.3;
  const pw = 1.55;
  for (let i = 0; i < 6; i++) {
    box(s, px, 2.45 + i * 0.37, pw, 0.3, `论文 ${i + 1}`, { fill: C.background1, line: HEX.accent3, size: 11, color: C.text1 });
  }
  box(s, px, 2.45 + 6 * 0.37 + 0.06, pw, 0.5, '其余 14 篇\n（各自独立或无法追溯）', { fill: C.background1, line: 'D5DCE4', size: 9.5, color: C.accent6 });
  const tx = px + pw + 1.35;
  const tw = 2.0;
  const ty = 2.45 + 2.5 * 0.37 - 0.35 + 0.15;
  for (let i = 0; i < 6; i++) arrow(s, px + pw + 0.03, 2.45 + i * 0.37 + 0.15, tx - 0.03, ty + 0.35, { color: C.accent3, width: 1 });
  label(s, px + pw + 0.3, ty - 0.95, 2.2, 0.5, '即时溯源\n（PubMed 试验关联）', { size: 10, align: 'center', color: C.accent3 });
  box(s, tx, ty, tw, 0.7, 'monarchE 三期试验\nNCT03155997', { fill: C.accent3, color: C.background1, bold: true, size: 11.5 });
  arrow(s, tx + tw + 0.03, ty + 0.35, tx + tw + 0.5, ty + 0.35, { color: C.text2, width: 1.5 });
  box(s, tx + tw + 0.53, ty - 0.05, MX + lw - 0.3 - (tx + tw + 0.53), 0.8, '计为 1 条\n独立证据', { fill: TEAL_TINT, line: HEX.accent1, bold: true, size: 13, color: C.text2 });
  label(s, tx - 0.2, ty + 0.85, MX + lw - 0.3 - tx + 0.2, 0.75, '同一批受试者的主结果、亚组分析、长期随访等 6 篇论文，只能算 1 条证据；按篇数计会被放大 6 倍。', { size: 11, color: C.text1 });
  // grading rule
  const gy = 5.36;
  label(s, MX + 0.3, gy, lw - 0.6, 0.3, '定级规则（设计）', { size: 12, bold: true, color: C.text2 });
  const gw = (lw - 0.6 - 2 * 0.15) / 3;
  [
    ['≥ 2 类独立证据线相互印证', '较强', C.accent1],
    ['仅 1 条独立证据线', '待印证', C.accent3],
    ['存在独立的反向证据线', '有争议', HEX.accent5],
  ].forEach(([t, v, c], i) => {
    const x = MX + 0.3 + i * (gw + 0.15);
    box(s, x, gy + 0.33, gw, 0.72, `${t}\n→ ${v}`, { fill: C.background1, line: c, size: 11, color: C.text1 });
  });

  // ---- right: three points
  const rx = MX + lw + 0.35;
  const rw = CW - lw - 0.35;
  [
    ['即时溯源', '每条证据追到上游：哪个试验、数据集、GWAS 研究或原始论文。全部来自公开数据库，现查现算——无需自建证据库，无需人工标注。'],
    ['同源合并', '同一试验 / 数据集衍生的多篇论文只计 1 条；预印本与正式版、荟萃分析与其纳入研究同理。'],
    ['按独立证据线定级', '看遗传学、动物模型、临床试验等几类独立证据是否相互印证；下结论前先找反证（失败试验、阴性结果）。'],
  ].forEach(([t, b], i) => {
    const y = 1.85 + i * 1.62;
    badge(s, rx, y, i + 1, C.accent1);
    label(s, rx + 0.58, y - 0.02, rw - 0.58, 0.45, t, { size: 16, bold: true, color: C.text2, valign: 'middle' });
    label(s, rx + 0.58, y + 0.45, rw - 0.58, 1.1, b, { size: 12.5 });
  });
  s.addNotes(
    '这是 A 类的核心设计。现有科研智能体大多按“引用了几篇文献”来呈现证据，但很多论文其实来自同一个试验。看左边这个真实例子：问“阿贝西利能否用于乳腺癌”，系统检索到的前 20 篇论文里，有 6 篇都来自同一个三期试验 monarchE，是同一批受试者的主结果、亚组分析和随访，只能算 1 条证据。我们的做法分三步：第一，即时溯源，把每条证据追到它的上游试验、数据集或原始论文，用的都是公开数据库，每个问题现查现算，不需要自建证据库，也不需要人工标注；第二，同源合并；第三，按独立证据线定级，看遗传学、动物模型、临床试验这几类独立证据是否相互印证，下结论前先主动找反证。下面的定级规则是设计方案，具体阈值会用实测数据确定。'
  );
}

// 7 -- live status check: two real cases (replayed in packages/core/tests/test-evidence-ledger.ts [8], [9])
{
  const s = content('实时状态核验：依据被推翻，结论当场降级', '回答时核验每个来源的当前状态（撤稿、试验终止、药品撤市），只降级真正依赖它的结论。', '怎么设计');
  const half = (CW - 0.3) / 2;
  const ehead = (t) => ({ text: t, options: { bold: true, color: HEX.dk2, fill: { color: 'F3E3CF' }, fontSize: 11, valign: 'middle' } });
  const ecell = (t, o = {}) => ({ text: t, options: { fontSize: 11, color: HEX.dk1, valign: 'middle', ...o } });
  const tableOpts = (x, y, w, colW, rowH) => ({
    x, y, w, colW, rowH,
    border: { type: 'solid', pt: 0.5, color: 'E6D3BC' }, fill: { color: 'FFFFFF' }, margin: [0.03, 0.07, 0.03, 0.07], fontFace: THEME.bodyFontFace,
    objectName: name('table'),
  });
  // case 1: voxelotor
  const ax = MX;
  card(s, ax, 1.75, half, 4.75, AMBER_TINT);
  label(s, ax + 0.3, 1.92, half - 0.6, 0.36, '案例一：伏塞洛托（Oxbryta），镰状细胞病', { size: 14, bold: true, color: C.text2 });
  label(s, ax + 0.3, 2.3, half - 0.6, 0.3, '看点：只降级依赖失效来源的结论', { size: 11.5, color: C.accent3, bold: true });
  s.addTable(
    [
      [ehead('时间'), ehead('事件'), ehead('结论 A\n可用于治疗该病'), ehead('结论 B\n能提高血红蛋白')],
      [ecell('2019'), ecell('HOPE 试验 + 加速批准'), ecell('支持', { color: HEX.accent1, bold: true }), ecell('支持', { color: HEX.accent1, bold: true })],
      [ecell('2024'), ecell('上市后死亡增多，撤市'), ecell('→ 降级', { color: HEX.accent3, bold: true }), ecell('不受影响', { bold: true })],
    ],
    tableOpts(ax + 0.3, 2.75, half - 0.6, [0.62, 1.88, 1.35, half - 0.6 - 3.85], [0.5, 0.36, 0.36])
  );
  label(s, ax + 0.3, 4.15, half - 0.6, 1.3, '结论 A 依赖“批准”与 HOPE 试验，核验发现批准已撤销，当场降级；结论 B 只依赖 HOPE 试验，血红蛋白确实升高，保持不变。替代指标改善不等于临床获益。', { size: 12, color: C.text1 });
  label(s, ax + 0.3, 5.75, half - 0.6, 0.5, '文献：HOPE 试验，NEJM 2019（PMID 31199090）', { size: 10 });

  // case 2: Makena
  const bx = MX + half + 0.3;
  card(s, bx, 1.75, half, 4.75, AMBER_TINT);
  label(s, bx + 0.3, 1.92, half - 0.6, 0.36, '案例二：Makena（17-OHPC），预防早产', { size: 14, bold: true, color: C.text2 });
  label(s, bx + 0.3, 2.3, half - 0.6, 0.3, '看点：独立证据线方向相反时，保留分歧、不替人裁决', { size: 11.5, color: C.accent3, bold: true });
  s.addTable(
    [
      [ehead('时间'), ehead('事件'), ehead('结论“可降低早产风险”')],
      [ecell('2003'), ecell('Meis 试验：早产风险下降'), ecell('支持（1 条证据线）', { color: HEX.accent1, bold: true })],
      [ecell('2020'), ecell('确证试验 PROLONG：未见效果'), ecell('→ 有争议：两条独立证据线相反', { color: HEX.accent3, bold: true })],
      [ecell('2023'), ecell('FDA 撤销批准'), ecell('→ 降级，并列出双方证据', { color: HEX.accent5, bold: true })],
    ],
    tableOpts(bx + 0.3, 2.75, half - 0.6, [0.62, 2.25, half - 0.6 - 2.87], [0.4, 0.42, 0.55, 0.42])
  );
  label(s, bx + 0.3, 4.65, half - 0.6, 1.0, '两项试验来自不同受试者，是两条独立证据线；系统把双方都摆出来，标为“有争议”，由专家判断。', { size: 12, color: C.text1 });
  label(s, bx + 0.3, 5.75, half - 0.6, 0.5, '文献：Meis 等，NEJM 2003（PMID 12802023）；PROLONG，Am J Perinatol 2020（PMID 31652479）', { size: 10 });

  label(s, MX, 6.62, CW, 0.3, '两个案例已在 3.0 原型中写成自动化测试；实时核验的数据来源：撤稿库、ClinicalTrials.gov 试验状态、FDA 药品信息。', { size: 10 });
  s.addNotes(
    '第二个设计点是实时状态核验。证据会被新研究推翻：论文撤稿、试验因无效终止、药品撤市。系统在回答时核验每个来源的当前状态，一旦失效，只降级真正依赖它的结论。左边伏塞洛托：2019 年凭 HOPE 试验中血红蛋白升高获批，2024 年因上市后死亡增多撤市。结论 A“可用于治疗该病”依赖批准，当场降级；结论 B“能提高血红蛋白”只依赖 HOPE 试验，保持不变——这正是替代指标改善不等于临床获益的典型例子。右边 Makena：2003 年 Meis 试验显示早产风险下降，2020 年确证试验 PROLONG 没有重复出效果，两项试验来自不同受试者，是两条方向相反的独立证据线，系统把双方都列出来、标为有争议，不替人裁决；2023 年 FDA 撤销批准后结论降级。这两个案例都在 3.0 原型中写成了自动化测试，文献编号已经 PubMed 核实。'
  );
}

// 8 -- measured evidence for the design (annotation-free)
// Numbers: packages/core/evaluation/source-redundancy/summary.json and
// packages/core/evaluation/outcome-model-pilot/estimate_*.json.
{
  const s = content('实测：同源证据普遍存在，证据类型决定区分力', '两项小规模实测，标签全部来自公开结局（获批 / 因疗效不足失败），无人工标注。', '怎么设计');
  const half = (CW - 0.3) / 2;
  // left: redundancy
  const ax = MX;
  card(s, ax, 1.75, half, 4.85);
  badge(s, ax + 0.3, 1.95, 1, C.accent1);
  label(s, ax + 0.85, 1.92, half - 1.1, 0.45, '检索到的证据有多少是同源的', { size: 16, bold: true, color: C.text2, valign: 'middle' });
  label(s, ax + 0.3, 2.45, half - 0.6, 0.5, '94 个真实“药物–疾病”问题，系统自带文献检索取前 20 篇，共 1649 篇；按 PubMed 试验关联溯源。', { size: 11, color: C.text1 });
  const kpis = [
    ['40%', '含试验证据的问题中，\n存在同源论文的比例（25 / 62）'],
    ['29%', '试验类论文中，\n属于重复计数的比例（60 / 207）'],
    ['8 篇', '单个问题中，\n来自同一个试验的最多篇数'],
  ];
  kpis.forEach(([n, t], i) => {
    const y = 3.1 + i * 0.95;
    label(s, ax + 0.3, y, 1.55, 0.7, n, { size: 30, bold: true, color: C.accent3, align: 'center', valign: 'middle' });
    label(s, ax + 1.95, y + 0.05, half - 2.25, 0.65, t, { size: 11.5, color: C.text1, valign: 'middle' });
  });
  label(s, ax + 0.3, 5.95, half - 0.6, 0.55, '只识别了明确的试验编号；共享队列、数据集、预印本等尚未计入，真实比例只会更高。', { size: 10.5, color: C.accent6 });

  // right: which evidence types discriminate
  const bx = MX + half + 0.3;
  card(s, bx, 1.75, half, 4.85);
  badge(s, bx + 0.3, 1.95, 2, C.accent1);
  label(s, bx + 0.85, 1.92, half - 1.1, 0.45, '哪类证据能区分“有效 / 无效”', { size: 16, bold: true, color: C.text2, valign: 'middle' });
  label(s, bx + 0.3, 2.45, half - 0.6, 0.5, '已获批靶点 vs 因疗效不足失败的靶点：各类证据出现的比例（114 个靶点 / 94 对靶点–疾病）。', { size: 11, color: C.text1 });
  const rows = [
    ['只看靶点：有强活性化合物', 88, 81, 'B4BFCC'],
    ['只看靶点：有临床试验登记', 100, 100, 'B4BFCC'],
    ['靶点–疾病：动物模型证据', 38, 17, HEX.accent1],
    ['靶点–疾病：人类遗传学证据', 35, 17, HEX.accent1],
  ];
  const lx2 = bx + 0.3;
  const barX = lx2 + 2.55;
  const barW = half - 0.6 - 2.55 - 0.55;
  label(s, barX, 3.0, barW + 0.5, 0.26, '上条：获批组　下条（浅色）：失败组', { size: 9.5, color: C.accent6 });
  rows.forEach(([t, a, b, c], i) => {
    const y = 3.32 + i * 0.6;
    label(s, lx2, y, 2.5, 0.5, t, { size: 10.5, color: C.text1, valign: 'middle' });
    s.addShape(pres.shapes.RECTANGLE, { x: barX, y: y + 0.04, w: barW * a / 100, h: 0.18, fill: { color: c }, line: { color: c }, objectName: name('bar') });
    label(s, barX + barW * a / 100 + 0.05, y - 0.02, 0.5, 0.26, `${a}%`, { size: 9.5, bold: true, color: C.text1, valign: 'middle' });
    s.addShape(pres.shapes.RECTANGLE, { x: barX, y: y + 0.27, w: barW * b / 100, h: 0.18, fill: { color: c, transparency: 55 }, line: { color: c, transparency: 55 }, objectName: name('bar') });
    label(s, barX + barW * b / 100 + 0.05, y + 0.22, 0.5, 0.26, `${b}%`, { size: 9.5, color: C.text1, valign: 'middle' });
  });
  box(s, bx + 0.3, 5.75, half - 0.6, 0.72, '只看靶点本身分不出有效与否；遗传学与动物模型证据才有区分力，与 Nature 2024 一致（有遗传学支持的药物机制成功率高 2.6 倍）。', { fill: TEAL_TINT, line: HEX.accent1, size: 10.5, align: 'left', margin: 0.08, color: C.text2 });
  label(s, MX, 6.68, CW, 0.3, '样本量小：动物模型差异 p = 0.023，遗传学 p = 0.062。数据与脚本已存档，可复现（packages/core/evaluation）。', { size: 10 });
  s.addNotes(
    '这一页是支撑这个设计的两项实测，全部用公开数据，没有人工标注。左边：我们拿 94 个真实的药物–疾病问题，用系统自带的文献检索各取前 20 篇，一共 1649 篇，再按 PubMed 的试验关联追溯来源。结果是，有试验证据的问题里，40% 存在同源论文；试验类论文中 29% 是重复计数；最多的一个问题里，有 8 篇论文来自同一组试验。这还是下界，因为只识别了明确的试验编号。右边：哪类证据能区分“有效”和“无效”。只看靶点本身，比如有没有强活性化合物、有没有临床试验，两组几乎一样；看靶点和疾病之间的遗传学、动物模型证据，获批组的比例是失败组的两倍左右，和 Nature 2024 的研究结论一致。这告诉我们：定级时应该按独立证据线和证据类型来计，而不是按篇数。样本还小，动物模型差异显著，遗传学接近显著。'
  );
}

// 9 -- collaboration and runtime
{
  const s = content('支撑设计：多智能体协作与本地运行时', 'B 类管“谁来做、谁把关”，C 类管“在哪里跑、用谁的额度”；两者在 2.x 已具备，3.0 继续完善。', '怎么设计');
  const half = (CW - 0.3) / 2;
  // B
  const bx = MX;
  card(s, bx, 1.75, half, 5.0);
  s.addText('B', { shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.06, x: bx + 0.3, y: 1.98, w: 0.45, h: 0.45, fill: { color: CAT.B }, line: { color: CAT.B }, fontSize: 16, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, objectName: name('tag') });
  label(s, bx + 0.9, 1.98, half - 1.2, 0.45, '多智能体协作：像课题组一样分工', { size: 17, bold: true, color: C.text2, valign: 'middle' });
  const flow = ['研究课题', '队长规划', '成员并行', '质量门', '综合报告'];
  const fg = 0.22;
  const fw = (half - 0.6 - (flow.length - 1) * fg) / flow.length;
  flow.forEach((t, i) => {
    const x = bx + 0.3 + i * (fw + fg);
    box(s, x, 2.75, fw, 0.62, t, { fill: i === 3 ? TEAL_TINT : C.background1, line: i === 3 ? HEX.accent1 : 'D5DCE4', size: 12.5, bold: true, color: C.text2 });
    if (i < flow.length - 1) arrow(s, x + fw + 0.02, 3.06, x + fw + fg - 0.02, 3.06, { color: C.accent2, width: 1.25 });
  });
  bullets(s, bx + 0.3, 3.65, half - 0.6, 2.2, [
    '队长（PI）把课题拆成有依赖的任务，可要求先审批计划',
    '成员交接时，每条发现都必须附证据编号',
    '质量门：规则检查 + 科研审查员；工具失败不算“阴性结果”',
  ], { size: 13, gap: 8 });
  const facts = [['26 位', '领域专家'], ['15 个', '团队模板'], ['@', '直接点名专家']];
  const kw = (half - 0.6) / 3;
  facts.forEach(([n, t], i) => {
    label(s, bx + 0.3 + i * kw, 5.85, kw, 0.45, n, { size: 20, bold: true, color: C.accent2, align: 'center' });
    label(s, bx + 0.3 + i * kw, 6.28, kw, 0.3, t, { size: 11.5, align: 'center' });
  });

  // C
  const cx = MX + half + 0.3;
  card(s, cx, 1.75, half, 5.0);
  s.addText('C', { shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.06, x: cx + 0.3, y: 1.98, w: 0.45, h: 0.45, fill: { color: CAT.C }, line: { color: CAT.C }, fontSize: 16, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, objectName: name('tag') });
  label(s, cx + 0.9, 1.98, half - 1.2, 0.45, '本地运行时：直接用已有 AI 订阅', { size: 17, bold: true, color: C.text2, valign: 'middle' });
  box(s, cx + 0.3, 2.95, 1.45, 0.62, '研究请求', { fill: C.text2, color: C.background1, bold: true, size: 13 });
  arrow(s, cx + 1.75, 3.26, cx + 2.05, 3.26, { color: C.accent6 });
  box(s, cx + 2.05, 2.95, 1.25, 0.62, '执行路由', { fill: C.accent6, color: C.background1, bold: true, size: 13 });
  const tx = cx + 3.65;
  const tw = half - 3.65 - 0.3;
  arrow(s, cx + 3.3, 3.15, tx, 2.83, { color: C.accent6 });
  arrow(s, cx + 3.3, 3.37, tx, 3.7, { color: C.accent6 });
  box(s, tx, 2.6, tw, 0.5, '模型 API · 按调用计费', { fill: C.background1, line: 'D5DCE4', size: 12, color: C.text2 });
  box(s, tx, 3.45, tw, 0.5, '本地 CLI · 用已有订阅', { fill: C.accent3, color: C.background1, bold: true, size: 12 });
  bullets(s, cx + 0.3, 4.25, half - 0.6, 2.0, [
    '自动检测本机已登录的 26 种 AI 命令行工具（如 Codex、Claude Code）',
    '每个会话独立配置目录，不混入日常使用记录',
    '执行命令前先征得同意（Codex 全流程支持）；数据留在本机',
  ], { size: 13, gap: 8 });
  label(s, cx + 0.3, 6.05, half - 0.6, 0.6, '说明：Codex 走完整协议并支持审批；Claude Code 已验证会话隔离；其余工具为通用接入。使用前请确认订阅条款允许此类用法。', { size: 10.5 });
  s.addNotes(
    '左边是多智能体协作：队长拆解任务，成员并行，交接时每条发现都要附证据编号，再过质量门，最后成文。内置 26 位专家、15 个团队模板。右边是本地运行时：很多团队已经买了 ChatGPT（Codex）或 Claude 的订阅，MedScience 可以直接调用本机已登录的命令行工具，沿用现有额度，不需要 API 密钥。注意除 Codex 和 Claude Code 外其他工具是通用接入，并请确认订阅条款允许这样使用。'
  );
}

// 10 -- usage
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

// 11 -- status and next steps
pres.addSection({ title: '下一步' });
{
  const s = content('当前进展与下一步', 'B、C 两类设计已落地；A 类新方案已完成小规模实测，待接入系统。', '下一步');
  const cols = [
    ['已完成', C.accent1, ['v3.0.0 已发布：三平台安装包和本地 Web 版', '多智能体协作、本地运行时已落地', '实时状态核验原型已落地，两个真实案例写成自动化测试', '实测：40% 的问题存在同源证据']],
    ['尚待完成', C.accent3, ['即时溯源与独立证据线定级尚未接入系统', '同源识别目前只覆盖试验编号，队列、数据集待扩展', '部分本地命令行工具仅为通用接入，待逐一验证']],
    ['下一步 · 需要的支持', C.accent2, ['把即时溯源、独立证据线定级、实时状态核验接入系统', '无人工标注的回测：用公开结局比较“引用篇数”与“独立证据线”', '扩展同源识别：队列、数据集、预印本、荟萃分析', '结果稳定后发布正式版，并整理成论文']],
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
  label(s, MX + 0.3, 6.3, CW - 0.6, 0.6, '请审阅：是否支持将“独立证据线定级”接入系统并开展回测实验（下一步第 1、2 项）。', { size: 15, bold: true, color: C.background1, valign: 'middle' });
  s.addNotes(
    '最后是进展和请求。B、C 两类设计已经落地并发布；A 类证据治理的新方案已完成小规模实测，证明同源证据被重复计数的问题普遍存在。下一步首先把即时溯源、独立证据线定级和实时状态核验接入系统；然后做回测实验：用公开的获批和失败结局作为标签，比较“按引用篇数”和“按独立证据线”哪个更能预测结局，整个过程不需要人工标注。结果稳定后发布正式版，并整理成论文。'
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
