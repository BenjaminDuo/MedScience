import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TeamOrchestrator } from '../src/teams/TeamOrchestrator';
import { TeamProfileManager } from '../src/teams/TeamProfileManager';
import { TeamAgentRegistry } from '../src/teams/TeamRegistry';
import { TeamRunStore } from '../src/teams/TeamRunStore';
import { SessionManager } from '../src/core/SessionManager';
import { EventBus } from '../src/core/EventBus';
import { ExecutionProfileManager } from '../src/config/ExecutionProfileManager';
import { ProfileManager } from '../src/config/ProfileManager';
import { PLAN_SUBMIT_TOOL_NAME } from '../src/teams/TeamPlanner';
import { HANDOFF_SUBMIT_TOOL_NAME, REVIEW_SUBMIT_TOOL_NAME } from '../src/teams/ApiAgentRunner';
import { ModelProvider } from '../src/client/ModelProvider';
import { ModelRequest, ModelResponse } from '../src/types/model';
import { RuntimeEvent } from '../src/types/events';

function assertTrue(cond: boolean, message: string) {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
}

let deterministicCallId = 0;
function toolCall(name: string, args: Record<string, any>): ModelResponse {
  deterministicCallId++;
  return {
    content: '',
    finishReason: 'tool_calls',
    toolCalls: [{ id: `call-${deterministicCallId}`, name, arguments: args }],
  };
}

/**
 * A deterministic fake ModelProvider for testing the orchestrator without a
 * real LLM: it looks at which structured "submit" tool is present in the
 * request and calls it with a valid, minimal submission. Mirrors the spirit
 * of fixtures/fake-codex-app-server.mjs used for the local-runtime tests --
 * a protocol-accurate stand-in rather than a mock of internal behavior.
 */
class DeterministicTeamModelProvider implements ModelProvider {
  public name = 'deterministic-test-provider';
  public readonly isExternal = false;
  public failReview = false;

  public async listModels(): Promise<string[]> {
    return ['test-model'];
  }

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    const toolNames = (request.tools || []).map((t: any) => t.name);

    if (toolNames.includes(PLAN_SUBMIT_TOOL_NAME)) {
      // Two-task plan: t2 depends on t1, assigned to two different members.
      return toolCall(PLAN_SUBMIT_TOOL_NAME, {
        summary: 'Investigate the inquiry via a literature pass, then a statistical review.',
        tasks: [
          {
            localId: 't1',
            title: 'Literature scan',
            objective: 'Find primary evidence relevant to the inquiry.',
            assignedAgentId: 'literature-reviewer',
            dependencyLocalIds: [],
            acceptanceCriteria: ['At least one plausible finding is stated.'],
            expectedOutputs: [{ kind: 'finding', description: 'A literature-grounded finding.' }],
          },
          {
            localId: 't2',
            title: 'Statistical read',
            objective: 'Assess the statistical soundness of what the literature scan found.',
            assignedAgentId: 'biostatistician',
            dependencyLocalIds: ['t1'],
            acceptanceCriteria: ['A statistical judgment is stated.'],
            expectedOutputs: [{ kind: 'finding', description: 'A statistical assessment.' }],
          },
        ],
      });
    }

    if (toolNames.includes(HANDOFF_SUBMIT_TOOL_NAME)) {
      // Always submit a hypothesis-kind finding (exempt from the evidence-id requirement) so
      // this test exercises orchestration/scheduling/gating without depending on live network
      // tool calls to real scientific databases.
      return toolCall(HANDOFF_SUBMIT_TOOL_NAME, {
        summary: 'Completed the assigned task using domain reasoning.',
        methods: ['Reviewed the task objective against general domain knowledge.'],
        findings: [{ kind: 'hypothesis', statement: 'A plausible hypothesis worth further empirical testing.', evidenceIds: [], confidence: 0.6 }],
        limitations: ['No live database query was made in this test run.'],
        unresolvedQuestions: [],
        recommendedNextActions: [],
        confidence: 0.6,
      });
    }

