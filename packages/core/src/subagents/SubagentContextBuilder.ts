import { EvidenceTracker } from '../research-loop/EvidenceTracker.js';
import { ScientificFinding, ScientificHandoff } from '../teams/types.js';
import { SubagentContext, SubagentTask } from './types.js';

/** Builds a need-to-know context rather than cloning the full parent history. */
export class SubagentContextBuilder {
  public build(
    task: SubagentTask,
    input: {
      originalInquiry: string;
      parentSummary?: string;
      relevantFindings?: ScientificFinding[];
      evidenceTracker?: EvidenceTracker;
      dependencyHandoffs?: ScientificHandoff[];
      constraints?: string[];
    }
  ): SubagentContext {
    return {
      originalInquiry: input.originalInquiry,
      objective: task.objective,
      parentSummary: input.parentSummary,
      relevantFindings: input.relevantFindings,
      relevantEvidence: input.evidenceTracker?.list(),
      dependencyHandoffs: input.dependencyHandoffs,
      constraints: input.constraints,
    };
  }

  public format(context: SubagentContext, task: SubagentTask): string {
    const findings = (context.relevantFindings || []).map((finding) => `- [${finding.kind}] ${finding.statement}`).join('\n') || '(none)';
    const evidence = (context.relevantEvidence || []).map((record) => `- ${record.id}: ${record.summary}`).join('\n') || '(none)';
    const dependencies = (context.dependencyHandoffs || []).map((handoff) => `- ${handoff.taskId}: ${handoff.summary}`).join('\n') || '(none)';
    const criteria = (task.acceptanceCriteria || []).map((criterion) => `- ${criterion}`).join('\n') || '(use scientific judgment)';
    const constraints = (context.constraints || []).map((constraint) => `- ${constraint}`).join('\n') || '(none)';
    return [
      `Original inquiry: ${context.originalInquiry}`,
      `Your isolated objective: ${task.objective}`,
      `Task type: ${task.type}`,
      `Task-specific context: ${task.context || '(none)'}`,
      `Acceptance criteria:\n${criteria}`,
      `Parent summary (need-to-know only): ${context.parentSummary || '(none)'}`,
      `Relevant parent findings:\n${findings}`,
      `Relevant parent evidence:\n${evidence}`,
      `Dependency handoffs:\n${dependencies}`,
      `Constraints:\n${constraints}`,
      'Use only evidence returned by tools in this scope. Report uncertainty and execution failures explicitly.',
    ].join('\n\n');
  }
}

export const globalSubagentContextBuilder = new SubagentContextBuilder();
