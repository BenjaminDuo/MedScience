# 对话中心重构设计：队员单聊 + 科研小队（WeChat 范式）

> 状态：**已实现**（P0 只读群聊 / P1 群管理 / P2 工作区归属 + 置顶未读 / API 契约统一；P3 真·自动交互仍待评估）
> 交互原型（设计基线，保留备查）：[`docs/specs/mockups/research-team-groups.html`](./mockups/research-team-groups.html)
> 实际代码：`packages/desktop/src/components/views/TeamGroupsView.tsx` + `packages/desktop/src/components/teams/*` + `packages/desktop/src/lib/teamChat.ts` + `packages/core/src/api/channels.ts`

---

## 1. 现状与问题

现在「科研小队」被拆在两个互不相通的页面里：

| 页面 | 位置 | 干什么 | 问题 |
|---|---|---|---|
| `ResearchTeamsView` | 工作区树 → 科研小队 | 浏览模板、克隆、提交课题、看任务表 | 是"配置表单 + 任务列表"，看不到成员之间在干什么 |
| `TeamRosterView` | 侧栏「配置」→ 科研小队队员管理 | 对小队定义做 CRUD（谁是队长、谁在队里） | 和实际干活的页面完全分离，改完要切页面才能用 |

三个具体缺口：

1. **没有"人"的感觉**：`members[]` 渲染成表格行，队长只是一个 👑 图标，谁跟谁协作看不出来。
2. **成员管理与使用割裂**：加人/换队长要去另一个账户级页面，而小队本身是按工作区用的。
3. **协作过程不可见**：`TeamOrchestrator` 其实已经在发 `team.plan.ready` / `team.task.status` / `team.handoff.submitted` 等事件，但 UI 只把它们折叠成状态字段，成员之间的交接、质疑、修订要求全被吃掉了。

## 2. 设计目标

把小队从「配置对象」变成「群组」：**一个小队 = 一个群聊**，进群就能看到队长派活、成员交接、审查员打回、你随时插话。

核心隐喻映射：

| WeChat | MedScience | 底层对应 |
|---|---|---|
| 群聊 | 一支科研小队 | `ResearchTeamDefinition` |
| 群主 | 队长 | `leaderAgentId`（`canLead: true` 的成员） |
| 群成员 | 科研成员（内置 11 位 + 自建） | `members[] → AgentDefinition` |
| 通讯录 | 成员库 / 可选角色 | `globalTeamAgentRegistry.list()` |
| 发起群聊（勾人建群） | 拉起小队 | `team:create` |
| 群公告 | 小队统一指令 | `instructions` |
| 群设置 | 并发/任务/修订上限、执行模式 | `maxConcurrency` / `maxTasks` / `maxRevisionsPerTask` / `planningMode` |
| 聊天记录 | 一个个课题（run）串起来的时间线 | `TeamRun` + `TeamTask` + `ScientificHandoff` |
| 群文件 / 收藏 | 产出文件 / 证据库 | `artifactIds` / `evidenceIds` |
| 退出群聊 | 归档小队 | `archived` |

## 3. 信息架构变化

```
侧栏
├─ 工作区树
│   └─ 〈某工作区〉
│        ├─ 对话
│        ├─ 科研小队        ← 改成「群聊列表 + 群聊」三栏页（本设计的主体）
│        ├─ 证据库
│        └─ 产出文件
└─ 配置
     ├─ 运行时（模型配置）
     ├─ 科研技能
     ├─ ~~科研小队队员管理~~   ← 删除，能力并入群聊页的「通讯录」Tab 与「群信息」抽屉
     └─ 防护钩子
```

- `TeamRosterView.tsx` 整页下线：**队伍 CRUD 发生在它被使用的地方**（群信息抽屉里加人/移人/换队长），成员（Agent）本身的定义与自建放到左栏的「通讯录」Tab。
- `navigation.ts` 的 `team-roster` 已直接移除（该 id 只有侧栏自己在用，没有外部入口会 404）。
- **小队按工作区归属**：这是用户明确要求的「每个工作区的科研小队」，需要一处 core 改动（见 §7）。

