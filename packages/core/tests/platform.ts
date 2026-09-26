import fs from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Platform facts the suite has to respect rather than assume away.
 *
 * These tests were written on macOS and quietly encoded it: a fake runtime
 * was an extension-less file with mode 0o755, and sandboxed Python was taken
 * for granted. Both are correct product behaviour to reject elsewhere --
 * ExecutionProfileManager requires .exe/.cmd/.bat on Windows, and
 * PythonRunnerTool fails closed when the platform's sandbox utility is
 * missing -- so the tests, not the product, are what needed fixing when CI
 * started running on Linux and Windows.
 */
export const isWindows = process.platform === 'win32';

/** A file the platform will actually accept as a runnable executable. */
export function writeFakeExecutable(filePath: string): string {
  if (isWindows) {
    const withExt = `${filePath}.cmd`;
    fs.writeFileSync(withExt, '@echo off\r\necho fake\r\n');
    return withExt;
  }
  fs.writeFileSync(filePath, '#!/bin/sh\necho fake\n', { mode: 0o755 });
  return filePath;
}

/**
 * Whether this machine can actually run the kernel sandbox PythonRunnerTool
 * insists on. macOS ships sandbox-exec; Linux needs bubblewrap installed;
 * Windows has no equivalent, so the tool refuses there by design.
 */
export function hasKernelSandbox(): boolean {
  // Probing beats checking the binary exists: Ubuntu 24.04 ships bwrap but
  // restricts unprivileged user namespaces through AppArmor, so `which bwrap`
  // says yes on a machine where every sandboxed run fails. CI hit exactly
  // that and reported a sandbox mode it could not actually enter.
  try {
    if (process.platform === 'darwin') {
      execSync('sandbox-exec -p "(version 1)(allow default)" /usr/bin/true', { stdio: 'ignore' });
      return true;
    }
    if (process.platform === 'linux') {
      execSync('bwrap --ro-bind / / --dev /dev /bin/true', { stdio: 'ignore' });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Whether this platform can spawn the Node-script fixtures the runtime tests
 * use as a stand-in for the codex binary.
 *
 * Node refuses to spawn a .cmd/.bat without a shell (CVE-2024-27980), and
 * ChildProcessSupervisor deliberately does not pass shell: true, so on
 * Windows there is no way to stand a Node script in for the executable. A
 * real Windows deployment uses codex.exe; the protocol behaviour these tests
 * cover has no platform component.
 */
export function canSpawnScriptAsRuntime(): boolean {
  return !isWindows;
}

/**
 * A path the platform will spawn that runs the given Node script.
 *
 * POSIX can execute the .mjs fixture directly (shebang + exec bit); Windows
 * cannot, and ExecutionProfileManager rightly refuses a .mjs as a runtime
 * executable, so a .cmd shim that shells out to node stands in for it. The
 * fixture itself is still the thing under test either way.
 */
export function spawnableScript(scriptPath: string, shimDir: string): string {
  if (!isWindows) return scriptPath;
  const shim = `${shimDir.replace(/[\\/]+$/, '')}\\fake-codex-app-server.cmd`;
  fs.writeFileSync(shim, `@echo off\r\nnode "${scriptPath}" %*\r\n`);
  return shim;
}
