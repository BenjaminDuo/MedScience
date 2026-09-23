import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TeamProfileManager } from '../src/teams/TeamProfileManager';
import { TeamAgentRegistry } from '../src/teams/TeamRegistry';
import { TeamOrchestrator } from '../src/teams/TeamOrchestrator';
import { TeamRunStore } from '../src/teams/TeamRunStore';
import { SessionManager } from '../src/core/SessionManager';
import { EventBus } from '../src/core/EventBus';
import { builtInTeamTemplates, DEFAULT_TEAM_TEMPLATE_ID } from '../src/teams/BuiltInTeamTemplates';
import { DEFAULT_WORKSPACE_ID } from '../src/core/WorkspaceManager';
import { ModelProvider } from '../src/client/ModelProvider';
import { ModelRequest, ModelResponse, ConnectionTestResult } from '../src/types/model';
import { createApiChannels, apiChannelNames } from '../src/api/channels';

/**
 * Covers what the group-chat UI depends on and the older suites do not:
 * workspace-scoped team listing, the one-run-per-team guard, full run
 * records for a chat transcript, and the shared API channel registry both
 * hosts register.
 */
function assertTrue(cond: boolean, message: string) {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
}

/** Never reached in these tests -- a run here is guarded before any model call. */
class UnusedProvider implements ModelProvider {
  public name = 'unused';
  public readonly isExternal = false;
  public async listModels(): Promise<string[]> {
    return [];
  }
  public async testConnection(): Promise<ConnectionTestResult> {
    return { success: true, latencyMs: 0, model: 'unused' };
  }
  public async generate(_request: ModelRequest): Promise<ModelResponse> {
    throw new Error('The model should not be called in this test.');
  }
  public async stream(_request: ModelRequest, _onDelta: (chunk: string) => void): Promise<ModelResponse> {
    throw new Error('The model should not be called in this test.');
  }
}

