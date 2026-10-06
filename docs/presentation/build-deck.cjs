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
    ['我们的做法', C.accent1, '三类设计：证据治理（结论必须挂靠已验证的文献与数据库证据）、多智能体协作（像课题组一样分工、审查把关）、本地运行（科研与临床数据留在本机）。'],
    ['当前进展', C.accent2, 'v3.0.0 已发布：macOS、Windows、Linux 安装包和本地 Web 版，自动化测试在三个平台通过。真实任务上的对照实验尚待开展。'],
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
        ours('证据账本：证据持久保存；依据失效，相关结论自动降级'),
      ],
      [
        cell('② 专家意见分歧时，下一步查什么\n多轮辩论易互相附和，且耗算力'),
        cell('多智能体生成、辩论、排序假设\n（如 Google AI co-scientist）'),
        ours('信息增益取证：把分歧变成“下一步最该查什么”'),
      ],
      [
        cell('③ 假设成立与否，可信度说不清\n“80% 可信”从何而来，无法核验'),
        cell('自动打分或排名\n（分数本身缺少统计口径）'),
        ours('共形三分判定：支持 / 反驳 / 不确定，各有统计含义'),
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
    '左列是四个痛点，中间是同类方案通常怎么做，右列是我们的回应。前三个对应 3.0 新增的证据治理设计，第四个对应本地运行时。同类方案只引用公开资料，不评价其未公开能力。'
  );
}

// 4 -- architecture with the three design categories
pres.addSection({ title: '怎么设计' });
{
  const s = content('总体架构：三类设计落在五层结构中', '均为科研智能体系统层面的架构设计，不修改基础大模型；底层模型可以随时替换。', '怎么设计');
  // legend
  const legend = [
    ['A', '证据治理设计', '管“结论凭什么成立”（3.0 新增）', CAT.A],
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
    { n: '证据治理层', k: 'A', items: ['信息增益取证', '共形三分判定', '准入门禁', '证据账本'], hi: true },
    { n: '执行层', k: 'C', items: ['模型 API', '本地 CLI 运行时', '科研数据库连接器', '内核级沙盒'] },
    { n: '数据层', k: 'C', items: ['本机 ~/.medscience：会话 · 证据账本 · 加密密钥库 · 配置'] },
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
    '这一页同时回答“有哪几类设计”和“它们在系统里的位置”。A 类证据治理是 3.0 新增的一层（绿色框），属于智能体的推理架构；B 类是协作层，即科研小队的组织方式；C 类是运行与部署，包括使用入口、执行层和本机数据层，在 2.x 已具备。右侧防护钩子贯穿每一次工具调用。需要强调：这些都是智能体系统层面的设计，没有训练或修改大模型本身。'
  );
}

