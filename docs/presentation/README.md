# MedScience 3.0 设计汇报

`MedScience-3.0-设计汇报.pptx`：面向领导审阅的 11 页汇报，每页都有演讲备注。主线是“为什么做 → 怎么设计 → 怎么用 → 下一步”。

| 页 | 内容 |
| --- | --- |
| 1 | 封面 |
| 2 | 一页概要：问题、做法、进展 |
| 3 | 问题与定位：科研场景的四个痛点，同类方案与 MedScience 的不同回应 |
| 4 | 总体架构：三类设计（A 证据治理 / B 多智能体协作 / C 运行时与部署）落在五层结构中 |
| 5 | 数据流转：一次科研提问的八个步骤，以及依据被新研究推翻时的回路 |
| 6 | 核心设计：证据账本（状态流转、准入门禁、依赖级联、防篡改）；案例一：伏塞洛托撤市 |
| 7 | 案例二：Makena，确证性试验推翻早期结论（保留分歧、结论取代） |
| 8 | 设计点②③：信息增益取证（类比 + GLP-1 例子）、共形三分判定 |
| 9 | 支撑设计：多智能体协作（B）、本地运行时（C） |
| 10 | 使用说明：安装、配置运行时、提问、查看证据（含截图） |
| 11 | 进展与下一步，以及需要审批的事项 |

## 素材

`assets/` 中的截图均来自真实运行的 v3.0 应用（本地 Web 模式）。演示环境的说明如下：

- 结论文字由仓库自带的离线示例模型 `ScientificMockProvider` 生成。
- 文献列表来自 PubMed 实时检索。
- 本地运行时检测结果来自截图所用的机器。

第 8 页的信息增益与后验概率由 `InformationGainPlanner.ts` 以默认结果概率表（`DEFAULT_HYPOTHESIS_TOOL_MODELS`，人工设定的先验）从 50/50 起算得出。例子中的事实：司美格鲁肽对 GLP-1 受体亲和力 0.38 nM（Lau 等，J Med Chem 2015，PMID 26308095）；STEP 1 为 NCT03548935，三期，已完成。

第 6、7 页的两个案例是真实事件，文献编号经 PubMed 核实，并在 `packages/core/tests/test-evidence-ledger.ts` 第 8、9 节复现：

- 伏塞洛托（Oxbryta）：HOPE 试验，NEJM 2019，PMID 31199090；2019 年加速批准，2024 年 9 月全球撤市。
- Makena（17-OHPC）：Meis 等，NEJM 2003，PMID 12802023；2011 年加速批准；PROLONG，Am J Perinatol 2020，PMID 31652479；2023 年 4 月 FDA 撤销批准。

## 重新生成

所有图示都用 PowerPoint 原生形状绘制，可以直接在 PowerPoint 里修改。如需批量修改，编辑 `build-deck.cjs` 后执行：

```bash
npm install --no-save pptxgenjs
node docs/presentation/build-deck.cjs
```
