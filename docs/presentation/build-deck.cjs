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
// Storyline (10 slides): why -> what -> how it flows -> key designs ->
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
    ['我们的做法', C.accent1, '三类设计：证据治理（实时核验依据是否已被推翻，引用可核查）、多智能体协作（像课题组一样分工、审查把关）、本地运行（科研与临床数据留在本机）。'],
    ['当前进展', C.accent2, 'v3.0.0 已发布：三平台安装包和本地 Web 版。实时核验已有原型；“同源证据”经对照实验检验，影响很小，不再单列。'],
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
    '这一页给出全貌：问题是什么、我们怎么做、做到哪一步。后面按“为什么、怎么设计、怎么用、下一步”的顺序展开，共 10 页。'
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
        cell('① 依据已被推翻，模型却不知道\n撤稿、试验终止、撤市发生在模型训练之后'),
        cell('检索后生成带引用的报告\n（如 OpenAI Deep Research）'),
        ours('实时状态核验：回答时查询依据的当前状态，失效即降级'),
      ],
      [
        cell('② 证据看似很多，其实同源\n同一试验衍生多篇论文，被重复计数'),
        cell('按篇列出引用\n（公开资料未见同源识别）'),
        ours('先做实验：模型读到摘要能自行识别，系统只需附上摘要'),
      ],
      [
        cell('③ 引用难以核查\n编号可能不存在，或与内容张冠李戴'),
        cell('附参考文献列表\n（由用户自行核对）'),
        ours('可核查引用：结论只能引用工具实际返回的证据，并自动检查'),
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
    '左列是四个痛点，中间是同类方案通常怎么做，右列是我们的回应。前三个对应证据治理设计，核心是第一个：大模型自己无法知道训练之后发生的撤稿、撤市；第二个我们没有直接做功能，而是先做了对照实验，结论是只需附上摘要；第四个对应本地运行时。同类方案只引用公开资料，不评价其未公开能力。'
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
    { n: '证据治理层', k: 'A', items: ['实时状态核验', '可核查引用'], hi: true },
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
    '这一页同时回答“有哪几类设计”和“它们在系统里的位置”。A 类证据治理是绿色这一层：实时状态核验（核心，已有原型）和可核查引用（已落地）；B 类是协作层，即科研小队的组织方式；C 类是运行与部署，包括使用入口、执行层和本机数据层，在 2.x 已具备。右侧防护钩子贯穿每一次工具调用。需要强调：这些都是智能体系统层面的设计，没有训练或修改大模型本身。'
  );
}

// 5 -- data flow
{
  const s = content('一次科研提问的数据流转', '每一步都留下记录；依据被新研究推翻时，结论会被“追回”。', '怎么设计');
  const steps = [
    ['提问', '研究问题'],
    ['规划分工', '任务清单'],
    ['检索证据', '标题 + 摘要'],
    ['数值核验', '会话证据 EV-n'],
    ['状态核验', '撤稿 / 终止 / 撤市'],
    ['引用检查', '证据编号存在'],
    ['综合判断', '审查员把关'],
    ['输出结论', '结论 + 证据编号'],
  ];
  const n = steps.length;
  const g = 0.2;
  const bw = (CW - (n - 1) * g) / n;
  const y = 2.25;
  const bh = 0.95;
  const gov = new Set([4, 5]);
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
    '上排是一次科研提问的完整路径，每一步下面的小字是这一步产生的数据。绿色两步是证据治理层：实时核验每个来源的当前状态，再检查每条结论引用的证据编号都确实来自工具返回的结果。检索结果会附上摘要，因为实验显示模型读到摘要就能自行识别同源论文。下方是状态核验的回路：发现论文撤稿、试验因无效终止或药品撤市，依赖它的结论当场降级并提示复核。全部用公开数据库现查现算，不需要自建证据库。'
  );
}

