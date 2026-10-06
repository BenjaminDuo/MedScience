import { EventBus } from '../src/core/EventBus.js';
import { ModelProvider } from '../src/client/ModelProvider.js';
import { ModelRequest, ModelResponse } from '../src/types/model.js';
import { ToolDefinition, ToolExecutionResult } from '../src/types/tools.js';
import { ToolRegistry } from '../src/tools/ToolRegistry.js';
import { ToolCategory } from '../src/types/runtime.js';
import { EvidenceTracker } from '../src/research-loop/EvidenceTracker.js';
import { globalEvidenceVerifier } from '../src/research-loop/EvidenceVerifier.js';
import { SubagentOrchestrator } from '../src/subagents/SubagentOrchestrator.js';
import { SubagentRunner } from '../src/subagents/SubagentRunner.js';
import { SUBAGENT_RUNTIME_LIMITS, SubagentTask } from '../src/subagents/types.js';
import { SubagentTreeEngine } from '../src/research-loop/SubagentTreeEngine.js';
import { SessionManager } from '../src/core/SessionManager.js';
import { AutonomousResearchEngine } from '../src/research-loop/AutonomousResearchEngine.js';

function assertTrue(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function makeTool(
  name: string,
  category: ToolCategory = 'literature',
  onExecute?: () => Promise<void> | void
): ToolDefinition {
  return {
    name,
    description: name,
    category,
    requiredPermission: 'READ',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    async execute(input): Promise<ToolExecutionResult> {
      await onExecute?.();
      return {
        success: true,
        output: { tool: name, query: input.query, result: `${name} grounded result` },
        execution: {
          id: `execution-${name}`,
          toolName: name,
          category,
          description: name,
          status: 'completed',
          logs: [],
          resultSummary: `${name} completed`,
        },
      };
    },
  };
}

abstract class TestProvider implements ModelProvider {
  public abstract name: string;
  public readonly isExternal = false;
  public async listModels(): Promise<string[]> { return ['hardening-test']; }
  public async stream(request: ModelRequest, onDelta: (chunk: string) => void): Promise<ModelResponse> {
    const response = await this.generate(request);
    if (response.content) onDelta(response.content);
    return response;
  }
  public abstract generate(request: ModelRequest): Promise<ModelResponse>;
}

function toolNames(request: ModelRequest): string[] {
  return (request.tools || []).map((tool) => (tool as { name: string }).name);
}

function observedEvidenceIds(request: ModelRequest): string[] {
  return Array.from(
    new Set(
      request.messages
        .filter((message) => message.role === 'tool' && typeof message.content === 'string')
        .flatMap((message) => Array.from(message.content.matchAll(/\[Evidence recorded: (EV-\d+)\]/g), (match) => match[1]))
    )
  );
}

class DynamicHypothesisProvider extends TestProvider {
  public name = 'dynamic-hypothesis-hardening-provider';
  public selectedTools: string[] = [];
  public offeredTools: string[][] = [];

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    const names = toolNames(request);
    this.offeredTools.push(names);
    const hasPubmed = request.messages.some((message) => message.role === 'tool' && message.name === 'pubmed_test');
    const hasPython = request.messages.some((message) => message.role === 'tool' && message.name === 'python_test');
    if (names.includes('subagent_submit_handoff') && hasPython) {
      return {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [{
          id: 'hypothesis-submit',
          name: 'subagent_submit_handoff',
          arguments: {
            summary: 'The hypothesis was tested through literature and then local analysis.',
            methods: ['Selected PubMed first, then Python after reviewing the PubMed result.'],
            findings: [{ kind: 'observation', statement: 'Dynamic two-tool hypothesis analysis completed.', evidenceIds: observedEvidenceIds(request), confidence: 0.8 }],
            limitations: [],
            unresolvedQuestions: [],
            recommendedNextActions: [],
            confidence: 0.8,
          },
        }],
      };
    }
    if (names.includes('python_test') && hasPubmed) {
      this.selectedTools.push('python_test');
      return { content: '', finishReason: 'tool_calls', toolCalls: [{ id: 'python-call', name: 'python_test', arguments: { query: 'analyze literature result' } }] };
    }
    if (names.includes('pubmed_test') && !hasPubmed) {
      this.selectedTools.push('pubmed_test');
      return { content: '', finishReason: 'tool_calls', toolCalls: [{ id: 'pubmed-call', name: 'pubmed_test', arguments: { query: 'hypothesis evidence' } }] };
    }
    return { content: '', finishReason: 'tool_calls', toolCalls: [{ id: 'fallback-submit', name: 'subagent_submit_handoff', arguments: {
      summary: 'Inconclusive test.', methods: [], findings: [{ kind: 'hypothesis', statement: 'Needs more evidence.', evidenceIds: [] }], limitations: [], unresolvedQuestions: [], recommendedNextActions: [], confidence: 0.2,
    } }] };
  }
}