## 4. 页面布局（三栏）

```
┌──────┬──────────────────┬───────────────────────────┬──────────────────┐
│ 应用  │ A 群组列表 296px  │ B 群聊（自适应）            │ C 群信息 318px    │
│ 侧栏  │                  │                           │ （可收起）        │
│      │ 工作区 · 名称      │ 群名 (7) · 队长 · 课题#3   │ 群成员宫格 + ＋ −  │
│      │ [搜索] [＋拉队]    │ [运行中 3/3] [需队长审批]   │ 小队名称 / 队长     │
│      │ ┌科研小队│队员管理┐ │───────────────────────────│ 群公告（统一指令）  │
│      │ 置顶              │  时间/课题分隔线            │ 小队设置           │
│      │ ● 九宫格 群名 时间 │  你（右侧气泡）             │  执行模式          │
│      │   最后消息   ③    │  队长（👑 + 计划卡片）      │  并发/任务/修订上限 │
│      │ 本工作区的小队 · 3 │  成员（头像+名+交接卡片）    │  自动互相讨论 ⏻    │
│      │ ...               │  系统灰条 / 质量门警告       │  免打扰 / 置顶     │
│      │                   │  正在输入…                 │ 证据 18 / 文件 6   │
│      │                   │───────────────────────────│ 历史课题 3        │
│      │                   │ @ 📎 ◈ /   [暂停][任务图]  │ 归档该小队         │
│      │                   │ [输入框]           [发送]   │                  │
└──────┴──────────────────┴───────────────────────────┴──────────────────┘
```

断点降级（原型已实现）：`<1240px` 收起 C 栏；`<1040px` A 栏收窄；`<820px` A 栏隐藏、顶部返回。

### 4.1 A 栏 · 群组列表

- **九宫格群头像**：成员色块拼成 2×2 / 3×3，和 WeChat 一致，一眼看出队伍构成。
- 每行：状态点（绿=运行中并脉冲 / 黄=等待你 / 无=空闲）、群名、时间、最后一条消息预览（格式固定为 `成员名：内容`）、未读红点、🔕、草稿标记。
- 分组：**置顶** / **本工作区的小队**。内置的 4 个模板**不再**出现在这个列表里 —— 它们降级成"拉队"弹窗里的**推荐组合**，因为模板不是你能聊天的群。
- 「队员管理」Tab：按 统筹与规划 / 证据与写作 / 学科专家 / 定量与工程 四组列出 11 位内置队员 + 自建入口；点开是队员名片。（左栏两个 Tab 的最终文案是 **科研小队 / 队员管理**。）

### 4.2 B 栏 · 群聊

消息一共 8 类（见 §6 的事件映射）：

| 类型 | 样式 | 内容来源 |
|---|---|---|
| 分隔线 | 居中小胶囊「2026-09-22 · 课题 #3」 | 每个 `TeamRun` 一段 |
| 你的消息 | 右侧强调色气泡 | 课题提问 / 插话 / 审批 |
| 队长消息 | 左侧气泡 + 👑 | `leaderAgentId` 的输出 |
| 成员消息 | 左侧气泡，头像色 + 姓名 + 群内角色 | 各 agent 输出，`@某成员` 高亮 |
| 系统灰条 | 居中灰条 | 接管课题、计划获批、任务分派、成员变动 |
| 警告灰条 | 琥珀色 | 质量门要求修订、证据冲突、预算触顶 |
| 卡片消息 | 计划卡 / 交接卡 / 报告卡 | 见下 |
| 正在输入 | 三点动画 +「正在运行 nested CV…」 | 任务 `running` 时的占位 |

三种卡片：

