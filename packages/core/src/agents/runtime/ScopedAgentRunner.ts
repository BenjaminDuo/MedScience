import { ModelProvider } from '../../client/ModelProvider.js';
import { ModelMessage, ModelRequest, ModelToolCall } from '../../types/model.js';
import { ToolDefinition, ToolExecutionResult } from '../../types/tools.js';
import { ToolRegistry, globalToolRegistry, ToolExecutionOptions } from '../../tools/ToolRegistry.js';
import { EvidenceTracker } from '../../research-loop/EvidenceTracker.js';
import { EventBus, globalEventBus } from '../../core/EventBus.js';
import { HookRegistry } from '../../hooks/HookRegistry.js';

export interface ScopedToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AgentToolCallRecord {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  success?: boolean;
  error?: string;
  evidenceId?: string;
}

export interface ScopedAgentRunConfig<T = unknown> {
  modelProvider: ModelProvider;
  model?: string;
  systemPrompt: string;
  taskPrompt: string;
  tools?: ToolDefinition[];
  toolRegistry?: ToolRegistry;
  evidenceTracker?: EvidenceTracker;
  sessionId: string;
  agentId: string;
  maxTurns: number;
  submitTool?: ScopedToolSpec;
  outputSchema?: unknown;
  allowedToolNames?: ReadonlySet<string>;
  allowedToolCategories?: ReadonlySet<ToolDefinition['category']>;
  abortSignal?: AbortSignal;
  eventBus?: EventBus;
  hookRegistry?: HookRegistry;
  runtimeKind?: 'team' | 'subagent';
  turnIndexBase?: number;
  onToolCall?: (call: AgentToolCallRecord) => void;
}

export interface ScopedAgentRunResult<T = unknown> {
  status: 'completed' | 'max_turns' | 'failed' | 'cancelled';
  output?: T;
  text?: string;
  submission?: T;
  toolCalls: AgentToolCallRecord[];
  evidenceIds: string[];
  turns: number;
  error?: string;
}

function toolToModelDefinition(tool: ToolDefinition): ScopedToolSpec {
  return { name: tool.name, description: tool.description, parameters: tool.inputSchema };
}

function queryForToolCall(call: ModelToolCall): string {
  const args = call.arguments || {};
  return String(
    args.query ||
      args.accessionOrGene ||
      args.targetOrCompound ||
      args.compoundNameOrCID ||
      args.pdbIdOrUniProt ||
      args.scriptName ||
      args.datasetIdOrPath ||
      JSON.stringify(args)
  );
}