// 6 -- core design: live status check, two real cases (replayed in packages/core/tests/test-evidence-ledger.ts [8], [9])
{
  const s = content('核心设计：实时状态核验——依据被推翻，结论当场降级', '大模型的知识停在训练截止日；回答时实时查询撤稿、试验终止、药品撤市，只降级真正依赖失效来源的结论。', '怎么设计');
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
  label(s, bx + 0.3, 2.3, half - 0.6, 0.3, '看点：独立证据方向相反时，保留分歧、不替人裁决', { size: 11.5, color: C.accent3, bold: true });
  s.addTable(
    [
      [ehead('时间'), ehead('事件'), ehead('结论“可降低早产风险”')],
      [ecell('2003'), ecell('Meis 试验：早产风险下降'), ecell('支持', { color: HEX.accent1, bold: true })],
      [ecell('2020'), ecell('确证试验 PROLONG：未见效果'), ecell('→ 有争议：两项独立试验结论相反', { color: HEX.accent3, bold: true })],
      [ecell('2023'), ecell('FDA 撤销批准'), ecell('→ 降级，并列出双方证据', { color: HEX.accent5, bold: true })],
    ],
    tableOpts(bx + 0.3, 2.75, half - 0.6, [0.62, 2.25, half - 0.6 - 2.87], [0.4, 0.42, 0.55, 0.42])
  );
  label(s, bx + 0.3, 4.65, half - 0.6, 1.0, '两项试验来自不同受试者，是两条独立证据；系统把双方都摆出来，标为“有争议”，由专家判断。', { size: 12, color: C.text1 });
  label(s, bx + 0.3, 5.75, half - 0.6, 0.5, '文献：Meis 等，NEJM 2003（PMID 12802023）；PROLONG，Am J Perinatol 2020（PMID 31652479）', { size: 10 });

  label(s, MX, 6.62, CW, 0.3, '两个案例已在 3.0 原型中写成自动化测试；实时核验的数据来源：撤稿库、ClinicalTrials.gov 试验状态、FDA 药品信息。', { size: 10 });
  s.addNotes(
    '这是 A 类的核心设计：实时状态核验。为什么必须由系统来做？因为大模型的知识停在训练截止日，它不知道之后发生的撤稿、试验终止和药品撤市。证据会被新研究推翻：论文撤稿、试验因无效终止、药品撤市。系统在回答时核验每个来源的当前状态，一旦失效，只降级真正依赖它的结论。左边伏塞洛托：2019 年凭 HOPE 试验中血红蛋白升高获批，2024 年因上市后死亡增多撤市。结论 A“可用于治疗该病”依赖批准，当场降级；结论 B“能提高血红蛋白”只依赖 HOPE 试验，保持不变——这正是替代指标改善不等于临床获益的典型例子。右边 Makena：2003 年 Meis 试验显示早产风险下降，2020 年确证试验 PROLONG 没有重复出效果，两项试验来自不同受试者，是两项方向相反的独立试验，系统把双方都列出来、标为有争议，不替人裁决；2023 年 FDA 撤销批准后结论降级。这两个案例都在 3.0 原型中写成了自动化测试，文献编号已经 PubMed 核实。'
  );
}