class ScopeProbeProvider extends TestProvider {
  public name = 'scope-probe-provider';
  public offeredTools: string[][] = [];

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    const names = toolNames(request);
    this.offeredTools.push(names);
    if (names.includes('subagent_submit_handoff')) {
      return { content: '', finishReason: 'tool_calls', toolCalls: [{ id: 'scope-submit', name: 'subagent_submit_handoff', arguments: {
        summary: 'Scoped branch completed.', methods: [], findings: [{ kind: 'hypothesis', statement: 'No recursive delegation occurred.', evidenceIds: [] }], limitations: [], unresolvedQuestions: [], recommendedNextActions: [], confidence: 0.4,
      } }] };
    }
    return { content: '', finishReason: 'tool_calls', toolCalls: [{ id: 'scope-tool', name: 'pubmed_test', arguments: { query: 'scope' } }] };
  }
}

class LoopingProvider extends TestProvider {
  public name = 'looping-provider';

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    return { content: '', finishReason: 'tool_calls', toolCalls: [{ id: `loop-${request.messages.length}`, name: 'budget_tool', arguments: { query: 'repeat' } }] };
  }
}

class ConcurrencyProvider extends TestProvider {
  public name = 'concurrency-provider';

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    if (request.messages.some((message) => message.role === 'tool' && message.name === 'slow_tool')) {
      return { content: '', finishReason: 'tool_calls', toolCalls: [{ id: 'concurrency-submit', name: 'subagent_submit_handoff', arguments: {
        summary: 'Bounded branch completed.', methods: [], findings: [{ kind: 'hypothesis', statement: 'Concurrency was bounded.', evidenceIds: [] }], limitations: [], unresolvedQuestions: [], recommendedNextActions: [], confidence: 0.4,
      } }] };
    }
    return { content: '', finishReason: 'tool_calls', toolCalls: [{ id: 'slow-call', name: 'slow_tool', arguments: { query: 'concurrency' } }] };
  }
}

class SimpleLookupProvider extends TestProvider {
  public name = 'simple-lookup-provider';
  public calls: string[] = [];

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    const alreadyLookedUp = request.messages.some((message) => message.role === 'tool' && message.name === 'uniprot_test');
    if (!alreadyLookedUp) {
      this.calls.push('uniprot_test');
      return { content: '', finishReason: 'tool_calls', toolCalls: [{ id: 'lookup', name: 'uniprot_test', arguments: { query: 'protein X' } }] };
    }
    return { content: 'UniProt lookup completed [Evidence: EV-1].', finishReason: 'stop' };
  }
}

async function expectReject(action: () => Promise<unknown>, expected: string): Promise<void> {
  let rejected = false;
  try {
    await action();
  } catch (error) {
    rejected = String(error).includes(expected);
  }
  assertTrue(rejected, `expected rejection containing '${expected}'`);
}