async function runTests() {
  console.log('\n=== Running Team Groups Test Suite ===\n');
  const testDir = path.join(os.tmpdir(), `medscience-team-groups-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  try {
    const registry = new TeamAgentRegistry();
    const manager = new TeamProfileManager(testDir, registry);

    console.log('[Test 1/6] A cloned team belongs to the workspace it was created from');
    const inWorkspace = manager.cloneTemplate(DEFAULT_TEAM_TEMPLATE_ID, { name: 'WS-A Team', workspaceId: 'ws-a' });
    assertTrue(inWorkspace.success, `Clone should succeed: ${JSON.stringify(inWorkspace.errors)}`);
    assertTrue(inWorkspace.team?.workspaceId === 'ws-a', 'Clone should carry the workspaceId it was created with');

    console.log('[Test 2/6] A workspace sees only its own teams, and pre-workspace legacy teams are adopted by the default workspace');
    const otherWorkspace = manager.cloneTemplate(DEFAULT_TEAM_TEMPLATE_ID, { name: 'WS-B Team', workspaceId: 'ws-b' });
    const legacy = manager.cloneTemplate(DEFAULT_TEAM_TEMPLATE_ID, { name: 'Legacy Team' });
    assertTrue(otherWorkspace.success && legacy.success, 'Both extra clones should be created');
    assertTrue(!legacy.team?.workspaceId, 'A clone made with no workspace starts unscoped');

    const wsATeams = manager.listUserTeams(false, 'ws-a');
    const names = wsATeams.map((team) => team.name).sort();
    assertTrue(
      names.length === 1 && names[0] === 'WS-A Team',
      `ws-a should see only its own team -- an unscoped legacy team must not follow the user into every workspace, got ${JSON.stringify(names)}`
    );
    assertTrue(
      manager.listUserTeams(false, DEFAULT_WORKSPACE_ID).map((team) => team.name).includes('Legacy Team'),
      'The legacy team is adopted by the default workspace, where it was created back when that was the only one'
    );
    assertTrue(
      manager.getTeam(legacy.team!.id)?.workspaceId === DEFAULT_WORKSPACE_ID,
      'Adoption is persisted, not just applied to the returned copy'
    );
    assertTrue(
      manager.listUserTeams(false).length === 3,
      'An unfiltered listing still returns every user team'
    );
    assertTrue(
      manager.listAll(false, 'ws-a').filter((team) => team.builtIn).length === builtInTeamTemplates.length,
      'Every built-in template is offered in every workspace'
    );

    console.log('[Test 2.5/6] A workspace with no team of its own gets the default one, and archiving it does not bring it back');
    const fresh = new TeamProfileManager(path.join(testDir, 'fresh'), registry);
    const seeded = fresh.ensureDefaultTeam('ws-new');
    assertTrue(!!seeded, 'A workspace with no teams should be seeded with the default template');
    assertTrue(seeded!.workspaceId === 'ws-new', 'The seeded team belongs to that workspace');
    assertTrue(!seeded!.name.includes('(Copy)'), 'The seeded team keeps the template name, not "(Copy)"');
    assertTrue(!fresh.ensureDefaultTeam('ws-new'), 'Seeding is a no-op once the workspace has a team');
    fresh.archiveTeam(seeded!.id);
    assertTrue(
      !fresh.ensureDefaultTeam('ws-new'),
      'Archiving the last team must not silently resurrect a fresh one'
    );

    console.log('[Test 3/6] Member instructions round-trip through a save');
    const withInstructions = {
      ...inWorkspace.team!,
      members: inWorkspace.team!.members.map((member, index) =>
        index === 0 ? { ...member, memberInstructions: 'Always report 95% CIs.' } : member
      ),
    };
    const saved = manager.saveTeam(withInstructions);
    assertTrue(saved.success, `Saving member instructions should succeed: ${JSON.stringify(saved.errors)}`);
    assertTrue(
      manager.getTeam(inWorkspace.team!.id)?.members[0].memberInstructions === 'Always report 95% CIs.',
      'memberInstructions should persist'
    );

    console.log('[Test 4/6] A team runs one inquiry at a time');
    const runStore = new TeamRunStore(testDir);
    const sessionManager = new SessionManager(testDir);
    const orchestrator = new TeamOrchestrator({
      teamProfileManager: manager,
      agentRegistry: registry,
      runStore,
      sessionManager,
      eventBus: new EventBus(),
      modelProviderOverride: () => ({ provider: new UnusedProvider(), model: 'unused' }),
    });

    const teamId = inWorkspace.team!.id;
    // Put a run in flight by hand: startRun would need a model to plan, and
    // what is under test is the guard that runs before any of that.
    const activeRecord = {
      run: {
        id: 'teamrun-active',
        teamId,
        teamVersion: 1,
        sessionId: 'sess-active',
        inquiry: 'first inquiry',
        status: 'running' as const,
        leaderAgentId: inWorkspace.team!.leaderAgentId,
        taskIds: [],
        sharedEvidenceIds: [],
        artifactIds: [],
        budget: { maxConcurrency: 3, maxTasks: 10, maxRevisionsPerTask: 2 },
        startedAt: new Date().toISOString(),
      },
      tasks: [],
      agentRuns: [],
      handoffs: [],
      conflicts: [],
    };
    (orchestrator as any).active.set('teamrun-active', {
      record: activeRecord,
      evidenceTracker: { list: () => [] },
      paused: false,
      cancelled: false,
      dispatching: false,
    });

    let guarded = false;
    try {
      await orchestrator.startRun(teamId, 'second inquiry', undefined, 'ws-a');
    } catch (error) {
      guarded = String(error).includes('already has a run in progress');
    }
    assertTrue(guarded, 'Starting a second run while one is in flight should be refused');
    assertTrue(
      orchestrator.getActiveRunForTeam(teamId)?.run.id === 'teamrun-active',
      'getActiveRunForTeam should report the in-flight run'
    );

    console.log('[Test 5/6] A settled run never blocks the next inquiry');
    activeRecord.run.status = 'completed' as any;
    assertTrue(!orchestrator.getActiveRunForTeam(teamId), 'A completed run is not in flight');

    console.log('[Test 6/6] The shared API channel registry exposes every channel both hosts need');
    const channels = createApiChannels({ onDelta: () => undefined });
    for (const required of [
      'team:list',
      'team:create',
      'team:update',
      'team:archive',
      'team:unarchive',
      'team:cloneTemplate',
      'team:run:start',
      'team:run:history',
      'agent:submitPrompt',
      'runtime:discoverAll',
      'runtime:bindTool',
      'runtime:activeSessions',
      'runtime:getUsage',
      'workspace:create',
      'session:create',
    ]) {
      assertTrue(typeof (channels as any)[required] === 'function', `Channel "${required}" should be registered`);
      assertTrue(apiChannelNames.includes(required as any), `Channel "${required}" should appear in apiChannelNames`);
    }

    console.log('\n=== All Team Groups tests passed ===\n');
  } finally {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

runTests().catch((error) => {
  console.error('\nTeam Groups tests FAILED:', error);
  process.exit(1);
});