// 7 -- same-source evidence: measured, then tested on a model
// Numbers: packages/core/evaluation/source-redundancy/summary.json and
// packages/core/evaluation/illusory-corroboration/analysis.json (first run).
{
  const s = content('实验结论：同源证据普遍存在，但模型读到摘要时能自行识别', '先实测现象，再用对照实验检验它是否改变模型结论；按事先定好的规则决定去留。', '怎么设计');
  const lw = 4.6;
  const ax = MX;
  card(s, ax, 1.75, lw, 4.25);
  badge(s, ax + 0.3, 1.95, 1, C.accent3);
  label(s, ax + 0.85, 1.92, lw - 1.1, 0.45, '现象：同源证据普遍存在', { size: 15, bold: true, color: C.text2, valign: 'middle' });
  label(s, ax + 0.3, 2.45, lw - 0.6, 0.6, '94 个真实问题，系统检索前 20 篇，共 1649 篇，按 PubMed 试验关联溯源。', { size: 10.5, color: C.text1 });
  [
    ['40%', '含试验证据的问题中，存在同源论文'],
    ['29%', '试验类论文属于重复计数'],
    ['6 篇', '例：阿贝西利前 20 篇中，来自同一试验 monarchE'],
  ].forEach(([n, t], i) => {
    const y = 3.15 + i * 0.9;
    label(s, ax + 0.3, y, 1.25, 0.65, n, { size: 24, bold: true, color: C.accent3, align: 'center', valign: 'middle' });
    label(s, ax + 1.65, y + 0.03, lw - 1.95, 0.6, t, { size: 11, color: C.text1, valign: 'middle' });
  });

  const bx = MX + lw + 0.3;
  const bw = CW - lw - 0.3;
  card(s, bx, 1.75, bw, 4.25);
  badge(s, bx + 0.3, 1.95, 2, C.accent2);
  label(s, bx + 0.85, 1.92, bw - 1.1, 0.45, '对照实验：会不会让模型产生“虚假共识”', { size: 15, bold: true, color: C.text2, valign: 'middle' });
  label(s, bx + 0.3, 2.45, bw - 0.6, 0.5, '24 个问题、98 次调用；同一模型，只改变证据包，比较模型给出的“有效概率”（0–100）。', { size: 10.5, color: C.text1 });
  const head = (t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: HEX.dk2 }, fontSize: 10.5, valign: 'middle' } });
  const cell = (t, o = {}) => ({ text: t, options: { fontSize: 10.5, color: HEX.dk1, valign: 'middle', ...o } });
  s.addTable(
    [
      [head('证据包变化'), head('有效概率变化'), head('95% 置信区间'), head('判断')],
      [cell('原始检索结果 vs 去重'), cell('+0.0 分', { bold: true }), cell('−1.8 ~ +1.7'), cell('无影响')],
      [cell('再加 3 篇同一试验论文'), cell('+1.2 分', { bold: true }), cell('+0.5 ~ +2.0'), cell('可测出，但极小', { color: HEX.accent3, bold: true })],
      [cell('再加 6 篇同一试验论文'), cell('+1.0 分', { bold: true }), cell('+0.3 ~ +1.9'), cell('不随篇数增加')],
      [cell('标注来源 vs 原始'), cell('−1.4 分', { bold: true }), cell('−3.5 ~ +0.2'), cell('不显著')],
    ],
    {
      x: bx + 0.3, y: 3.0, w: bw - 0.6, colW: [2.3, 1.35, 1.45, bw - 0.6 - 5.1], rowH: [0.36, 0.38, 0.38, 0.38, 0.38],
      border: { type: 'solid', pt: 0.75, color: 'D5DCE4' }, fill: { color: 'FFFFFF' }, margin: [0.03, 0.08, 0.03, 0.08], fontFace: THEME.bodyFontFace,
      objectName: name('table'),
    }
  );
  label(s, bx + 0.3, 5.05, bw - 0.6, 0.8, '原因：模型读到摘要时会自行识别同源——25 份原始条件的回答中，有 10 份主动指出“多篇来自同一试验，只计一次”。', { size: 11, color: C.text1 });

  box(s, MX, 6.12, CW, 0.5, '结论：影响约 1 分（满分 100），不再单列为设计。实际要做的只有一件小事：检索结果附上摘要（目前只给标题）。', { fill: TEAL_TINT, line: HEX.accent1, size: 12.5, bold: true, align: 'left', margin: 0.12, color: C.text2 });
  label(s, MX, 6.68, CW, 0.3, '局限：多数问题已有定论（84% 的回答 ≥ 90 或 ≤ 10），对结论尚不确定的问题未检验；单一模型、单次运行。数据与脚本已存档，可复现。', { size: 10 });
  s.addNotes(
    '这一页讲我们怎么用数据做取舍。左边是实测的现象：94 个真实问题、1649 篇论文，有试验证据的问题中 40% 存在同源论文，试验类论文中 29% 是重复计数；比如问阿贝西利能否用于乳腺癌，前 20 篇里有 6 篇来自同一个试验。现象确实存在，但它会不会让大模型产生“虚假共识”？我们事先写好假设和取舍规则，做了对照实验：24 个问题、98 次调用，同一个模型只改变证据包。结果是，原始检索结果和去重之后没有差别；额外加入 3 篇同一试验的论文，模型给出的有效概率只升高约 1 分，满分 100，加到 6 篇也不再上升；标注来源也没有显著影响。原因是模型读到摘要时会自己识别同源，25 份回答中有 10 份主动指出“这几篇来自同一试验，只计一次”。所以按事先定的规则，这一项不再作为设计点，实际只需要让检索结果附上摘要。需要说明局限：多数问题的答案已有定论，模型很确定，留给变化的空间小；对结论尚不确定的问题还没有检验，而且只用了一个模型、跑了一次。'
  );
}

// 8 -- collaboration and runtime
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

// 9 -- usage
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

// 10 -- status and next steps
pres.addSection({ title: '下一步' });
{
  const s = content('当前进展与下一步', 'B、C 已落地；A 类实时核验已有原型；同源证据经实验检验，不再单列。', '下一步');
  const cols = [
    ['已完成', C.accent1, ['v3.0.0 已发布：三平台安装包和本地 Web 版', '多智能体协作、本地运行时、可核查引用已落地', '实时状态核验原型已落地，两个真实案例写成自动化测试', '对照实验：同源证据对模型结论影响约 1 分，不单列设计']],
    ['尚待完成', C.accent3, ['实时核验尚未覆盖全部数据源（撤稿库、试验、药品）', '文献检索目前只返回标题，需附上摘要', '部分本地命令行工具仅为通用接入，待逐一验证']],
    ['下一步 · 需要的支持', C.accent2, ['实时状态核验接入正式流程，覆盖撤稿、试验、药品三类来源', '文献检索附上摘要（小改动）', '在结论不确定、药名脱敏的问题上复核同源影响', '结果稳定后发布正式版，并整理成论文']],
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
  label(s, MX + 0.3, 6.3, CW - 0.6, 0.6, '请审阅：是否支持将实时状态核验接入正式流程（下一步第 1 项）。', { size: 15, bold: true, color: C.background1, valign: 'middle' });
  s.addNotes(
    '最后是进展和请求。B、C 两类设计已经落地并发布；A 类中，实时状态核验已有原型，并用两个真实案例写成了自动化测试。同源证据这一项，我们没有直接做功能，而是先做了对照实验，结果影响很小，所以不再单列，只需让文献检索附上摘要。下一步最重要的是把实时状态核验接入正式流程，覆盖撤稿、试验和药品三类来源；另外在结论尚不确定的问题上复核一次同源影响。结果稳定后发布正式版，并整理成论文。'
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
