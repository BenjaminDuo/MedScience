# MedScience 3.0 设计汇报

`MedScience-3.0-设计汇报.pptx`：面向领导审阅的 15 页汇报，每页都有演讲备注。

| 部分 | 页码 |
| --- | --- |
| 封面、一页概要 | 1–2 |
| 设计动机、与同类方案的区别 | 3–4 |
| 三类设计、总体架构、数据流转 | 5–7 |
| 三个设计点（证据账本 / 信息增益取证 / 共形三分判定） | 8–10 |
| 多智能体协作、本地运行时 | 11–12 |
| 使用说明（含截图） | 13–14 |
| 进展与下一步 | 15 |

## 素材

`assets/` 中的截图均来自真实运行的 v3.0 应用（本地 Web 模式）。演示环境的说明如下：

- 结论文字由仓库自带的离线示例模型 `ScientificMockProvider` 生成。
- 文献列表来自 PubMed 实时检索。
- 本地运行时检测结果来自截图所用的机器。

第 9 页的信息增益数值由代码中的默认参数计算得出（`DEFAULT_HYPOTHESIS_TOOL_MODELS`）。

## 重新生成

所有图示都用 PowerPoint 原生形状绘制，可以直接在 PowerPoint 里修改。如需批量修改，编辑 `build-deck.cjs` 后执行：

```bash
npm install --no-save pptxgenjs
node docs/presentation/build-deck.cjs
```