// 5 -- data flow
{
  const s = content('一次科研提问的数据流转', '每一步都留下记录；依据被新研究推翻时，结论会被“追回”。', '怎么设计');
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
  const gov = new Set([2, 4, 5, 6]);
  steps.forEach(([t, d], i) => {
    const x = MX + i * (bw + g);
    badge(s, x + bw / 2 - 0.19, y - 0.5, i + 1, gov.has(i) ? C.accent1 : C.accent2, 0.38);
    box(s, x, y, bw, bh, t, { fill: gov.has(i) ? TEAL_TINT : HEX.lt2, line: gov.has(i) ? HEX.accent1 : undefined, size: 13.5, bold: true, color: C.text2 });
    label(s, x - 0.05, y + bh + 0.1, bw + 0.1, 0.5, d, { size: 11.5, align: 'center' });
    if (i < n - 1) arrow(s, x + bw + 0.02, y + bh / 2, x + bw + g - 0.02, y + bh / 2, { color: C.accent6, width: 1.25 });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: 3.9, w: 0.3, h: 0.2, rectRadius: 0.03, fill: { color: TEAL_TINT }, line: { color: HEX.accent1 }, objectName: name('legend') });
  label(s, MX + 0.4, 3.85, 6, 0.3, '绿色：由证据治理层（A 类，3.0 新增）完成的步骤', { size: 11.5, valign: 'middle' });

  const ly = 4.55;
  card(s, MX, ly, CW, 2.15, AMBER_TINT);
  label(s, MX + 0.3, ly + 0.2, 6, 0.4, '依据被推翻时的回路', { size: 15, bold: true, color: C.text2 });
  const fg = 0.45;
  const fw = (CW - 0.6 - 3 * fg) / 4;
  const fy = ly + 0.75;
  ['新研究推翻依据\n（如药品撤市、新试验结果）', '在账本中标记该证据\n（审查人标注 / 自动扫描）', '依赖它的结论：\n自动转为“有争议”', '提示复核：重新论证，\n或以新结论取代'].forEach((t, i, arr) => {
    const x = MX + 0.3 + i * (fw + fg);
    box(s, x, fy, fw, 0.9, t, { fill: C.background1, line: HEX.accent3, size: 13, color: C.text1 });
    if (i < arr.length - 1) arrow(s, x + fw + 0.03, fy + 0.45, x + fw + fg - 0.03, fy + 0.45, { color: C.accent3, width: 1.5 });
  });
  label(s, MX + 0.3, ly + 1.75, CW - 0.6, 0.3, '例：2024 年伏塞洛托（Oxbryta）因上市后数据显示死亡增多而撤市 → “批准”证据被撤销 → “可用于治疗镰状细胞病”的结论自动降级。', { size: 11.5 });
  s.addNotes(
    '上排是一次科研提问的完整路径，每一步下面的小字是这一步产生的数据。绿色四步由 3.0 新增的证据治理层完成。下方是回路：科研结论的依据会被新研究推翻，比如药品因新的安全性试验撤市。证据在账本里被标记后，依赖它的结论在同一操作里自动转为“有争议”，原因写入哈希链，可以审计；恢复证据不会自动恢复结论，需要重新论证。后面两页用伏塞洛托和 Makena 两个真实案例说明。'
  );
}

