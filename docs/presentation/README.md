# MedScience 3.0 设计汇报

`MedScience-3.0-设计汇报.pptx`：面向领导审阅的 11 页汇报，每页都有演讲备注。主线是“为什么做 → 怎么设计 → 怎么用 → 下一步”。

| 页 | 内容 |
| --- | --- |
| 1 | 封面 |
| 2 | 一页概要：问题、做法、进展 |
| 3 | 问题与定位：科研场景的四个痛点 |
| 4 | 总体架构：三类设计落在五层结构中；A 类为实时状态核验、来源可见、可核查引用 |
| 5 | 数据流转：一次科研提问的八个步骤，以及实时状态核验回路 |
| 6 | 核心设计：实时状态核验（伏塞洛托、Makena 两个真实案例） |
| 7 | 来源可见：标明哪些论文来自同一试验（阿贝西利 / monarchE 例子），只标注、不定级 |
| 8 | 实测现象与待验证假设：同源证据会不会造成“虚假共识”（实验已设计，尚未运行） |
| 9 | 支撑设计：多智能体协作（B）、本地运行时（C） |
| 10 | 使用说明：安装、配置运行时、提问、查看证据（含截图） |
| 11 | 进展与下一步，以及需要审批的事项 |

## 素材

`assets/` 中的截图均来自真实运行的 v3.0 应用（本地 Web 模式）。演示环境的说明如下：

- 结论文字由仓库自带的离线示例模型 `ScientificMockProvider` 生成。
- 文献列表来自 PubMed 实时检索。
- 本地运行时检测结果来自截图所用的机器。

A 类（证据治理）以实时状态核验为核心（已有原型）；来源可见是低成本功能，其是否影响模型结论由实验决定。第 7、8 页的数字来自 `packages/core/evaluation/source-redundancy/`（94 个药物–疾病问题，系统自带文献检索前 20 篇，按 PubMed 试验关联溯源），实验见 `packages/core/evaluation/illusory-corroboration/`，尚未运行。

第 6 页的两个案例是真实事件，文献编号经 PubMed 核实，并在 `packages/core/tests/test-evidence-ledger.ts` 第 8、9 节复现：

- 伏塞洛托（Oxbryta）：HOPE 试验，NEJM 2019，PMID 31199090；2019 年加速批准，2024 年 9 月全球撤市。
- Makena（17-OHPC）：Meis 等，NEJM 2003，PMID 12802023；2011 年加速批准；PROLONG，Am J Perinatol 2020，PMID 31652479；2023 年 4 月 FDA 撤销批准。

## 重新生成

所有图示都用 PowerPoint 原生形状绘制，可以直接在 PowerPoint 里修改。如需批量修改，编辑 `build-deck.cjs` 后执行：

```bash
npm install --no-save pptxgenjs
node docs/presentation/build-deck.cjs
```