    if (toolNames.includes(REVIEW_SUBMIT_TOOL_NAME)) {
      return toolCall(REVIEW_SUBMIT_TOOL_NAME, {
        verdict: this.failReview ? 'revision_required' : 'passed',
        issues: this.failReview ? ['Findings are hypotheses only, not empirically grounded.'] : [],
        recommendations: this.failReview ? ['Re-run with real tool evidence before accepting.'] : [],
        summary: this.failReview ? 'Not yet empirically grounded.' : 'Reasonable given the scope of this run.',
      });
    }

    // Synthesis turn: plain text, no tools.
    return { content: 'Final synthesized narrative covering the literature and statistical findings.', finishReason: 'stop' };
  }

  public async stream(request: ModelRequest, onDelta: (chunk: string) => void): Promise<ModelResponse> {
    const response = await this.generate(request);
    if (response.content) onDelta(response.content);
    return response;
  }
}

function makeRig(testDir: string, provider: DeterministicTeamModelProvider) {
  const teamAgentRegistry = new TeamAgentRegistry();
  const teamProfileManager = new TeamProfileManager(testDir, teamAgentRegistry);
  const runStore = new TeamRunStore(testDir);
  const sessionManager = new SessionManager(path.join(testDir, 'sessions'));
  const eventBus = new EventBus();
  const profileManager = new ProfileManager(testDir);
  const executionProfileManager = new ExecutionProfileManager(testDir, profileManager);

  const orchestrator = new TeamOrchestrator({
    teamProfileManager,
    agentRegistry: teamAgentRegistry,
    runStore,
    sessionManager,
    eventBus,
    profileManager,
    executionProfileManager,
    modelProviderOverride: () => ({ provider, model: 'test-model' }),
  });

  const clone = teamProfileManager.cloneTemplate('team-general-scientific-research', { name: 'Test Team' });
  if (!clone.success || !clone.team) throw new Error(`Failed to clone test team: ${JSON.stringify(clone.errors)}`);

  return { orchestrator, teamProfileManager, runStore, sessionManager, eventBus, team: clone.team };
}