- **计划卡**（队长发）：任务图 T1…Tn、每行 assignee 头像与状态、底部 `[批准并执行] [修改计划] [只跑 T1–T2]` → `team:run:approvePlan`。
- **交接卡**（成员发）：结论 / 局限 / 证据 PMID 胶囊 / 置信度，底部 `[展开全文] [加入证据库]` → 映射 `ScientificHandoff`。
- **报告卡**（队长发）：质量门未过时显示阻塞项与 `[强制综合（降级为探索性）]`，过了就是最终报告入口 → `TeamRunReport`。

输入框：`@成员` 定向派活、`/计划 /暂停 /报告` 斜杠命令、📎 附数据集、◈ 引用证据。顶部工具条常驻 `[⏸ 暂停] [◫ 任务图]`（对应 `pauseRun` 与任务图抽屉）。

### 4.3 C 栏 · 群信息（= WeChat 群聊详情）

- **成员宫格**：每格头像 + 名字，队长带 👑；末尾两格是 `＋添加` 和 `−移出`（与 WeChat 完全一致的交互位）。点任一成员出**成员名片**：`设为队长` / `修改群内角色与指令` / `单独指定运行时（API 或本地 Codex）` / `移出小队`。
- 小队名称（行内改名）、队长（一键转让）、来源模板。
- **群公告** = `instructions`，行内编辑。
- **小队设置**：执行模式（`需队长审批计划` ↔ `自动规划并执行`，即 `planningMode`）、最大并发、任务上限、每任务修订上限、**成员自动互相讨论** 开关、消息免打扰、置顶。
- 群内资料：证据引用 / 产出文件 / 历史课题，跳到既有的证据库、产出文件页并带上过滤条件。
- 底部：归档该小队（红色，二次确认）。

## 5. 关键流程

1. **拉起小队**：A 栏 `＋` → 弹窗左边通讯录勾人、右边已选清单、顶部四个「推荐组合」（= 4 个内置模板一键铺满成员）→ 右侧 👑 指定队长（仅 `canLead` 的成员，否则提示去名片开启）→ 命名（留空按成员自动命名）→ `team:create`（带当前 `workspaceId`）→ 直接落到新群的空聊天，系统灰条提示「发第一个课题给队长」。
2. **加成员**：群信息 `＋` → 同一个选择器（已在群的置灰）→ `team:update`。系统灰条：「你邀请 生物统计学家 加入了小队」。
3. **设队长**：成员名片 → `设为队长` → 校验 `canLead`（`TeamProfileManager` 已有该校验）→ 系统灰条：「队长已转让给 研究规划师」。**运行中的课题禁止转让**，提示先暂停。
4. **移出成员**：`required: true` 的成员需二次确认并提示"该角色是模板要求的必需角色"。
5. **发课题**：输入框发问 → `team:run:start` → 群里出现分隔线 + 队长"正在输入" → 计划卡。
6. **自动交互**：编排器跑起来后，派活、交接、质疑、修订要求实时以聊天消息形式流入（§6）。
7. **插话**：运行中你随时发言；`@某成员` 只唤醒该成员，不 @ 则交给队长重新调度（需编排器新增接口，见 §9-P3）。
8. **归档**：`archived: true`，群从列表消失，进入「已归档」折叠区，可恢复。

## 6. 编排器事件 → 群聊消息映射

现有事件（`TeamOrchestrator.emit`）已经足够撑起 P0 的整条时间线：

| 事件 | 渲染成 |
|---|---|
| `team.run.started` | 分隔线 +「〈队长〉已接管课题，正在拆解任务图…」灰条 + 队长"正在输入" |
| `team.run.status: planning` | 队长"正在输入" |
| `team.plan.ready` | **计划卡**（`taskIds` → 任务行） |
| `team.run.status: awaiting-plan-approval` | 计划卡底部按钮激活 |
| `team.run.status: running` | 灰条「计划已获批准 · 并发上限 N」 |
| `team.task.status: running` | 该 assignee 的"正在输入"占位 |
| `team.handoff.submitted` | 该成员的 **交接卡**（`summary` / `findings` / `limitations` / `evidenceIds`） |
| `team.task.status: revision-requested` | 琥珀警告条 + 审查员消息（`qualityGate.issues`） |
| `team.task.status: failed` | 红色灰条 + `[重试] [跳过]`；`StructuredRunError.cause` 决定文案（工具失败 ≠ 阴性结果） |
| `team.run.status: reviewing` | 科研审查员"正在输入" |
| `team.run.status: synthesizing` | 队长"正在输入" |
| `team.run.completed` | **报告卡** |

