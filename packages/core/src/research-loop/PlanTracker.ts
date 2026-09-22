import { EventBus, globalEventBus } from '../core/EventBus.js';

export type TaskCategory = 'literature' | 'databases' | 'computation' | 'clinical' | 'synthesis';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export interface PlanTask {
  id: string; // e.g. 'task-1'
  title: string;
  /** Chinese display title, shown by formatPlanChecklist() when language is 'zh'. Optional so a caller-supplied customTasks[] without one just falls back to `title`. */
  titleZh?: string;
  category: TaskCategory;
  status: TaskStatus;
  evidenceIds: string[];
  startTime?: string;
  endTime?: string;
  resultNote?: string;
  /**
   * Which tool-call names (substring match, checked in plan/task order --
   * the first task with a match wins) route a tool execution onto this
   * task's progress row. Undefined/empty on the plan's designated
   * catch-all task (see isDefaultTask), which absorbs every tool call no
   * more specific task claimed. Set by the active ResearchProfile's task
   * template (see research-loop/ResearchProfiles.ts) -- this is what makes
   * task routing data-driven per profile instead of one engine-wide
   * hardcoded if/else chain.
   */
  toolMatchers?: string[];
  /** Exactly one task per plan should set this -- see toolMatchers. */
  isDefaultTask?: boolean;
}

export interface ResearchPlan {
  id: string;
  sessionId: string;
  inquiry: string;
  tasks: PlanTask[];
  createdAt: string;
  updatedAt: string;
}

export class PlanTracker {
  private plans: Map<string, ResearchPlan> = new Map(); // Keyed by sessionId
  private eventBus: EventBus;

  constructor(eventBus: EventBus = globalEventBus) {
    this.eventBus = eventBus;
  }

  public createPlan(sessionId: string, inquiry: string, customTasks?: PlanTask[]): ResearchPlan {
    const planId = `plan-${Date.now()}`;
    const defaultTasks: PlanTask[] = customTasks || this.generateDefaultTasks(inquiry);

    const plan: ResearchPlan = {
      id: planId,
      sessionId,
      inquiry,
      tasks: defaultTasks,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.plans.set(sessionId, plan);

    this.eventBus.emit({
      type: 'plan.created',
      sessionId,
      timestamp: new Date().toISOString(),
      payload: {
        planId,
        inquiry,
        tasks: plan.tasks,
      },
    });

    return plan;
  }

  public getPlan(sessionId: string): ResearchPlan | undefined {
    return this.plans.get(sessionId);
  }

  public startTask(sessionId: string, taskId: string): void {
    const plan = this.plans.get(sessionId);
    if (!plan) return;

    const task = plan.tasks.find((t) => t.id === taskId);
    if (task && task.status !== 'completed') {
      task.status = 'in_progress';
      task.startTime = new Date().toISOString();
      plan.updatedAt = new Date().toISOString();

      this.eventBus.emit({
        type: 'plan.task.updated',
        sessionId,
        timestamp: new Date().toISOString(),
        payload: {
          planId: plan.id,
          taskId,
          status: 'in_progress',
          task,
        },
      });
    }
  }

  public completeTask(
    sessionId: string,
    taskId: string,
    evidenceIds: string[] = [],
    resultNote?: string
  ): void {
    const plan = this.plans.get(sessionId);
    if (!plan) return;

    const task = plan.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = 'completed';
      task.endTime = new Date().toISOString();
      task.evidenceIds = [...new Set([...task.evidenceIds, ...evidenceIds])];
      task.resultNote = resultNote;
      plan.updatedAt = new Date().toISOString();

      this.eventBus.emit({
        type: 'plan.task.completed',
        sessionId,
        timestamp: new Date().toISOString(),
        payload: {
          planId: plan.id,
          taskId,
          evidenceIds: task.evidenceIds,
          resultNote,
        },
      });

      this.eventBus.emit({
        type: 'plan.task.updated',
        sessionId,
        timestamp: new Date().toISOString(),
        payload: {
          planId: plan.id,
          taskId,
          status: 'completed',
          task,
        },
      });
    }
  }

