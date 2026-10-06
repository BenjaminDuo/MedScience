import { EventBus } from '../src/core/EventBus.js';
import { ModelProvider } from '../src/client/ModelProvider.js';
import { ModelRequest, ModelResponse } from '../src/types/model.js';
import { ToolRegistry } from '../src/tools/ToolRegistry.js';
import { ToolDefinition, ToolExecutionResult } from '../src/types/tools.js';
import { ToolCategory } from '../src/types/runtime.js';
import { EvidenceTracker } from '../src/research-loop/EvidenceTracker.js';
import { SubagentOrchestrator } from '../src/subagents/SubagentOrchestrator.js';
import { SubagentTask } from '../src/subagents/types.js';
import { createDelegateResearchTool } from '../src/subagents/tools/DelegateResearchTool.js';
import { AutonomousResearchEngine } from '../src/research-loop/AutonomousResearchEngine.js';
import { SessionManager } from '../src/core/SessionManager.js';

function assertTrue(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function tool(name: string, category: 'literature' | 'medical'): ToolDefinition {
  return {
    name,
    description: name,
    category,
    requiredPermission: 'READ',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    async execute(input): Promise<ToolExecutionResult> {
      return {
        success: true,
        output: { tool: name, query: input.query, observation: `${name} returned grounded test data.` },
        execution: { id: `exec-${name}`, toolName: name, category, description: name, status: 'completed', logs: [], resultSummary: `${name} completed` },
      };
    },
  };
}

class DynamicProvider implements ModelProvider {
  public name = 'dynamic-subagent-test-provider';
  public readonly isExternal = false;
  public calls: string[] = [];

  public async listModels(): Promise<string[]> { return ['test']; }
  public async stream(request: ModelRequest, onDelta: (chunk: string) => void): Promise<ModelResponse> {
    const response = await this.generate(request);
    if (response.content) onDelta(response.content);
    return response;
  }

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    const prompt = request.messages.find((message) => message.role === 'user')?.content;
    const promptText = typeof prompt === 'string' ? prompt : '';
    if (/FAIL_BRANCH/.test(promptText)) throw new Error('simulated branch failure');
    const names = (request.tools || []).map((entry) => (entry as { name: string }).name);
    const hasPubmed = request.messages.some((message) => message.role === 'tool' && message.name === 'pubmed_test');
    const hasClinical = request.messages.some((message) => message.role === 'tool' && message.name === 'clinical_test');
    if (names.includes('subagent_submit_handoff') && hasClinical) {
      return {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [{ id: `submit-${this.calls.length}`, name: 'subagent_submit_handoff', arguments: {
          summary: 'Dynamic literature-to-clinical verification completed.',
          methods: ['Selected PubMed first, then ClinicalTrials based on the first result.'],
          findings: [{ kind: 'observation', statement: 'The second tool was selected after reviewing the first tool result.', evidenceIds: ['EV-1', 'EV-2'], confidence: 0.9 }],
          limitations: [], unresolvedQuestions: [], recommendedNextActions: [], confidence: 0.9,
        }}],
      };
    }
    if (names.includes('clinical_test') && hasPubmed) {
      this.calls.push('clinical_test');
      return { content: '', finishReason: 'tool_calls', toolCalls: [{ id: `clinical-${this.calls.length}`, name: 'clinical_test', arguments: { query: 'follow-up' } }] };
    }
    if (names.includes('pubmed_test') && !hasPubmed) {
      this.calls.push('pubmed_test');
      return { content: '', finishReason: 'tool_calls', toolCalls: [{ id: `pubmed-${this.calls.length}`, name: 'pubmed_test', arguments: { query: 'initial literature' } }] };
    }
    if (names.includes('subagent_submit_handoff')) {
      return { content: '', finishReason: 'tool_calls', toolCalls: [{ id: `hypothesis-${this.calls.length}`, name: 'subagent_submit_handoff', arguments: {
        summary: 'No permitted domain tool was available.', methods: [], findings: [{ kind: 'hypothesis', statement: 'Requires a permitted medical tool.', evidenceIds: [] }], limitations: [], unresolvedQuestions: [], recommendedNextActions: [], confidence: 0.2,
      } }] };
    }
    return { content: '', finishReason: 'stop' };
  }
}

class MainDelegatingProvider implements ModelProvider {
  public name = 'main-delegating-test-provider';
  public readonly isExternal = false;
  private readonly dynamic = new DynamicProvider();
  public async listModels(): Promise<string[]> { return ['test']; }
  public async stream(request: ModelRequest, onDelta: (chunk: string) => void): Promise<ModelResponse> {
    const response = await this.generate(request);
    if (response.content) onDelta(response.content);
    return response;
  }
  public async generate(request: ModelRequest): Promise<ModelResponse> {
    const names = (request.tools || []).map((entry) => (entry as { name: string }).name);
    const alreadyDelegated = request.messages.some((message) => message.role === 'tool' && message.name === 'delegate_research');
    if (names.includes('delegate_research') && !alreadyDelegated) {
      return { content: '', finishReason: 'tool_calls', toolCalls: [{ id: 'main-delegate', name: 'delegate_research', arguments: { tasks: [{ id: 'main-task', type: 'verification', objective: 'Verify the inquiry independently' }] } }] };
    }
    if (alreadyDelegated) return { content: 'Delegated synthesis [Evidence: EV-1].', finishReason: 'stop' };
    return this.dynamic.generate(request);
  }
}