/** Shared bounded model/tool loop for Team Agents and internal SubAgents. */
export class ScopedAgentRunner {
  public async run<T = unknown>(config: ScopedAgentRunConfig<T>): Promise<ScopedAgentRunResult<T>> {
    const registry = config.toolRegistry || globalToolRegistry;
    const tracker = config.evidenceTracker;
    const eventBus = config.eventBus || globalEventBus;
    const tools = (config.tools || []).filter((tool) => {
      if (config.allowedToolNames && !config.allowedToolNames.has(tool.name)) return false;
      if (config.allowedToolCategories && !config.allowedToolCategories.has(tool.category)) return false;
      return true;
    });
    const toolDefinitions = tools.map(toolToModelDefinition);
    if (config.submitTool) toolDefinitions.push(config.submitTool);

    const messages: ModelMessage[] = [
      { role: 'system', content: config.systemPrompt },
      { role: 'user', content: config.taskPrompt },
    ];
    const calls: AgentToolCallRecord[] = [];
    const evidenceIds: string[] = [];
    let lastText = '';
    let turns = 0;

    while (turns < config.maxTurns) {
      if (config.abortSignal?.aborted) {
        return { status: 'cancelled', text: lastText, toolCalls: calls, evidenceIds, turns, error: 'Agent run cancelled.' };
      }

      turns += 1;
      let response;
      try {
        if (config.hookRegistry) {
          const hookResult = await config.hookRegistry.triggerPreToolUse(
            { sessionId: config.sessionId, turnIndex: (config.turnIndexBase || 0) + turns, agentId: config.agentId, event: 'PreToolUse', timestamp: new Date().toISOString() },
            { toolName: 'model_provider_request', toolArguments: { messages }, isExternalApi: config.modelProvider.isExternal !== false }
          );
          if (!hookResult.proceed) {
            return { status: 'failed', text: lastText, toolCalls: calls, evidenceIds, turns, error: hookResult.message || 'Model provider request blocked by a mandatory hook.' };
          }
        }
        response = await config.modelProvider.generate({
          model: config.model || 'gpt-4o',
          messages,
          tools: toolDefinitions,
          toolChoice: config.submitTool ? (tools.length > 0 ? 'required' : { name: config.submitTool.name }) : 'auto',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { status: 'failed', text: lastText, toolCalls: calls, evidenceIds, turns, error: message };
      }

      lastText = response.content || '';
      if (response.finishReason === 'tool_calls' && response.toolCalls && response.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: response.content || '',
          toolCalls: response.toolCalls.map((call) => ({ id: call.id, name: call.name, arguments: call.arguments })),
        });

        let submission: T | undefined;
        for (const call of response.toolCalls) {
          if (config.submitTool && call.name === config.submitTool.name) {
            submission = call.arguments as T;
            continue;
          }

          const callRecord: AgentToolCallRecord = { id: call.id, name: call.name, arguments: call.arguments || {} };
          calls.push(callRecord);
          config.onToolCall?.(callRecord);
          if (config.runtimeKind === 'subagent') {
            eventBus.emit({
              type: 'subagent.tool_called',
              sessionId: config.sessionId,
              timestamp: new Date().toISOString(),
              payload: { agentId: config.agentId, toolCallId: call.id, toolName: call.name, turn: turns },
            });
          }

          const isAllowed =
            tools.some((tool) => tool.name === call.name) &&
            (!config.allowedToolNames || config.allowedToolNames.has(call.name));
          let result: ToolExecutionResult;
          if (!isAllowed) {
            const tool = tools.find((candidate) => candidate.name === call.name);
            result = {
              success: false,
              output: null,
              error: `Tool '${call.name}' is outside this agent's capability scope.`,
              execution: {
                id: `tool-${Date.now()}`,
                toolName: call.name,
                category: tool?.category || 'execution',
                description: tool?.description || 'Out-of-scope tool',
                status: 'failed',
                logs: [],
              },
            };
          } else {
            const executionOptions: ToolExecutionOptions = {
              allowedToolNames: config.allowedToolNames,
              allowedToolCategories: config.allowedToolCategories,
            };
            result = await registry.execute(
              call.name,
              call.arguments,
              config.sessionId,
              config.agentId,
              (config.turnIndexBase || 0) + turns,
              executionOptions
            );
          }

          callRecord.success = result.success;
          callRecord.error = result.error;
          let evidenceId: string | undefined;
          if (result.success && tracker) {
            try {
              const evidence = tracker.record(
                call.name,
                result.execution?.category || 'databases',
                queryForToolCall(call),
                result.execution?.resultSummary || 'Tool executed successfully',
                result.output,
                result.citations,
                result.artifacts,
                result.evidenceVerification
              );
              evidenceId = evidence.id;
              evidenceIds.push(evidence.id);
              callRecord.evidenceId = evidence.id;
              if (config.runtimeKind === 'subagent') {
                eventBus.emit({
                  type: 'subagent.evidence_recorded',
                  sessionId: config.sessionId,
                  timestamp: new Date().toISOString(),
                  payload: { agentId: config.agentId, evidenceId: evidence.id, toolName: call.name },
                });
              }
            } catch (error) {
              callRecord.success = false;
              callRecord.error = error instanceof Error ? error.message : String(error);
            }
          }

          messages.push({
            role: 'tool',
            name: call.name,
            content: result.success ? (typeof result.output === 'string' ? result.output : JSON.stringify(result.output)) : `[Tool execution failed]: ${result.error || 'unknown error'}`,
            toolCallId: call.id,
          });
          if (evidenceId) callRecord.evidenceId = evidenceId;
        }

        if (submission !== undefined) {
          return { status: 'completed', output: submission, submission, text: lastText, toolCalls: calls, evidenceIds, turns };
        }
        continue;
      }

      if (!config.submitTool && (response.finishReason === 'stop' || response.finishReason === 'length')) {
        return { status: 'completed', output: lastText as T, text: lastText, toolCalls: calls, evidenceIds, turns };
      }

      messages.push({ role: 'assistant', content: lastText });
      if (config.submitTool) {
        messages.push({ role: 'user', content: `You must call the "${config.submitTool.name}" tool to finish. Plain text is not accepted.` });
      }
    }

    return {
      status: 'max_turns',
      text: lastText,
      toolCalls: calls,
      evidenceIds,
      turns,
      error: config.submitTool ? `Exhausted ${config.maxTurns} turns without a "${config.submitTool.name}" submission.` : undefined,
    };
  }
}

export const globalScopedAgentRunner = new ScopedAgentRunner();
