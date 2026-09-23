import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TeamProfileManager } from '../src/teams/TeamProfileManager';
import { TeamAgentRegistry } from '../src/teams/TeamRegistry';
import { builtInTeamTemplates, DEFAULT_TEAM_TEMPLATE_ID } from '../src/teams/BuiltInTeamTemplates';
import { builtInTeamAgents } from '../src/teams/BuiltInAgents';

function assertTrue(cond: boolean, message: string) {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
}

async function runTests() {
  console.log('\n=== Running TeamProfileManager Test Suite ===\n');
  const testDir = path.join(os.tmpdir(), `medscience-teams-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  try {
    console.log('[Test 1/7] Every built-in template validates cleanly against the built-in agent registry');
    const registry = new TeamAgentRegistry();
    const manager = new TeamProfileManager(testDir, registry);
    for (const template of builtInTeamTemplates) {
      const result = manager.validateTeam(template);
      assertTrue(result.valid, `Template "${template.name}" should validate cleanly, got errors: ${JSON.stringify(result.errors)}`);
    }

    console.log('[Test 2/7] Exactly 4 built-in templates and 12 built-in agents exist (11 specialists + the general expert)');
    assertTrue(builtInTeamTemplates.length === 4, `Expected 4 built-in templates, got ${builtInTeamTemplates.length}`);
    // 11 team specialists plus 'general-expert', the default partner for a
    // 1:1 conversation -- one roster now serves both chats and teams.
    assertTrue(builtInTeamAgents.length === 12, `Expected 12 built-in agents, got ${builtInTeamAgents.length}`);
    assertTrue(
      builtInTeamTemplates.some((t) => t.id === DEFAULT_TEAM_TEMPLATE_ID),
      'DEFAULT_TEAM_TEMPLATE_ID should reference a real built-in template'
    );

    console.log('[Test 3/7] Every team member agentId resolves in the agent registry, and every leaderAgentId is a canLead member');
    for (const template of builtInTeamTemplates) {
      for (const member of template.members) {
        assertTrue(registry.has(member.agentId), `"${template.name}" references unknown agent "${member.agentId}"`);
      }
      const leaderMember = template.members.find((m) => m.agentId === template.leaderAgentId);
      assertTrue(!!leaderMember && leaderMember.canLead, `"${template.name}"'s leaderAgentId must be a member with canLead: true`);
    }

    console.log('[Test 4/7] listAll() returns built-in templates plus (initially empty) user teams');
    const initialAll = manager.listAll();
    assertTrue(initialAll.length === 4, `Expected 4 teams before any clone, got ${initialAll.length}`);
    assertTrue(manager.listUserTeams().length === 0, 'No user teams should exist yet');

    console.log('[Test 5/7] Cloning a template creates an independent, persisted user-owned team');
    const cloneResult = manager.cloneTemplate(DEFAULT_TEAM_TEMPLATE_ID, { name: 'My Medical AI Team' });
    assertTrue(cloneResult.success, `Clone should succeed, got errors: ${JSON.stringify(cloneResult.errors)}`);
    const cloned = cloneResult.team!;
    assertTrue(cloned.id !== DEFAULT_TEAM_TEMPLATE_ID, 'Cloned team must have its own id, not the template id');
    assertTrue(cloned.builtIn === false, 'A cloned team must not be marked builtIn');
    assertTrue(cloned.clonedFromTemplateId === DEFAULT_TEAM_TEMPLATE_ID, 'Cloned team should record which template it came from');
    assertTrue(fs.existsSync(path.join(testDir, 'teams.json')), 'teams.json should be created on first save');

    // Re-load through a fresh manager instance to prove it was actually persisted to disk, not just held in memory.
    const reloaded = new TeamProfileManager(testDir, registry);
    assertTrue(!!reloaded.getTeam(cloned.id), 'The cloned team should be readable by a fresh TeamProfileManager instance');

    console.log('[Test 6/7] A team referencing an unknown agent id is rejected, and the built-in template constant is never mutated by a failed save');
    const originalMemberCount = builtInTeamTemplates.find((t) => t.id === DEFAULT_TEAM_TEMPLATE_ID)!.members.length;
    const badTeam = {
      ...cloned,
      id: undefined as any,
      members: [...cloned.members, { agentId: 'not-a-real-agent', role: 'Ghost', required: false, canLead: false }],
    };
    const badSave = manager.saveTeam(badTeam);
    assertTrue(!badSave.success, 'Saving a team with an unknown member agentId should fail validation');
    const afterMemberCount = builtInTeamTemplates.find((t) => t.id === DEFAULT_TEAM_TEMPLATE_ID)!.members.length;
    assertTrue(
      afterMemberCount === originalMemberCount,
      'The built-in template constant must never be mutated as a side effect of an unrelated (and rejected) save'
    );

    console.log('[Test 7/7] Archiving a user team hides it from the default listing but keeps it retrievable by id');
    const archived = manager.archiveTeam(cloned.id);
    assertTrue(archived === true, 'archiveTeam should report success for an existing team');
    assertTrue(manager.listUserTeams().length === 0, 'Archived team should be hidden from the default (non-archived) listing');
    assertTrue(manager.listUserTeams(true).length === 1, 'Archived team should still appear when includeArchived is true');
    const stillGettable = manager.getTeam(cloned.id);
    assertTrue(!!stillGettable && stillGettable.archived === true, 'getTeam should still find an archived team directly by id');

    console.log('\n=== All TeamProfileManager tests passed ===\n');
  } finally {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('\n[TeamProfileManager tests FAILED]\n', err);
  process.exitCode = 1;
});