// 6 -- design point 1: evidence ledger (the core)
{
  const s = content('核心设计：证据账本——结论必须有据可查、可以撤回', 'A 类设计点 ①：每条证据经准入门禁才算数；依据被推翻，结论自动降级。', '怎么设计');
  const sx = MX;
  const sw = 1.55;
  const sh = 0.62;
  const colX = [sx, sx + 2.45, sx + 4.75];
  const st = {
    cand: [colX[0], 2.55, '候选', HEX.accent6],
    ver: [colX[1], 2.55, '已验证', HEX.accent1],
    con: [colX[2], 1.75, '有争议', HEX.accent3, '被反驳'],
    sup: [colX[2], 2.55, '已取代', HEX.accent2, '被取代'],
    rev: [colX[2], 3.35, '已撤销', HEX.accent5, '撤市 / 撤稿'],
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
  ['con', 'sup', 'rev'].forEach((k) => arrow(s, ...right('ver'), ...left(k), { color: C.text2 }));
  arrow(s, mid('cand')[0], st.cand[1] + sh, mid('qua')[0], st.qua[1], { color: C.text2 });
  label(s, mid('cand')[0] + 0.1, 3.5, 1.3, 0.5, '未通过门禁', { size: 11, valign: 'middle' });
  arrow(s, ...right('qua'), st.rev[0], st.rev[1] + sh, { color: C.text2, dash: 'dash' });
  label(s, colX[1] - 0.2, 4.45, 2.2, 0.3, '确认无效', { size: 10.5, align: 'center' });

  // worked example: voxelotor (Oxbryta); replayed in packages/core/tests/test-evidence-ledger.ts [8]
  const ey = 5.02;
  card(s, MX, ey, 7.0, 1.9, AMBER_TINT);
  label(s, MX + 0.25, ey + 0.1, 4.6, 0.32, '案例一：伏塞洛托（Oxbryta），镰状细胞病', { size: 14, bold: true, color: C.text2, valign: 'middle' });
  label(s, MX + 4.6, ey + 0.1, 2.15, 0.32, '已写成自动化测试', { size: 10.5, align: 'right', valign: 'middle' });
  const ehead = (t) => ({ text: t, options: { bold: true, color: HEX.dk2, fill: { color: 'F3E3CF' }, fontSize: 10.5, valign: 'middle' } });
  const ecell = (t, o = {}) => ({ text: t, options: { fontSize: 10.5, color: HEX.dk1, valign: 'middle', ...o } });
  s.addTable(
    [
      [ehead('时间'), ehead('事件'), ehead('结论 A\n可用于治疗该病'), ehead('结论 B\n能提高血红蛋白')],
      [ecell('2019'), ecell('HOPE 试验 + 加速批准'), ecell('已验证', { color: HEX.accent1, bold: true }), ecell('已验证', { color: HEX.accent1, bold: true })],
      [ecell('2024'), ecell('上市后死亡增多，撤市'), ecell('→ 有争议', { color: HEX.accent3, bold: true }), ecell('不受影响', { bold: true })],
    ],
    {
      x: MX + 0.25, y: ey + 0.48, w: 6.5, colW: [0.75, 2.35, 1.7, 1.7], rowH: [0.46, 0.29, 0.29],
      border: { type: 'solid', pt: 0.5, color: 'E6D3BC' }, fill: { color: 'FFFFFF' }, margin: [0.02, 0.06, 0.02, 0.06], fontFace: THEME.bodyFontFace,
      objectName: name('table'),
    }
  );
  label(s, MX + 0.25, ey + 1.6, 6.5, 0.26, '只降级依赖“批准”的结论：血红蛋白确实升高，但患者结局变差。', { size: 10.5, color: C.text1 });

  const rx = MX + 7.6;
  const rw = CW - 7.6;
  [
    ['准入门禁', '来源可追溯、未过期、数值在合理范围、不含未授权患者数据、未被撤稿；任一不过即隔离，原因写入账本。不替代对研究质量的专业判断。'],
    ['依赖级联', '证据失效时，依赖它的结论自动降级；恢复证据不会自动恢复结论。'],
    ['防篡改', '每次变更追加写入哈希链；文件被改动会被发现，账本随即锁为只读。'],
  ].forEach(([t, b], i) => {
    const y = 1.8 + i * 1.6;
    badge(s, rx, y, i + 1, C.accent1);
    label(s, rx + 0.6, y - 0.02, rw - 0.6, 0.45, t, { size: 17, bold: true, color: C.text2, valign: 'middle' });
    label(s, rx + 0.6, y + 0.48, rw - 0.6, 0.95, b, { size: 14 });
  });
  s.addNotes(
    '这是 3.0 的核心。证据和结论有六种状态，只能沿箭头迁移：新证据先是候选，通过准入门禁才算已验证，否则隔离。准入门禁检查的是来源能否追溯、是否过期、数值是否在物理范围内、是否含未授权的患者数据、是否已被撤稿，不评价研究质量本身。关键是依赖级联，用伏塞洛托举例：2019 年它凭 HOPE 试验中血红蛋白升高获得加速批准，账本里有两条已验证结论，A“可用于治疗镰状细胞病”依据批准和 HOPE 试验，B“能提高血红蛋白”只依据 HOPE。2024 年上市后数据显示血管闭塞危象和死亡增多，药品全球撤市，审查人把“批准”证据标为已撤销，A 自动转为有争议；B 不依赖批准，保持不变，因为血红蛋白确实升高了。这正是替代指标改善不等于临床获益的典型例子。这个例子已写成自动化测试，文献编号经 PubMed 核实。'
  );
}

// 7 -- case 2: Makena; replayed in packages/core/tests/test-evidence-ledger.ts [9]
{
  const s = content('案例二：Makena——确证性试验推翻早期结论', '证据相互矛盾时，账本保留分歧、不替人裁决；新结论有据可查地取代旧结论。', '怎么设计');
  // timeline
  const events = [
    ['2003', 'Meis 试验', '早产风险下降', C.accent1],
    ['2011', '获加速批准', '依据上述试验', C.accent1],
    ['2019–20', '确证试验 PROLONG', '未见降低早产', C.accent3],
    ['2023', 'FDA 撤销批准', '药品退出市场', HEX.accent5],
  ];
  const ty = 2.35;
  const tx0 = MX + 0.9;
  const tx1 = MX + CW - 0.9;
  s.addShape(pres.shapes.LINE, { x: tx0, y: ty, w: tx1 - tx0, h: 0, line: { color: 'C3CCD6', width: 2 }, objectName: name('timeline') });
  const step = (tx1 - tx0) / (events.length - 1);
  events.forEach(([yr, t, d, c], i) => {
    const cx = tx0 + i * step;
    s.addShape(pres.shapes.OVAL, { x: cx - 0.14, y: ty - 0.14, w: 0.28, h: 0.28, fill: { color: c }, line: { color: 'FFFFFF', width: 2 }, objectName: name('dot') });
    label(s, cx - 1.3, ty - 0.62, 2.6, 0.36, yr, { size: 15, bold: true, color: C.text2, align: 'center' });
    label(s, cx - 1.4, ty + 0.25, 2.8, 0.32, t, { size: 13.5, bold: true, color: C.text1, align: 'center' });
    label(s, cx - 1.4, ty + 0.57, 2.8, 0.3, d, { size: 11.5, align: 'center' });
  });

  // ledger reaction
  const by = 3.5;
  const lw = 7.6;
  card(s, MX, by, lw, 3.0, AMBER_TINT);
  label(s, MX + 0.25, by + 0.12, lw - 0.5, 0.34, '账本里发生了什么（结论 A：“17-OHPC 可降低早产风险”）', { size: 14, bold: true, color: C.text2, valign: 'middle' });
  const ehead = (t) => ({ text: t, options: { bold: true, color: HEX.dk2, fill: { color: 'F3E3CF' }, fontSize: 11.5, valign: 'middle' } });
  const ecell = (t, o = {}) => ({ text: t, options: { fontSize: 11.5, color: HEX.dk1, valign: 'middle', ...o } });
  s.addTable(
    [
      [ehead('时间'), ehead('账本动作'), ehead('结论 A 的状态')],
      [ecell('2011'), ecell('Meis 试验、批准两条证据通过门禁'), ecell('已验证', { color: HEX.accent1, bold: true })],
      [ecell('2020'), ecell('PROLONG 作为反证录入'), ecell('→ 有争议：两项试验结论相反，分歧被保留', { color: HEX.accent3, bold: true })],
      [ecell('2023'), ecell('批准证据撤销；新结论 A′“确证试验未见效果”通过验证'), ecell('→ 已取代：由 A′ 取代，历史可查', { color: HEX.accent2, bold: true })],
    ],
    {
      x: MX + 0.25, y: by + 0.58, w: lw - 0.5, colW: [0.75, 3.35, lw - 0.5 - 4.1], rowH: [0.36, 0.5, 0.62, 0.72],
      border: { type: 'solid', pt: 0.5, color: 'E6D3BC' }, fill: { color: 'FFFFFF' }, margin: [0.03, 0.08, 0.03, 0.08], fontFace: THEME.bodyFontFace,
      objectName: name('table'),
    }
  );

  // takeaways
  const rx = MX + lw + 0.35;
  const rw = CW - lw - 0.35;
  label(s, rx, by + 0.05, rw, 0.4, '这个案例说明', { size: 16, bold: true, color: C.text2, valign: 'middle' });
  [
    ['新证据不覆盖旧证据', 'Meis 试验仍在账本中，两项试验的分歧被如实记录。'],
    ['不替人裁决', '证据冲突时标为“有争议”，等待专家复核。'],
    ['结论有继承关系', 'A′ 取代 A；A 从验证到被取代的每一步都可追溯。'],
  ].forEach(([t, b], i) => {
    const y = by + 0.6 + i * 0.8;
    badge(s, rx, y + 0.02, i + 1, C.accent1, 0.34);
    label(s, rx + 0.48, y, rw - 0.48, 0.3, t, { size: 13, bold: true, color: C.text2 });
    label(s, rx + 0.48, y + 0.31, rw - 0.48, 0.45, b, { size: 11.5, color: C.text1 });
  });
  label(s, MX, 6.62, CW, 0.3, '文献：Meis 等，NEJM 2003（PMID 12802023）；PROLONG，Am J Perinatol 2020（PMID 31652479）。已写成自动化测试；“反证录入”和“结论取代”目前通过接口完成，界面入口待补。', { size: 10 });
  s.addNotes(
    '第二个案例换一个角度：不是药品撤市，而是证据之间互相矛盾。17-羟孕酮己酸酯（Makena）在 2003 年的 Meis 试验中显示能降低复发性早产风险，2011 年据此获得加速批准。确证性试验 PROLONG 在 2019 到 2020 年发表，没有重复出这个效果，FDA 在 2023 年撤销批准。在账本里，PROLONG 作为反证录入后，结论 A 转为“有争议”，但 Meis 试验并没有被删除，两项试验的分歧被如实保留，系统不替人裁决。2023 年批准撤销，新结论 A′“确证试验未见效果”通过验证后取代 A，A 的完整历史仍可查。这个例子同样写成了自动化测试。需要说明：反证录入和结论取代目前通过接口完成，界面上的入口还没有做。'
  );
}

// 8 -- design points 2 and 3
{
  const s = content('设计点②③：分歧时先查什么，结论何时能下', 'A 类设计点 ② 与 ③：用实测数据决定先查什么；用统计校准决定能否下结论。', '怎么设计');
  const top = 1.7;
  const ch = 4.95;
  // ---------------- left: information gain, measured
  // Numbers: packages/core/evaluation/outcome-model-pilot (estimate.json,
  // estimate_improved.json, estimate_disease.json).
  const lw = 7.55;
  const lx = MX;
  card(s, lx, top, lw, ch);
  badge(s, lx + 0.3, top + 0.2, 2, C.accent1);
  label(s, lx + 0.85, top + 0.17, lw - 1.1, 0.45, '信息增益取证：用实测数据决定先查什么', { size: 17, bold: true, color: C.text2, valign: 'middle' });
  const iw = lw - 0.6;
  box(s, lx + 0.3, top + 0.7, iw, 0.42,
    '类比：量体温分不开流感和感冒，抗原检测才分得开。信息增益衡量的就是“能分开多少”。',
    { fill: C.background1, line: 'D5DCE4', size: 11.5, align: 'left', margin: 0.1 });
  label(s, lx + 0.3, top + 1.2, iw, 0.3, '实测：真实靶点，已获批（成立）vs 因疗效不足而失败（不成立）', { size: 12, bold: true, color: C.text2 });

  const groups = [
    ['只看靶点本身', [
      ['查靶点序列', '100% vs 100%', 0, '0'],
      ['查临床试验登记', '100% vs 100%', 0, '0'],
      ['查强活性化合物', '88% vs 81%', 0.006, '0.006'],
    ], 'B4BFCC'],
    ['看靶点与疾病的关系', [
      ['动物模型证据', '38% vs 17%', 0.039, '0.039'],
      ['人类遗传学证据', '35% vs 17%', 0.027, '0.027'],
    ], HEX.accent1],
  ];
  const c1 = lx + 0.3;                // query label
  const c2 = c1 + 1.75;               // rates
  const c3 = c2 + 1.45;               // bar
  const barMax = lx + lw - 0.3 - 0.6 - c3;
  label(s, c2, top + 1.5, 1.45, 0.26, '成立 vs 不成立', { size: 9.5, align: 'center' });
  label(s, c3, top + 1.5, barMax + 0.6, 0.26, '信息增益（比特）', { size: 9.5 });
  let y = top + 1.76;
  groups.forEach(([g, rows, color]) => {
    label(s, c1, y, iw, 0.26, g, { size: 11, bold: true, color: color === HEX.accent1 ? C.accent1 : C.accent6 });
    y += 0.27;
    rows.forEach(([q, rate, v, shown]) => {
      label(s, c1 + 0.15, y, 1.6, 0.27, q, { size: 11, color: C.text1, valign: 'middle' });
      label(s, c2, y, 1.45, 0.27, rate, { size: 11, color: C.text1, align: 'center', valign: 'middle' });
      const bw = (v / 0.039) * barMax;
      if (bw > 0.01) s.addShape(pres.shapes.RECTANGLE, { x: c3, y: y + 0.05, w: bw, h: 0.17, fill: { color }, line: { color }, objectName: name('bar') });
      label(s, c3 + Math.max(bw, 0) + 0.06, y, 0.6, 0.27, shown, { size: 10.5, bold: true, color: C.text1, valign: 'middle' });
      y += 0.29;
    });
    y += 0.04;
  });
  box(s, lx + 0.3, y + 0.04, iw, 0.58,
    '结论：只看靶点本身分不出有效与否；靶点与疾病之间的证据才有区分力——与 Nature 2024 一致（有遗传学支持的药物机制，成功率高 2.6 倍）。',
    { fill: TEAL_TINT, line: HEX.accent1, size: 11, align: 'left', margin: 0.1, color: C.text2 });
  label(s, lx + 0.3, y + 0.7, iw, 0.3, '普适性：方法通用，数字随问题类型而定——换一类问题，用该类已知答案的案例重测一次。', { size: 10.5, bold: true, color: C.accent6 });

  // ---------------- right: conformal decision
  const rx = MX + lw + 0.3;
  const rw = CW - lw - 0.3;
  card(s, rx, top, rw, ch);
  badge(s, rx + 0.3, top + 0.2, 3, C.accent1);
  label(s, rx + 0.85, top + 0.17, rw - 1.1, 0.45, '共形三分判定', { size: 18, bold: true, color: C.text2, valign: 'middle' });
  label(s, rx + 0.3, top + 0.8, rw - 0.6, 0.28, '背景', { size: 12.5, bold: true, color: C.accent1 });
  label(s, rx + 0.3, top + 1.1, rw - 0.6, 0.95, '共形预测（Vovk 等）是一种统计方法：用一批已标注结果的历史假设做校准，保证“出错率不超过 α”。它不给分数，而是给出可能成立的结果集合：', { size: 11.5, color: C.text1 });
  const rhead = (t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: HEX.dk2 }, fontSize: 11, valign: 'middle' } });
  const rcell = (t, o = {}) => ({ text: t, options: { fontSize: 11, color: HEX.dk1, valign: 'middle', ...o } });
  s.addTable(
    [
      [rhead('结果集合'), rhead('判定'), rhead('含义')],
      [rcell('{ 支持 }', { bold: true }), rcell('支持', { color: HEX.accent1, bold: true }), rcell('只有“支持”说得通')],
      [rcell('{ 反驳 }', { bold: true }), rcell('反驳', { color: HEX.accent5, bold: true }), rcell('只有“反驳”说得通')],
      [rcell('{ 支持，反驳 }', { bold: true }), rcell('不确定', { color: HEX.accent3, bold: true }), rcell('证据分不出')],
      [rcell('{ }（空）', { bold: true }), rcell('不确定', { color: HEX.accent3, bold: true }), rcell('罕见，需人工复核')],
    ],
    {
      x: rx + 0.3, y: top + 2.1, w: rw - 0.6, colW: [1.42, 0.72, rw - 0.6 - 2.14], rowH: [0.36, 0.36, 0.36, 0.36, 0.36],
      border: { type: 'solid', pt: 0.75, color: 'D5DCE4' }, fill: { color: 'FFFFFF' }, margin: [0.03, 0.07, 0.03, 0.07], fontFace: THEME.bodyFontFace,
      objectName: name('table'),
    }
  );
  label(s, rx + 0.3, top + 4.05, rw - 0.6, 0.8, '校准后每类出错率不超过 α（如 10%）；未校准时界面明确显示“未校准”。评分只看证据，与靶点名称无关。', { size: 11, color: C.text1 });

  label(s, MX, top + ch + 0.08, CW, 0.3, '说明：靶点本身 114 例、靶点–疾病 94 例；动物模型差异 p = 0.023，遗传学 p = 0.062。系统目前仍按靶点查询，按“靶点–疾病”查询将在下一版接入。数据与脚本已存档，可复现。', { size: 10 });
  s.addNotes(
    '左边是信息增益取证。先用类比：量体温分不开流感和感冒，抗原检测才分得开；信息增益就是给每项查询“能把有效和无效分开多少”打分。原来的概率表是人工设定的，我们用真实数据做了实测：一组是已有获批药物的靶点，一组是药物因疗效不足在二、三期试验中失败、至今没有获批药物的靶点。结果是，只看靶点本身的三种查询——查序列、查临床试验、查化合物活性——两组几乎一样，信息增益接近 0。原因不难理解：能走到二、三期的靶点本来就都有强效化合物，活性说明能不能成药，不说明有没有效。看靶点和这个疾病之间的关系就不一样了：有动物模型证据的比例是 38% 对 17%，有人类遗传学证据的是 35% 对 17%，这和 Nature 2024 的结论一致，有遗传学支持的药物机制成功率高 2.6 倍。所以改进方向是把查询从“按靶点”改成“按靶点和疾病”。需要说明两点：第一，样本还小，动物模型差异显著，遗传学接近显著；第二，系统目前还是按靶点查询，这项改进放在下一版。关于普适性：计算方法是通用的，但概率表和具体该查什么，随问题类型而定；换一类问题，比如生物标志物的诊断价值，需要用这一类已知答案的案例重新实测一次，流程和代码不变。右边是共形三分判定：用一批已知结果的历史假设校准，结论以“可能成立的结果集合”给出，集合里只有一个答案才下结论；两个都可能就是证据不足。校准后错误率有统计保证，没校准时系统会明确说明。'
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
    ['查看证据', '在“证据账本”查看每条证据的状态、来源与历史。'],
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
  shot(s, 'usage-ledger.jpg', 1800, 1272, x3, y0, colW, 3.3, '证据账本：状态、来源、完整历史');
  label(s, MX, 6.75, CW, 0.28, '演示环境使用离线示例模型生成文字；文献为 PubMed 实时检索结果。', { size: 10.5 });
  s.addNotes(
    '四步即可：安装、配置运行时、提问、查看证据。左图是运行时自动检测到本机的 Claude Code；中间是用 @ 点名专家，以及智能体调用工具的记录；右图是证据账本，每条证据的状态、来源和完整历史都能查到。截图都来自真实运行的 3.0 应用。'
  );
}