**成员之间的"对话感"从哪来（P0 不造假）**：交接里的 `unresolvedQuestions` 与 `recommendedNextActions` 本来就是写给下一个成员的，渲染时按 `@下一任务的 assignee + 原文` 输出；`ScientificConflict` 渲染成审查员对具体成员的 @ 质疑。**不编造未发生的对话** —— 真正自由的多轮互相讨论需要编排器新增消息通道，列在 P3。

## 7. 数据模型改动（全部是增量、向后兼容）

```ts
// packages/core/src/teams/types.ts
export interface ResearchTeamDefinition {
  // ...现有字段不动
  /** 新增：小队归属的工作区；undefined = 账户级（内置模板与旧数据） */
  workspaceId?: string;
}

export interface ResearchTeamMember {
  // ...现有字段不动
  /** 新增：群内个性化补充指令（成员名片里编辑） */
  memberInstructions?: string;
}
```

- `TeamProfileManager.listAll(includeArchived, workspaceId?)`：不传则返回全部；传了返回 `workspaceId === 传入值` 的 + 内置模板。
- `team:list` / `team:create` IPC 与 web `server.ts` 路由各加一个 `workspaceId` 参数（照搬 `team:run:list` 已有的工作区参数写法）。
- 旧数据（无 `workspaceId`）迁移策略：首次加载时归入"未分类小队"折叠区，用户可拖/选到某工作区；不自动改写磁盘。
- 头像颜色不入库，由 `agentId` 哈希到固定色盘（原型里的 11 色）。
- 置顶 / 免打扰 / 已读位点：先用 `localStorage`（键 `medscience.teamGroups.<workspaceId>`），P2 再考虑落盘。未读数 = `lastReadAt` 之后的消息条数。

## 8. 组件与文件清单

```
packages/desktop/src/
├─ components/views/TeamGroupsView.tsx        新增（替代 ResearchTeamsView）
├─ components/teams/
│   ├─ GroupList.tsx / GroupListItem.tsx      A 栏
│   ├─ GroupAvatar.tsx                        九宫格头像
│   ├─ ContactsList.tsx / MemberCard.tsx      通讯录 Tab + 成员名片
│   ├─ GroupChat.tsx                          B 栏时间线
│   ├─ ChatBubble.tsx / SystemNotice.tsx
│   ├─ PlanCard.tsx / HandoffCard.tsx / ReportCard.tsx
│   ├─ GroupComposer.tsx                      @提及 + 斜杠命令
│   ├─ GroupInfoPanel.tsx / MemberGrid.tsx    C 栏
│   └─ CreateGroupModal.tsx                   拉队 / 加人共用
├─ lib/teamChat.ts                            TeamRunRecord + 事件 → GroupMessage[]
└─ hooks/useGroupMessages.ts                  轮询/订阅 + 合并多个 run
删除：components/views/TeamRosterView.tsx、Sidebar.tsx 里的 team-roster 配置项
```

`lib/teamChat.ts` 是这次重构的关键抽象：**UI 不直接读 run/task/handoff，只消费 `GroupMessage[]`**，这样 P0 的轮询实现将来换成事件订阅时，聊天组件一行不用改。

```ts
export type GroupMessage =
  | { kind:'divider'; runId:string; startedAt:string; inquiry:string }
  | { kind:'user'; text:string; at:string }
  | { kind:'agent'; agentId:string; role?:string; text:string; at:string; mentions:string[] }
  | { kind:'system'; tone:'info'|'warn'|'error'; text:string; at:string }
  | { kind:'typing'; agentId:string; hint:string }
  | { kind:'plan'; runId:string; tasks:TeamTask[]; approvable:boolean }
  | { kind:'handoff'; handoff:ScientificHandoff }
  | { kind:'report'; run:TeamRun };
```

