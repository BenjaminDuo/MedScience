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
  const utility = process.platform === 'darwin' ? 'sandbox-exec' : process.platform === 'linux' ? 'bwrap' : undefined;
  if (!utility) return false;
  try {
    execSync(`command -v ${utility}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
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
