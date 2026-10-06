import { ScientificFindingKind } from '../teams/types.js';
import { SubagentTask } from './types.js';

export interface ValidatedSubagentSubmission {
  summary: string;
  methods: string[];
  findings: { kind: ScientificFindingKind; statement: string; evidenceIds: string[]; confidence?: number }[];
  limitations: string[];
  unresolvedQuestions: string[];
  recommendedNextActions: string[];
  confidence: number;
}

const findingKinds: ScientificFindingKind[] = ['observation', 'inference', 'hypothesis', 'negative_result', 'execution_error'];

export class SubagentOutputValidator {
  public validate(input: unknown, task: SubagentTask, availableEvidenceIds: ReadonlySet<string>): { valid: true; value: ValidatedSubagentSubmission } | { valid: false; errors: string[] } {
    const errors: string[] = [];
    const candidate = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    if (typeof candidate.summary !== 'string' || !candidate.summary.trim()) errors.push('summary must be a non-empty string');
    if (!Array.isArray(candidate.methods)) errors.push('methods must be an array');
    if (!Array.isArray(candidate.findings)) errors.push('findings must be an array');
    if (!Array.isArray(candidate.limitations)) errors.push('limitations must be an array');
    if (!Array.isArray(candidate.unresolvedQuestions)) errors.push('unresolvedQuestions must be an array');
    if (!Array.isArray(candidate.recommendedNextActions)) errors.push('recommendedNextActions must be an array');
    const confidence = candidate.confidence;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) errors.push('confidence must be a number in [0, 1]');

    const findings = Array.isArray(candidate.findings) ? candidate.findings : [];
    findings.forEach((raw, index) => {
      const finding = raw as Record<string, unknown>;
      if (!finding || typeof finding !== 'object' || !findingKinds.includes(finding.kind as ScientificFindingKind)) {
        errors.push(`findings[${index}].kind is invalid`);
        return;
      }
      if (typeof finding.statement !== 'string' || !finding.statement.trim()) errors.push(`findings[${index}].statement must be a string`);
      if (!Array.isArray(finding.evidenceIds)) errors.push(`findings[${index}].evidenceIds must be an array`);
      const ids = Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [];
      ids.forEach((id) => {
        if (typeof id !== 'string' || !availableEvidenceIds.has(id)) errors.push(`findings[${index}] cites unavailable evidence '${String(id)}'`);
      });
      if (finding.kind !== 'hypothesis' && ids.length === 0) errors.push(`findings[${index}] requires evidenceIds unless it is a hypothesis`);
      if (finding.confidence !== undefined && (typeof finding.confidence !== 'number' || !Number.isFinite(finding.confidence) || finding.confidence < 0 || finding.confidence > 1)) {
        errors.push(`findings[${index}].confidence must be a number in [0, 1]`);
      }
    });

    if (errors.length > 0) return { valid: false, errors };
    return {
      valid: true,
      value: {
        summary: candidate.summary as string,
        methods: (candidate.methods as unknown[]).filter((value): value is string => typeof value === 'string'),
        findings: findings.map((raw) => {
          const finding = raw as Record<string, unknown>;
          return {
            kind: finding.kind as ScientificFindingKind,
            statement: finding.statement as string,
            evidenceIds: (finding.evidenceIds as unknown[]).filter((id): id is string => typeof id === 'string'),
            confidence: typeof finding.confidence === 'number' ? finding.confidence : undefined,
          };
        }),
        limitations: (candidate.limitations as unknown[]).filter((value): value is string => typeof value === 'string'),
        unresolvedQuestions: (candidate.unresolvedQuestions as unknown[]).filter((value): value is string => typeof value === 'string'),
        recommendedNextActions: (candidate.recommendedNextActions as unknown[]).filter((value): value is string => typeof value === 'string'),
        confidence: confidence as number,
      },
    };
  }
}

export const globalSubagentOutputValidator = new SubagentOutputValidator();