## 9. 分期实施

| 阶段 | 内容 | 依赖 |
|---|---|---|
| **P0** 只读群聊 | 三栏骨架 + `teamChat.ts` 适配器 + 三种卡片 + 现有 run 的完整时间线；小队 CRUD 暂时复用现有通道 | 无 core 改动 |
| **P1** 群管理 | 群信息抽屉全量可编辑（加人/移人/换队长/公告/设置）、拉队弹窗、通讯录 Tab；下线 `TeamRosterView` | 无 core 改动 |
| **P2** 工作区归属与状态 | `workspaceId` 字段 + `listAll` 过滤 + IPC/HTTP 参数；置顶/免打扰/未读 | core 小改 |
| **P3** 真·自动交互 | 编排器新增 `interject(runId, text, targetAgentId?)` 与 `team.message` 事件；`@成员` 定向派活；「成员自动互相讨论」开关驱动一轮成员互评 | core 中等改动 |

## 10. 落地情况（实现后回填）

### 已完成

| 阶段 | 内容 | 结果 |
|---|---|---|
| 第 0 步 | 事件订阅取代轮询、删死代码、`TeamOrchestrator.emit` 类型化 | `useTeamGroups` 订阅 `agent:event` 并按 run 增量重读；`mock*.ts` 4 个文件与 `ThemeGalleryView.tsx` 已删 |
| P0 | 三栏群聊骨架、`teamChat.ts` 适配器、计划/交接/报告卡片 | 见 `components/teams/*` |
| P1 | 群信息抽屉全量可编辑、拉队/加人弹窗、通讯录 Tab | `ResearchTeamsView.tsx`、`TeamRosterView.tsx` 已删除，`team-roster` 导航项下线 |
| 契约统一 | `packages/core/src/api/channels.ts` 单一通道注册表 | Electron `ipcMain` 与 web `/api/rpc` 注册同一套 handler；`web/server.ts` 546 → 222 行；`preload.cjs` 变为通用桥 |
| P2 | `workspaceId` 字段 + `listAll` 过滤；置顶/免打扰/未读 | 历史无 `workspaceId` 的小队进入「未分类」标记，不改写磁盘 |
| 测试 | `packages/core/tests/run-all.ts` 遍历全部用例 + 新增 `test-team-groups.ts` | `npm test` 从 8 个文件变为 25 个（4 个联网用例需 `MEDSCIENCE_TEST_NETWORK=1`） |

### 与原设计的差异

1. **没有建 `TeamGroupsContext`**：群状态只有这一页读，做成 `hooks/useTeamGroups.ts` 即可，避免再造一个全局 context。`AgentContext` 的瘦身改为把 220 行运行时事件 switch 抽到 `lib/runtimeEventHandler.ts`（881 → 663 行），公开 API 不变，风险远低于拆分 provider。
2. **契约统一采用单端点 RPC**，而不是逐条映射 REST 路由：`POST /api/rpc {channel, args}`，与 `ipcRenderer.invoke(channel, ...args)` 一一对应。旧的 REST 路由全部删除（仅本机同源调用，无外部消费者）。
3. **模型密钥掩码逻辑上移到 core**：原本 Electron 用 `••••••••`、web 用空串两套，现在统一一份。

### 实现过程中发现并修复的既有缺陷