// 11 -- status and next steps
pres.addSection({ title: '下一步' });
{
  const s = content('当前进展与下一步', '设计已全部落地并可下载使用；有效性还需要真实任务上的对照实验来证明。', '下一步');
  const cols = [
    ['已完成', C.accent1, ['v3.0.0 已发布：macOS、Windows、Linux 安装包和本地 Web 版', '三类设计全部落地，并接入桌面端界面', '自动化测试在三个平台持续通过', '评分只看证据，不再受靶点名称影响']],
    ['尚待验证', C.accent3, ['尚未在真实科研任务上做对照实验', '判定目前处于“未校准”状态，尚无覆盖率保证', '部分本地命令行工具仅为通用接入，待逐一验证']],
    ['下一步 · 需要的支持', C.accent2, ['组织领域专家标注一批真实假设（支持 / 反驳），用于校准与评测', '开展同等预算的对照实验：与扁平记忆、多智能体辩论比较', '查询改为按“靶点–疾病”，优先遗传学与动物模型证据', '结果稳定后发布正式版，并整理成论文']],
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
  label(s, MX + 0.3, 6.3, CW - 0.6, 0.6, '请审阅：是否支持开展专家标注与同等预算对照实验（下一步第 1、2 项）。', { size: 15, bold: true, color: C.background1, valign: 'middle' });
  s.addNotes(
    '最后是进展和请求。设计已全部落地并发布，可以下载试用；尚待验证的是有效性。最需要的支持是领域专家标注一批真实假设，用于校准和评测，然后做同等预算的对照实验；同时把查询改为按“靶点–疾病”进行，优先取遗传学和动物模型证据，这一点已有实测数据支持。结果稳定后发布正式版并整理论文。'
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
