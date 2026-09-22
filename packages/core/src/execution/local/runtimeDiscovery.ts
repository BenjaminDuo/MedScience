import { LocalRuntimeKind } from '../../types/runtime.js';
import { RuntimeProbeResult } from '../types.js';
import { globalRuntimeDetector } from './RuntimeDetector.js';
import { globalGenericRuntimeDetector } from './GenericRuntimeDetector.js';
import { LOCAL_RUNTIME_CATALOG, findRuntimeSpec } from './runtimeCatalog.js';
import { globalExecutionProfileManager } from '../../config/ExecutionProfileManager.js';
import { LocalRuntimeExecutionProfile } from '../types.js';

/**
 * The single place that combines Codex's own detector (RuntimeDetector.ts,
 * pre-existing/tested) with the newer catalog-driven detector
 * (GenericRuntimeDetector.ts + runtimeCatalog.ts) into one "every local
 * runtime MedScience knows how to discover and bind" view. Both the
 * Electron IPC layer (runtimeIpc.ts) and the web/HTTP layer (server.ts)
 * call these two functions so detection and bind-a-profile logic isn't
 * duplicated (and can't drift) between the two hosts.
 */

export interface DiscoverableRuntime {
  runtime: LocalRuntimeKind;
  displayName: string;
  isolationConfidence: 'confirmed' | 'best-effort' | 'none';
  isolationNote: string;
  probe: RuntimeProbeResult;
}

const CODEX_ISOLATION_NOTE =
  'Uses a per-session CODEX_HOME directory so MedScience-driven conversations never appear in your personal Codex app or `codex resume` history, and vice versa.';

export async function discoverAllRuntimes(): Promise<DiscoverableRuntime[]> {
  const codexEntry: DiscoverableRuntime = {
    runtime: 'codex',
    displayName: 'Codex',
    isolationConfidence: 'confirmed',
    isolationNote: CODEX_ISOLATION_NOTE,
    probe: await globalRuntimeDetector.probe(),
  };

  // probeMany forks the login shell at most once for every catalog runtime
  // that misses a bare PATH lookup, instead of once per tool -- see
  // GenericRuntimeDetector.resolveManyFromLoginShell's doc comment (ported
  // from Multica's own batched startup/periodic probe, as opposed to its
  // one-name-per-call single-tool re-probe).
  const probes = await globalGenericRuntimeDetector.probeMany(LOCAL_RUNTIME_CATALOG);
  const catalogEntries: DiscoverableRuntime[] = LOCAL_RUNTIME_CATALOG.map((spec, i) => ({
    runtime: spec.runtime,
    displayName: spec.displayName,
    isolationConfidence: spec.isolationConfidence,
    isolationNote: spec.isolationNote,
    probe: probes[i],
  }));

  return [codexEntry, ...catalogEntries];
}

export interface BindRuntimeResult {
  success: boolean;
  profile?: LocalRuntimeExecutionProfile;
  errors?: string[];
  probe?: RuntimeProbeResult;
}

export async function bindLocalRuntime(runtime: LocalRuntimeKind, executablePath?: string): Promise<BindRuntimeResult> {
  let probe: RuntimeProbeResult;
  if (runtime === 'codex') {
    probe = await globalRuntimeDetector.probe(executablePath);
  } else {
    const spec = findRuntimeSpec(runtime);
    if (!spec) {
      return { success: false, errors: [`Unknown local runtime "${runtime}".`] };
    }
    probe = await globalGenericRuntimeDetector.probe(spec, executablePath);
  }

  if (!probe.available || !probe.executablePath) {
    return { success: false, errors: [probe.message || `${runtime} was not found on this machine.`], probe };
  }

  const profile = globalExecutionProfileManager.createDefaultLocalRuntimeProfile({
    runtime,
    executablePath: probe.executablePath,
  });
  const saveResult = globalExecutionProfileManager.saveProfile(profile);
  return {
    success: saveResult.success,
    profile: saveResult.profile as LocalRuntimeExecutionProfile | undefined,
    errors: saveResult.errors,
    probe,
  };
}