| 缺陷 | 影响 | 修复 |
|---|---|---|
| `preload.cjs`（Electron 真正加载的文件）与 `preload.ts` 长期不同步 | 桌面端 `agent:submitPrompt` **丢掉** `workspaceId`/`researchProfileId`/`sessionType`/`language`；`runtime:discoverAll`/`bindTool`/`activeSessions`/`getUsage` 根本没暴露 | preload 改为通用桥（只转发 + 白名单），类型化客户端在渲染进程只写一份 |
| Tailwind 按 **CWD** 找配置，`npm run web` 从仓库根启动 | 桌面 UI 实际用的是**门户站**（仓库根 `src/`）的类名集合，本应用独有的类被静默丢弃 | `postcss.config.js` 显式指定配置路径，`tailwind.config.js` 内容 glob 锚定到包目录，`vite.config.ts` 固定 postcss 目录，web server 显式传 `configFile` |
| `LanguageContext` 的 `t` 每次渲染都是新函数 | 任何把 `t` 正确列进依赖的 hook 都会每帧重跑——群聊页表现为无限请求循环 | `t`/`setLanguage`/`toggleLanguage` 用 `useCallback`，context value 用 `useMemo` |
| 28 个测试脚本里只有 8 个进了 `npm test` | 其余 20 个可以坏很久无人发现 | 换成目录遍历；打开后立刻暴露 3 个既有失败（已确认在改动前的 HEAD 上同样失败，见下） |

### 打开测试链后暴露的既有问题（**已全部修复**）

| 问题 | 真实成因 | 修复 |
|---|---|---|
| `test-hooks-system` 失败 | **不是**质量门失效（我上一轮的判断不准）：这是一个**过期的测试**——引擎后来有意加了"没调用任何工具的回复（打招呼）豁免证据门"，测试没跟着更新。但顺着它查出一个真 bug：`ToolRegistry.execute` 对不存在的工具名**抛异常**，而 `AgentLoop` / `AutonomousResearchEngine` / 团队 `ApiAgentRunner` 三个调用方都不 catch —— 模型幻觉一个工具名就会让整轮研究/整个队员任务崩掉 | `ToolRegistry` 改为返回结构化失败（和其它失败一致），测试改成断言"做过工具调用却零证据的综述必须 fail-closed"+ 新增"打招呼豁免"断言 |
| `test-clinical-research-loop` 失败 | **demo（无 API key）模式永远无法完成研究轮次**：`ScientificMockProvider` 的最终综述不带 `[Evidence: EV-x]` 溯源标签，被 CritiqueEngine 正确拒绝 —— 这是没有密钥的用户看到的第一屏体验 | mock 的综述按本轮真实工具结果数输出 EV 标签 |
| `test-subagent-tree` 不稳定 | 断言的是**实时第三方数据**算出的置信度：同一个 TYK2 查询，ChEMBL 有时返回 5 条生物活性记录、有时 0 条，HYP-1 就在 85% 与 50% 之间跳 | 沿用引擎自己的判据（证据锚点 < 2 或 `BioactivitiesCount === 0`）识别"没数据可打分"，此时跳过分数断言并明确打印 SKIPPED；数据正常时照常严格断言 |

`run-all.ts` 里的 `KNOWN_FAILING` 隔离名单已删除 —— 25 个用例现在全绿。

## 10.5 第二阶段：从「小队页」到「对话中心」

### 为什么再动一次

第一阶段把小队做成了群聊，但 `对话` 仍是工作区树里的独立入口，于是每个工作区有 4 个子项。继续往里塞会更臃肿，而把对话平铺进小队列表又会让小队被淹没 —— **根因是两类东西生命周期不对等**：小队有界（一个项目 3～5 支），对话无界（一周能建 20 个）。任何排序规则最后都会被数量压垮。

### 解法：让列表结构上有界

采用微信最核心的那条规则 —— **和同一个人只有一个聊天**：

| 一行代表 | 线程内容 | 分隔单位 |
|---|---|---|
| 一支小队 | 多个 `TeamRun` | 课题分隔线 |
| 一位队员 | 该队员在本工作区的多个 `Session` | 同一条分隔线 |

行数 = 聊过的队员数 + 小队数（约 8～16 行封顶），**小队不可能被淹没**。原本 N 个对话变成某位队员线程里的 N 个课题，通过右栏「课题索引」定位、重命名、导出、删除。