async function runTests(): Promise<void> {
  console.log('=== SubAgent Hardening Tests ===');

  console.log('[1/6] Runtime turn and concurrency limits');
  const budgetRegistry = new ToolRegistry();
  budgetRegistry.register(makeTool('budget_tool'));
  const timedOut = await new SubagentRunner({ modelProvider: new LoopingProvider(), toolRegistry: budgetRegistry, defaultMaxTurns: 999 }).run(
    { id: 'budget', parentSessionId: 'budget-parent', type: 'verification', objective: 'exercise the turn budget', maxTurns: 999 },
    { originalInquiry: 'budget', objective: 'budget' },
    new Set<ToolCategory>(['literature']),
    new Set(['budget_tool'])
  );
  assertTrue(timedOut.status === 'timeout', 'maxTurns must be enforced server-side');
  assertTrue(timedOut.runtime.turns === SUBAGENT_RUNTIME_LIMITS.maxTurns, 'effective maxTurns must be the hard runtime maximum');

  let active = 0;
  let maxActive = 0;
  const concurrencyRegistry = new ToolRegistry();
  concurrencyRegistry.register(makeTool('slow_tool', 'literature', async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
  }));
  const concurrencyOrchestrator = new SubagentOrchestrator({ modelProvider: new ConcurrencyProvider(), toolRegistry: concurrencyRegistry, maxConcurrentSubagents: 100 });
  const concurrencyResult = await concurrencyOrchestrator.run({
    parentSessionId: 'concurrency-parent',
    tasks: Array.from({ length: SUBAGENT_RUNTIME_LIMITS.maxTasks }, (_, index) => ({ id: `c-${index}`, parentSessionId: 'concurrency-parent', type: 'verification', objective: `branch ${index}` })),
    context: { originalInquiry: 'concurrency', objective: 'concurrency' },
    parentAllowedToolCategories: new Set<ToolCategory>(['literature']),
    parentAllowedToolNames: new Set(['slow_tool']),
    maxConcurrentSubagents: 100,
  });
  assertTrue(concurrencyResult.handoffs.length === SUBAGENT_RUNTIME_LIMITS.maxTasks, 'the allowed task count should still execute');
  assertTrue(maxActive <= SUBAGENT_RUNTIME_LIMITS.maxConcurrentSubagents, 'actual concurrency must respect the hard maximum');

  console.log('[2/6] Task count, duplicate ID, dependency, and cycle validation');
  const validationOrchestrator = new SubagentOrchestrator({ modelProvider: new ScopeProbeProvider(), toolRegistry: budgetRegistry });
  const baseContext = { originalInquiry: 'validation', objective: 'validation' };
  const task = (id: string, parentTaskId?: string): SubagentTask => ({ id, parentSessionId: 'validation-parent', type: 'verification', objective: id, parentTaskId });
  await expectReject(() => validationOrchestrator.run({ parentSessionId: 'validation-parent', tasks: [task('same'), task('same')], context: baseContext }), 'Duplicate');
  await expectReject(() => validationOrchestrator.run({ parentSessionId: 'validation-parent', tasks: [task('missing-child', 'missing')], context: baseContext }), 'missing task');
  await expectReject(() => validationOrchestrator.run({ parentSessionId: 'validation-parent', tasks: [task('self', 'self')], context: baseContext }), 'cannot depend on itself');
  await expectReject(() => validationOrchestrator.run({ parentSessionId: 'validation-parent', tasks: [task('a', 'b'), task('b', 'a')], context: baseContext }), 'cycle');
  await expectReject(() => validationOrchestrator.run({ parentSessionId: 'validation-parent', tasks: Array.from({ length: SUBAGENT_RUNTIME_LIMITS.maxTasks + 1 }, (_, index) => task(`too-many-${index}`)), context: baseContext }), 'maximum');

  console.log('[3/6] Orchestration tools are hidden from SubAgents');
  const scopeRegistry = new ToolRegistry();
  scopeRegistry.register(makeTool('pubmed_test'));
  scopeRegistry.register(makeTool('delegate_research', 'orchestration'));
  const scopeProvider = new ScopeProbeProvider();
  const scopeRunner = new SubagentRunner({ modelProvider: scopeProvider, toolRegistry: scopeRegistry });
  const scopeResult = await scopeRunner.run(
    { id: 'scope', parentSessionId: 'scope-parent', type: 'verification', objective: 'check scope' },
    { originalInquiry: 'scope', objective: 'scope' },
    new Set<ToolCategory>(['literature', 'orchestration']),
    new Set(['pubmed_test', 'delegate_research'])
  );
  assertTrue(scopeResult.status === 'completed', 'scope probe should complete');
  assertTrue(scopeProvider.offeredTools.every((names) => !names.includes('delegate_research')), 'SubAgents must not receive orchestration tools by default');

  console.log('[4/6] Hypothesis Tree uses dynamic SubAgent tool selection');
  const hypothesisRegistry = new ToolRegistry();
  hypothesisRegistry.register(makeTool('pubmed_test', 'literature'));
  hypothesisRegistry.register(makeTool('python_test', 'analysis'));
  hypothesisRegistry.register(makeTool('delegate_research', 'orchestration'));
  const hypothesisProvider = new DynamicHypothesisProvider();
  const hypothesisEngine = new SubagentTreeEngine(
    hypothesisRegistry,
    new SessionManager('/private/tmp/medscience-hardening-hypothesis'),
    new EventBus(),
    globalEvidenceVerifier,
    hypothesisProvider
  );
  const hypothesisParent = new EvidenceTracker(undefined, 'hypothesis-parent');
  const hypothesisResult = await hypothesisEngine.exploreHypothesesParallel('hypothesis-parent', [{
    id: 'h1',
    title: 'Dynamic mechanism',
    statement: 'Test the mechanism with literature followed by local analysis.',
    targetEntity: 'TEST',
    status: 'pending',
    confidenceScore: 0,
    evidenceIds: [],
  }], hypothesisParent, 1);
  assertTrue(hypothesisResult.branchResults[0]?.status === 'supported', 'dynamic hypothesis branch should complete with evidence');
  assertTrue(hypothesisProvider.selectedTools.join('>') === 'pubmed_test>python_test', 'hypothesis branch must choose tools based on prior results');
  assertTrue(hypothesisProvider.offeredTools.every((names) => !names.includes('delegate_research')), 'Hypothesis Tree branches must not receive recursive delegation capability');

  console.log('[5/6] Simple Main Agent work does not delegate');
  const simpleRegistry = new ToolRegistry();
  simpleRegistry.register(makeTool('uniprot_test', 'databases'));
  const simpleProvider = new SimpleLookupProvider();
  const simpleSessionManager = new SessionManager('/private/tmp/medscience-hardening-simple');
  const simpleEngine = new AutonomousResearchEngine({
    modelProvider: simpleProvider,
    toolRegistry: simpleRegistry,
    sessionManager: simpleSessionManager,
    eventBus: new EventBus(),
    maxTurns: 3,
  });
  const simpleSession = simpleSessionManager.createSession('simple lookup', 'hardening', 'research', undefined, 'test-model');
  const simpleTurn = await simpleEngine.run(simpleSession, 'Look up the UniProt record for protein X.');
  assertTrue(simpleProvider.calls.length === 1 && simpleProvider.calls[0] === 'uniprot_test', 'simple lookup should use its normal domain tool');
  assertTrue(!simpleTurn.toolCalls.some((call) => call.name === 'delegate_research'), 'simple lookup must not call delegate_research');

  console.log('[6/6] Shared evidence adoption and orchestration auditability');
  const branch = new EvidenceTracker(undefined, 'branch-harden');
  branch.record('pubmed_test', 'literature', 'query', 'branch evidence', { result: 'grounded' });
  const parent = new EvidenceTracker(undefined, 'parent-harden');
  const adoption = parent.adoptFrom(branch);
  assertTrue(parent.count() === 1, 'branch evidence should be adopted exactly once');
  assertTrue(adoption.mapping['branch-harden:EV-1'] === 'EV-1', 'adoption should preserve branch-to-parent provenance mapping');

  console.log('✔ SubAgent hardening tests passed.');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