  public failTask(sessionId: string, taskId: string, reason: string): void {
    const plan = this.plans.get(sessionId);
    if (!plan) return;

    const task = plan.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = 'failed';
      task.endTime = new Date().toISOString();
      task.resultNote = `Failed: ${reason}`;
      plan.updatedAt = new Date().toISOString();

      this.eventBus.emit({
        type: 'plan.task.updated',
        sessionId,
        timestamp: new Date().toISOString(),
        payload: {
          planId: plan.id,
          taskId,
          status: 'failed',
          task,
        },
      });
    }
  }

  public formatPlanChecklist(sessionId: string, language: 'en' | 'zh' = 'en'): string {
    const plan = this.plans.get(sessionId);
    if (!plan || plan.tasks.length === 0) {
      return '';
    }

    const zh = language === 'zh';
    let out = zh
      ? `### 📋 明确科研计划与流程进度清单\n\n`
      : `### 📋 Explicit Scientific Research Plan & Progress Checklist\n\n`;
    out += zh
      ? `| 任务 | 状态 | 行动项 | 已验证证据锚点 | 用时/结果 |\n`
      : `| Task | Status | Action Item | Verified Evidence Anchors | Duration / Outcome |\n`;
    out += `| :--- | :--- | :--- | :--- | :--- |\n`;

    for (const t of plan.tasks) {
      const icon = zh
        ? t.status === 'completed'
          ? '✔ 已完成'
          : t.status === 'in_progress'
          ? '⏳ 进行中'
          : t.status === 'failed'
          ? '✖ 失败'
          : '待处理'
        : t.status === 'completed'
        ? '✔ Completed'
        : t.status === 'in_progress'
        ? '⏳ In Progress'
        : t.status === 'failed'
        ? '✖ Failed'
        : 'Pending';

      const evStr = t.evidenceIds.length > 0 ? t.evidenceIds.join(', ') : '-';
      const noteStr = t.resultNote ? t.resultNote.slice(0, 60) : '-';
      const title = (zh && t.titleZh) || t.title;

      out += `| **${t.id.toUpperCase()}** | ${icon} | **[${t.category}]** ${title} | ${evStr} | ${noteStr} |\n`;
    }

    return out;
  }

  private generateDefaultTasks(inquiry: string): PlanTask[] {
    return [
      {
        id: 'task-1',
        title: 'Retrieve Canonical Target Sequences, 3D Structures & Domain Topology',
        titleZh: '检索靶点标准序列、三维结构与结构域拓扑信息',
        category: 'databases',
        status: 'pending',
        evidenceIds: [],
      },
      {
        id: 'task-2',
        title: 'Explore Bioactivity (IC50/Ki), Selectivity & Literature Associations',
        titleZh: '探索生物活性（IC50/Ki）、选择性与文献关联',
        category: 'databases',
        status: 'pending',
        evidenceIds: [],
      },
      {
        id: 'task-3',
        title: 'Perform Local Sandbox Statistical Analysis, Radiomics or Clinical NLP',
        titleZh: '执行本地沙箱统计分析、影像组学或临床自然语言处理',
        category: 'computation',
        status: 'pending',
        evidenceIds: [],
      },
      {
        id: 'task-4',
        title: 'Validate Clinical Trial Endpoints, Safety Signals & Critique Gate Check',
        titleZh: '验证临床试验终点、安全性信号并通过审查关卡检查',
        category: 'clinical',
        status: 'pending',
        evidenceIds: [],
      },
      {
        id: 'task-5',
        title: 'Synthesize Evidence-Anchored Scientific Report & Traceability Index',
        titleZh: '综合撰写基于证据的科研报告与可追溯索引',
        category: 'synthesis',
        status: 'pending',
        evidenceIds: [],
      },
    ];
  }
}

export const globalPlanTracker = new PlanTracker();
