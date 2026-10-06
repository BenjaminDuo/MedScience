# MedScience 3.0 设计汇报

`MedScience-3.0-设计汇报.pptx`：面向领导审阅的 11 页汇报，每页都有演讲备注。主线是“为什么做 → 怎么设计 → 怎么用 → 下一步”。

| 页 | 内容 |
| --- | --- |
| 1 | 封面 |
| 2 | 一页概要：问题、做法、进展 |
| 3 | 问题与定位：科研场景的四个痛点（核心切入点：同源证据被重复计数） |
| 4 | 总体架构：三类设计落在五层结构中；A 类为即时溯源、同源合并、独立证据线定级、实时状态核验 |
| 5 | 数据流转：一次科研提问的八个步骤，以及回答时的实时状态核验回路 |
| 6 | 核心设计：独立证据线定级（真实例子：阿贝西利 / monarchE，6 篇论文 → 1 条独立证据） |
| 7 | 实时状态核验：伏塞洛托、Makena 两个真实案例 |
| 8 | 实测：同源证据有多普遍；哪类证据能区分有效与无效 |
| 9 | 支撑设计：多智能体协作（B）、本地运行时（C） |
| 10 | 使用说明：安装、配置运行时、提问、查看证据（含截图） |
| 11 | 进展与下一步，以及需要审批的事项 |

## 素材

`assets/` 中的截图均来自真实运行的 v3.0 应用（本地 Web 模式）。演示环境的说明如下：

- 结论文字由仓库自带的离线示例模型 `ScientificMockProvider` 生成。
- 文献列表来自 PubMed 实时检索。
- 本地运行时检测结果来自截图所用的机器。

A 类（证据治理）是新方案：已完成小规模实测，尚未接入系统，第 4、11 页如实标注。第 6、8 页的数字全部来自实测，不需要人工标注，标签取自公开结局：

- 同源证据：`packages/core/evaluation/source-redundancy/`。94 个药物–疾病问题，用系统自带文献检索取前 20 篇，按 PubMed 试验关联溯源。阿贝西利一例中，前 20 篇里有 6 篇来自 monarchE（NCT03155997）。
- 证据类型：`packages/core/evaluation/outcome-model-pilot/`。“2.6 倍”引自 Minikel 等，Nature 2024（PMID 38632401）。

第 7 页的两个案例是真实事件，文献编号经 PubMed 核实，并在 `packages/core/tests/test-evidence-ledger.ts` 第 8、9 节复现：

- 伏塞洛托（Oxbryta）：HOPE 试验，NEJM 2019，PMID 31199090；2019 年加速批准，2024 年 9 月全球撤市。
- Makena（17-OHPC）：Meis 等，NEJM 2003，PMID 12802023；2011 年加速批准；PROLONG，Am J Perinatol 2020，PMID 31652479；2023 年 4 月 FDA 撤销批准。

## 重新生成

所有图示都用 PowerPoint 原生形状绘制，可以直接在 PowerPoint 里修改。如需批量修改，编辑 `build-deck.cjs` 后执行：

```bash
npm install --no-save pptxgenjs
node docs/presentation/build-deck.cjs
```