**单聊就是「找队员聊」**，所以「新建对话」这个概念被整个删除：你只是在选跟谁说话。通用专家（`general-expert`，第 12 位内置队员）是默认那个，常驻置顶。

### 页面与导航

- 工作区子项从 4 个降到 3 个：**对话 / 证据库 / 产出文件**（`科研小队` 作为一类行并入 `对话`）。
- `对话` 页左栏两个 Tab：**对话**（混排的有界列表）/ **队员管理**（12 位队员，点开名片可「找 TA 单独聊」、编辑常驻指令、查看所在小队）。
- `＋` 按钮只做一件事：拉起小队（建队需要多选+指定队长，不是点一个人就能完成的动作）。
- 侧栏顶部「新建对话」保留，语义改为：打开通用专家线程并开一个新课题。

### 两级指令作用域

| 字段 | 作用域 | 编辑位置 |
|---|---|---|
| `AgentDefinition.systemPrompt` | 只读 | 不可改（工具权限/隐私级按它约束） |
| `AgentDefinition.userInstructions` | 账户级：单聊 + 它加入的所有小队 | 队员名片 / 单聊右栏 |
| `ResearchTeamMember.memberInstructions` | 仅该小队内，叠加在上面 | 小队群信息 → 成员名片 |

`TeamAgentRegistry` 因此从只读变成带持久化（`agents.json`：内置队员的覆盖层 + 自建队员），内置队员的 `systemPrompt` 仍不可改写。

### 「选队员」现在真的会改变行为

改之前，选哪个 agent 对研究轮次**没有任何影响** —— `AutonomousResearchEngine` 的系统提示是硬编码的，工具给的是全量目录。现在：

- `agents/agentPersona.ts` 统一解析两套 agent 名册（队员库优先，旧的 7 个 `AgentId` 作为兼容回落，并通过 `LEGACY_AGENT_ALIASES` 映射到对应队员）；
- 研究引擎与聊天引擎都把队员的 persona 追加进系统提示，并按队员的 `allowedToolCategories` **裁剪可用工具**；
- `activeAgent` 由固定联合类型放宽为字符串，`agentId` 一路打通到 `ExecutionRequest` / 两个本地运行时后端。

### 顺带修掉的既有缺陷

| 缺陷 | 影响 | 修复 |
|---|---|---|
| `CodexRuntimeBackend` 建会话时把 workspace 写死 `'proj-1'`、agent 写死 `'research'` | 在某个工作区里开的对话，只要走本地运行时执行，就被归档到「未分类」并丢掉队员身份 | 改用 `request.workspaceId` / `request.agentId`（`GenericCliRuntimeBackend` 同样处理） |
| 测试套件直接写真实的 `~/.medscience` | 用户的会话列表里混进了 `Critique Fail-Closed Test` 之类的测试数据 | `run-all.ts` 为每次运行创建一次性 `MEDSCIENCE_HOME`；需要真实凭据的实况用例单独 opt-in |

## 10.6 第三阶段：会话浏览与拟人头像

### 命名定稿

- 工作区树里这一项叫 **科研小队**（页面内仍是 对话 / 队员管理 两个 Tab）。
- 队员线程里的单位是 **会话**（新会话 / N 个会话 / 本次会话）；**小队那边保留「课题」**——交给小队的是一个研究课题，那个词在那边才准确。

### 修掉的浏览缺陷

原来中栏把某位队员的全部会话首尾相连成一条长流（通用专家下有 27 条），于是：

- 点右栏索引只换了输入框的目标，**中栏几乎没变化**，点击看起来像没生效；
- 找上周那次对话只能滚；
- 右栏一栏同时装名片和索引，每条只有标题和日期。

现在：

