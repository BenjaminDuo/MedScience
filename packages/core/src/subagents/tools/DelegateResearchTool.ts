import { ToolDefinition, ToolExecutionResult } from '../../types/tools.js';
import { ToolContext } from '../../types/tools.js';
import { SubagentOrchestrationParams, SubagentOrchestrator } from '../SubagentOrchestrator.js';
import { SubagentTask } from '../types.js';

export const DELEGATE_RESEARCH_TOOL_NAME = 'delegate_research';

export interface DelegateResearchInput {
  tasks: Array<{
    id: string;
    type: string;
    objective: string;
    context?: string;
    acceptanceCriteria?: string[];
    allowedToolCategories?: string[];
    allowedToolNames?: string[];
    maxTurns?: number;
    parentTaskId?: string;
  }>;
  maxConcurrentSubagents?: number;
}

export function createDelegateResearchTool(
  orchestrator: SubagentOrchestrator,
  buildParams: (input: DelegateResearchInput, context: ToolContext) => Omit<SubagentOrchestrationParams, 'tasks' | 'maxConcurrentSubagents'>
): ToolDefinition<DelegateResearchInput> {
  return {
    name: DELEGATE_RESEARCH_TOOL_NAME,
    description: 'Delegate one or more independent, bounded research subtasks to isolated internal SubAgents. Use for parallel hypotheses, literature exploration, independent verification, or analysis that benefits from separate context.',
    category: 'orchestration',
    requiredPermission: 'READ',
    inputSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              objective: { type: 'string' },
              context: { type: 'string' },
              acceptanceCriteria: { type: 'array', items: { type: 'string' } },
              allowedToolCategories: { type: 'array', items: { type: 'string' } },
              allowedToolNames: { type: 'array', items: { type: 'string' } },
              maxTurns: { type: 'number' },
              parentTaskId: { type: 'string' },
            },
            required: ['id', 'type', 'objective'],
          },
        },
        maxConcurrentSubagents: { type: 'number', minimum: 1, maximum: 8 },
      },
      required: ['tasks'],
    },
    async execute(input, context): Promise<ToolExecutionResult> {
      if (!input || !Array.isArray(input.tasks) || input.tasks.length === 0) {
        return {
          success: false,
          output: null,
          error: 'delegate_research requires at least one task.',
          execution: {
            id: `tool-${Date.now()}`,
            toolName: DELEGATE_RESEARCH_TOOL_NAME,
            category: 'orchestration',
            description: 'SubAgent delegation',
            status: 'failed',
            logs: [],
          },
        };
      }
      const tasks: SubagentTask[] = input.tasks.map((task) => ({
        ...task,
        parentSessionId: context.sessionId,
        allowedToolCategories: task.allowedToolCategories as SubagentTask['allowedToolCategories'],
      }));
      try {
        const result = await orchestrator.run({
          ...buildParams(input, context),
          tasks,
          maxConcurrentSubagents: input.maxConcurrentSubagents,
        });
        return {
          success: true,
          output: result,
          execution: {
            id: `tool-${Date.now()}`,
            toolName: DELEGATE_RESEARCH_TOOL_NAME,
            category: 'orchestration',
            description: 'SubAgent delegation',
            status: 'completed',
            logs: [`Completed ${result.handoffs.length} handoff(s); ${result.failures.length} failure(s).`],
            resultSummary: `Delegated ${tasks.length} task(s).`,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          output: null,
          error: message,
          execution: {
            id: `tool-${Date.now()}`,
            toolName: DELEGATE_RESEARCH_TOOL_NAME,
            category: 'orchestration',
            description: 'SubAgent delegation',
            status: 'failed',
            logs: [message],
          },
        };
      }
    },
  };
}
