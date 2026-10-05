# MedScience 3.0 设计汇报

`MedScience-3.0-设计汇报.pptx`：面向领导审阅的 10 页汇报，每页都有演讲备注。主线是“为什么做 → 怎么设计 → 怎么用 → 下一步”。

| 页 | 内容 |
| --- | --- |
| 1 | 封面 |
| 2 | 一页概要：问题、做法、进展 |
| 3 | 问题与定位：四个痛点，同类方案与 MedScience 的不同回应 |
| 4 | 总体架构：三类设计（A 证据治理 / B 多智能体协作 / C 运行时与部署）落在五层结构中 |
| 5 | 数据流转：一次科研提问的八个步骤，以及依据被新研究推翻时的回路 |
| 6 | 核心设计：证据账本（状态流转、准入门禁、依赖级联、防篡改），以罗非昔布（Vioxx）撤市为例 |
| 7 | 设计点②③：信息增益取证（背景、分歧度与预期信息增益的算法、TYK2 例子）、共形三分判定 |
| 8 | 支撑设计：多智能体协作（B）、本地运行时（C） |
| 9 | 使用说明：安装、配置运行时、提问、查看证据（含截图） |
| 10 | 进展与下一步，以及需要审批的事项 |

## 素材

`assets/` 中的截图均来自真实运行的 v3.0 应用（本地 Web 模式）。演示环境的说明如下：

- 结论文字由仓库自带的离线示例模型 `ScientificMockProvider` 生成。
- 文献列表来自 PubMed 实时检索。
- 本地运行时检测结果来自截图所用的机器。

第 7 页的信息增益与后验概率由 `InformationGainPlanner.ts` 以默认结果概率表（`DEFAULT_HYPOTHESIS_TOOL_MODELS`，人工设定的先验）从 50/50 起算得出。

第 6 页的罗非昔布例子是真实事件，文献编号经 PubMed / Crossref 核实（VIGOR：PMID 11087881；APPROVe：PMID 15713943；NEJM 2005-12-29 关注声明），并在 `packages/core/tests/test-evidence-ledger.ts` 第 8 节复现。

## 重新生成

所有图示都用 PowerPoint 原生形状绘制，可以直接在 PowerPoint 里修改。如需批量修改，编辑 `build-deck.cjs` 后执行：

```bash
npm install --no-save pptxgenjs
node docs/presentation/build-deck.cjs
```