| 改动 | 说明 |
|---|---|
| **中栏一次只显示一个会话** | 顶部会话切换条：`‹ 标题 · 日期 n/N ▾ ›`，下拉是完整列表；点任何地方都整屏切换 |
| **连续阅读开关** | 想一次翻完历史的保留旧行为，只读（切回单会话才能回复） |
| **左栏行可展开** | 队员行 chevron 展开其会话，按 今天/本周/更早 分组，显示 标题+末条摘要+时间+失败红点，默认 8 条 + 「查看全部 N 条」 |
| **右栏回归纯名片** | 名片 + 常驻指令 + 所在小队 + 会话计数，不再和索引抢空间 |
| **搜索进正文** | 匹配消息内容（标题是首句截断，原来搜不到正文），结果显示 队员·会话·命中片段，点击直达 |
| **⌘K 直达会话** | 命令面板可搜本工作区会话（标题+正文）并直接打开 |

顶层行数仍然有界：二级列表是你主动展开、可随时收起的，小队永远在顶层可见。

### 拟人头像

队员头像从两字文本块（"统"、"PI"）换成 **内联 SVG 人像**（`components/teams/PersonGlyph.tsx`）：

- 发型 6 种 × 眼镜 × 白大褂/听诊器 × 肤色，按 `agentId` 决定，**同一队员永远是同一张脸**；12 位内置队员是手工指定的形象（临床专家挂听诊器、PI 戴眼镜且发际线偏成熟），自建队员按 id 哈希分配。
- 内联绘制：不联网、不打包二进制资源，从小队九宫格里的 12px 小块到名片上的 52px 都清晰。
- 背景仍用队员既有色板，所以和之前的颜色身份一致。

## 10.7 第三阶段补充：头像库、滚动、推荐配置与队长排序

| 项 | 改动 |
|---|---|
| **头像多样化** | `PersonGlyph` 的特征空间扩到 10 种发型 × 5 种发色 × 4 种胡型 × 3 种眼镜 × 5 种着装（白大褂/听诊器/耳机/鸭舌帽/常服）× 6 种肤色 ≈ 18,000 组合；12 位内置队员**逐个手工指定**，保证同一支小队的九宫格里不会出现两张相同的脸，自建队员按 id 哈希落在同一空间内 |
| **滚动修复** | 中栏长会话滚不动：`ConversationsView` 中间那一列是 `flex flex-col` 却没有 `min-h-0`，于是它被内容撑高，下面的 `overflow-y-auto` 永远等于内容高度、滚动条不出现。给该列与两个聊天面板补上 `min-h-0`（团队群聊同样修） |
| **头像遮挡** | 列表行用 `size="lg"` + `!w-[42px]` 只缩了外框、没缩 SVG，导致画面溢出行高。`MemberAvatar` 现在接受**精确像素尺寸**，外框与绘制永远同一个数 |
| **推荐小队配置** | 对话列表底部新增「推荐小队配置」区，列出 4 套内置配置（九宫格头像 + `队长：X　队员：A、B、C`），点击直接带着该配置打开「拉起科研小队」弹窗 |
| **队长优先排序** | 拉队弹窗左侧按 **可任队长 → 队员** 两段分组；右侧已选列表同样按 **队长 / 队员** 分段，队长带王冠；底部固定一行摘要：`队长：首席研究员 (PI)　队员：临床专家、机器学习专家、…` |

## 11. 四个决策点（已定）

1. **一个群同一时间一个课题。** 并发/任务预算是按 run 计的，两个并行 run 会让用户设的「最大并发 3」实际变成 6。`TeamOrchestrator.startRun` 现在会拒绝第二个课题，并且只看本进程内在飞的 run —— 崩溃遗留的 `running` 记录不会把小队永久锁死。
2. **内置模板不可直接聊**，只作为「拉起小队」弹窗里的推荐组合（模板记录是字节级固定的常量，可聊就等于可改）。
3. **跨工作区复用 = 复制一份**，`workspaceId` 保持单值。
4. **自建成员不开放 systemPrompt 全文编辑**，只给 `memberInstructions`（追加在固有提示词之后）+ 工具类别；否则 `privacyClass: 'sensitive-clinical'` 形同虚设。成员名片里已注明这一点。