async function runTests(): Promise<void> {
  console.log('=== SubAgent Runtime Tests ===');
  const registry = new ToolRegistry();
  registry.register(tool('pubmed_test', 'literature'));
  registry.register(tool('clinical_test', 'medical'));
  const eventBus = new EventBus();
  const provider = new DynamicProvider();
  const orchestrator = new SubagentOrchestrator({ modelProvider: provider, toolRegistry: registry, eventBus });
  const parentTracker = new EvidenceTracker(undefined, 'parent');

  const tasks: SubagentTask[] = ['A', 'B', 'C'].map((id) => ({ id, parentSessionId: 'parent-session', type: 'literature', objective: `Investigate mechanism ${id}`, acceptanceCriteria: ['return evidence'] }));
  const result = await orchestrator.run({
    parentSessionId: 'parent-session',
    tasks,
    context: { originalInquiry: 'Compare mechanisms', objective: 'Compare mechanisms' },
    parentEvidenceTracker: parentTracker,
    parentAllowedToolCategories: new Set<ToolCategory>(['literature', 'medical']),
  });
  assertTrue(result.handoffs.length === 3, 'three independent SubAgents should return handoffs');
  assertTrue(parentTracker.count() === 6, 'branch evidence should be adopted only after handoff');
  assertTrue(result.evidenceAdoptions.every((adoption) => Object.keys(adoption.mapping).every((key) => key.includes(':EV-'))), 'adoption mapping must retain branch-local provenance');
  assertTrue(provider.calls.includes('clinical_test'), 'the model must dynamically choose the second tool');
  assertTrue(eventBus.getHistory().some((event) => event.type === 'subagent.completed'), 'runtime completion events should be emitted');

  const delegatedParent = new EvidenceTracker(undefined, 'delegated-parent');
  registry.register(createDelegateResearchTool(orchestrator, (input, context) => ({
    parentSessionId: context.sessionId,
    context: { originalInquiry: 'delegated inquiry', objective: input.tasks.map((task) => task.objective).join('; ') },
    parentEvidenceTracker: delegatedParent,
    parentAllowedToolCategories: new Set<ToolCategory>(['literature', 'medical']),
    parentAllowedToolNames: new Set(['pubmed_test', 'clinical_test']),
  })));
  const delegated = await registry.execute('delegate_research', { tasks: [{ id: 'delegated', type: 'verification', objective: 'Verify through independent evidence' }] }, 'main-session', 'research', 1);
  assertTrue(delegated.success, 'delegate_research must execute through ToolRegistry');
  assertTrue(delegatedParent.count() === 2, 'delegation tool must adopt child evidence into the parent scope');

  const mainRegistry = new ToolRegistry();
  mainRegistry.register(tool('pubmed_test', 'literature'));
  mainRegistry.register(tool('clinical_test', 'medical'));
  const mainSessionManager = new SessionManager('/private/tmp/medscience-main-delegation-session');
  const mainEngine = new AutonomousResearchEngine({ modelProvider: new MainDelegatingProvider(), toolRegistry: mainRegistry, sessionManager: mainSessionManager, eventBus: new EventBus(), maxTurns: 4 });
  const mainSession = mainSessionManager.createSession('main delegation', 'proj-1', 'research', undefined, 'test-model');
  const mainTurn = await mainEngine.run(mainSession, 'Compare competing mechanisms and delegate independent verification.');
  assertTrue(mainTurn.toolCalls.some((call) => call.name === 'delegate_research'), 'Main Agent should be able to choose delegate_research through its normal tool loop');
  assertTrue(mainTurn.agentResponse.includes('[Evidence: EV-1]'), 'Main Agent synthesis should retain an adopted evidence anchor');

  const beforePermissionClinical = provider.calls.filter((call) => call === 'clinical_test').length;
  const permissionResult = await orchestrator.run({
    parentSessionId: 'permission-session',
    tasks: [{ id: 'permission', parentSessionId: 'permission-session', type: 'verification', objective: 'Attempt a medical lookup' }],
    context: { originalInquiry: 'permission', objective: 'permission' },
    parentEvidenceTracker: new EvidenceTracker(undefined, 'permission-parent'),
    parentAllowedToolCategories: new Set<ToolCategory>(['literature']),
    parentAllowedToolNames: new Set(['pubmed_test']),
  });
  assertTrue(permissionResult.handoffs.length === 1, 'a scope-limited branch should still return a bounded handoff');
  assertTrue(provider.calls.filter((call) => call === 'clinical_test').length === beforePermissionClinical, 'a child cannot acquire a category the parent does not have');

  const failureResult = await orchestrator.run({
    parentSessionId: 'failure-session',
    tasks: [
      { id: 'ok', parentSessionId: 'failure-session', type: 'literature', objective: 'Investigate a successful branch' },
      { id: 'bad', parentSessionId: 'failure-session', type: 'literature', objective: 'FAIL_BRANCH' },
    ],
    context: { originalInquiry: 'partial failure', objective: 'partial failure' },
    parentEvidenceTracker: new EvidenceTracker(undefined, 'failure-parent'),
  });
  assertTrue(failureResult.handoffs.some((handoff) => handoff.taskId === 'ok'), 'successful branches must survive another branch failure');
  assertTrue(failureResult.failures.some((failure) => failure.taskId === 'bad'), 'failed branches must be reported explicitly');
  console.log('✔ SubAgent runtime, dynamic tools, evidence adoption, permission inheritance, and partial failure passed.');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