async function runTests() {
  console.log('\n=== Running TeamOrchestrator Test Suite (deterministic fake model provider) ===\n');
  const rootTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medscience-teamorch-test-'));

  try {
    console.log('[Test 1/3] Happy path: plan -> two dependent tasks -> review passes -> synthesis -> completed');
    {
      const dir = path.join(rootTestDir, 't1');
      fs.mkdirSync(dir, { recursive: true });
      const provider = new DeterministicTeamModelProvider();
      const { orchestrator, runStore, team, eventBus } = makeRig(dir, provider);
      const events: RuntimeEvent[] = [];
      eventBus.onAll((e) => events.push(e));

      const record = await orchestrator.startRun(team.id, 'Does X correlate with Y in the literature?');
      assertTrue(record.run.status === 'awaiting-plan-approval', `Expected awaiting-plan-approval after planning (review-first team), got ${record.run.status}`);
      assertTrue(record.tasks.length === 2, `Expected 2 tasks from the plan, got ${record.tasks.length}`);

      await orchestrator.approvePlan(record.run.id);
      // Dispatch runs asynchronously (fire-and-forget from approvePlan); poll until settled.
      let finalRecord = orchestrator.getRun(record.run.id)!;
      for (let i = 0; i < 100 && finalRecord.run.status !== 'completed' && finalRecord.run.status !== 'failed'; i++) {
        await new Promise((r) => setTimeout(r, 20));
        finalRecord = orchestrator.getRun(record.run.id)!;
      }

      assertTrue(finalRecord.run.status === 'completed', `Expected run to complete, got ${finalRecord.run.status} (failure: ${JSON.stringify(finalRecord.run.failure)})`);
      assertTrue(finalRecord.tasks.every((t) => t.status === 'completed'), 'Both tasks should have completed');
      assertTrue(finalRecord.handoffs.length === 2, `Expected 2 handoffs, got ${finalRecord.handoffs.length}`);
      assertTrue(!!finalRecord.run.report, 'A completed run should have a report');
      assertTrue(finalRecord.run.report!.narrative.length > 0, 'The report should have a non-empty narrative');
      assertTrue(finalRecord.run.qualityGate?.verdict === 'passed', 'Quality gate should have passed');

      const persisted = runStore.get(record.run.id);
      assertTrue(!!persisted && persisted.run.status === 'completed', 'The completed run should be persisted to disk under its own id');

      const taskStatusEvents = events.filter((e) => e.type === 'team.task.status' && (e.payload as any).status === 'completed');
      assertTrue(taskStatusEvents.length === 2, `Expected 2 team.task.status(completed) events, got ${taskStatusEvents.length}`);
      const completedEvent = events.find((e) => e.type === 'team.run.completed');
      assertTrue(!!completedEvent && (completedEvent.payload as any).status === 'completed', 'A team.run.completed(completed) event should have fired');
    }

    console.log('[Test 2/3] A task whose dependency never satisfies runs in the right order (t2 only starts after t1 completes)');
    {
      const dir = path.join(rootTestDir, 't2');
      fs.mkdirSync(dir, { recursive: true });
      const provider = new DeterministicTeamModelProvider();
      const { orchestrator, team, eventBus } = makeRig(dir, provider);
      const events: RuntimeEvent[] = [];
      eventBus.onAll((e) => events.push(e));

      const record = await orchestrator.startRun(team.id, 'Ordering check inquiry');
      await orchestrator.approvePlan(record.run.id);
      let finalRecord = orchestrator.getRun(record.run.id)!;
      for (let i = 0; i < 100 && finalRecord.run.status !== 'completed' && finalRecord.run.status !== 'failed'; i++) {
        await new Promise((r) => setTimeout(r, 20));
        finalRecord = orchestrator.getRun(record.run.id)!;
      }
      const runningEvents = events.filter((e) => e.type === 'team.task.status' && (e.payload as any).status === 'running');
      assertTrue(runningEvents.length === 2, `Expected 2 task-started events, got ${runningEvents.length}`);
      const t1 = finalRecord.tasks.find((t) => t.title === 'Literature scan')!;
      const t2 = finalRecord.tasks.find((t) => t.title === 'Statistical read')!;
      assertTrue(new Date(t2.startedAt!).getTime() >= new Date(t1.completedAt!).getTime(), 't2 (which depends on t1) must not start before t1 completes');
    }

    console.log('[Test 3/3] A failing Scientific Critic review blocks completion -- the run is marked failed, never completed');
    {
      const dir = path.join(rootTestDir, 't3');
      fs.mkdirSync(dir, { recursive: true });
      const provider = new DeterministicTeamModelProvider();
      provider.failReview = true;
      const { orchestrator, team } = makeRig(dir, provider);

      const record = await orchestrator.startRun(team.id, 'Should be blocked by review');
      await orchestrator.approvePlan(record.run.id);
      let finalRecord = orchestrator.getRun(record.run.id)!;
      for (let i = 0; i < 100 && finalRecord.run.status !== 'completed' && finalRecord.run.status !== 'failed'; i++) {
        await new Promise((r) => setTimeout(r, 20));
        finalRecord = orchestrator.getRun(record.run.id)!;
      }
      assertTrue(finalRecord.run.status === 'failed', `A failing review must never let the run reach completed, got ${finalRecord.run.status}`);
      assertTrue(finalRecord.run.qualityGate?.verdict === 'revision_required', `Expected qualityGate verdict revision_required, got ${finalRecord.run.qualityGate?.verdict}`);
      assertTrue(!finalRecord.run.report, 'A run blocked by the quality gate must not have a final report');
    }

    console.log('\n=== All TeamOrchestrator tests passed ===\n');
  } finally {
    fs.rmSync(rootTestDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('\n[TeamOrchestrator tests FAILED]\n', err);
  process.exitCode = 1;
});
