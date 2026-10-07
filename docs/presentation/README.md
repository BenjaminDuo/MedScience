# MedScience 3.0 设计汇报

`MedScience-3.0-设计汇报.pptx`：面向领导审阅的 12 页汇报，每页都有演讲备注。主线是“为什么做 → 怎么设计 → 怎么用 → 下一步”。

| 页 | 内容 |
| --- | --- |
| 1 | 封面 |
| 2 | 一页概要：问题、做法、进展 |
| 3 | 问题与定位：四个痛点（A 类三个痛点原文 + 数据与成本） |
| 4 | 总体架构：A 证据治理（三个设计）、B 协作、C 运行与部署 |
| 5 | 数据流转：等价类聚合 → 矛盾优先验证 → 状态机更新，以及新事件回路 |
| 6 | A 类设计 1：时间证据状态机（伏塞洛托例子） |
| 7 | A 类设计 2：临床试验等价类聚合（阿贝西利 / monarchE 例子，附实测） |
| 8 | A 类设计 3：矛盾优先主动验证（Makena 例子） |
| 9 | B 类设计：多智能体协作：像课题组一样分工 |
| 10 | C 类设计：本地运行时：直接用已有 AI 订阅 |
| 11 | 使用说明：安装、配置运行时、提问、查看证据（含截图） |
| 12 | 进展与下一步，以及需要审批的事项 |

## 素材

`assets/` 中的截图均来自真实运行的 v3.0 应用（本地 Web 模式）。演示环境的说明如下：

- 结论文字由仓库自带的离线示例模型 `ScientificMockProvider` 生成。
- 文献列表来自 PubMed 实时检索。
- 本地运行时检测结果来自截图所用的机器。

A 类三个设计的痛点与设计文字按作者定稿原文写入 `build-deck.cjs` 顶部的常量（`PAIN_A1`…`DESIGN_A3_NOTE`），第 3 页与第 6–8 页共用。实现状态：时间证据状态机已有原型（3.0 证据账本），其余两个在设计中。第 7 页的实测数字来自 `packages/core/evaluation/source-redundancy/` 与 `illusory-corroboration/`。

第 6、8 页的两个案例是真实事件，文献编号经 PubMed 核实，并在 `packages/core/tests/test-evidence-ledger.ts` 第 8、9 节复现：

- 伏塞洛托（Oxbryta）：HOPE 试验，NEJM 2019，PMID 31199090；2019 年加速批准，2024 年 9 月全球撤市。
- Makena（17-OHPC）：Meis 等，NEJM 2003，PMID 12802023；2011 年加速批准；PROLONG，Am J Perinatol 2020，PMID 31652479；2023 年 4 月 FDA 撤销批准。

## 重新生成

所有图示都用 PowerPoint 原生形状绘制，可以直接在 PowerPoint 里修改。如需批量修改，编辑 `build-deck.cjs` 后执行：

```bash
npm install --no-save pptxgenjs
node docs/presentation/build-deck.cjs
```
