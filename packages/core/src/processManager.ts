import * as cp from 'child_process';
import * as os from 'os';
import { ExecResult, ExecOptions } from './types';
import { GIT_CLONE_TIMEOUT_MS } from './constants';

/**
 * Cross-platform child_process wrapper for Git commands.
 * Handles timeouts and process termination correctly on both Windows and POSIX.
 */
export function execGit(
  gitBinary: string,
  args: string[],
  cwd: string,
  options?: ExecOptions
): Promise<ExecResult> {
  const timeoutMs = options?.timeoutMs ?? GIT_CLONE_TIMEOUT_MS;

  return new Promise<ExecResult>((resolve, reject) => {
    // Normalize the cwd path to forward slashes for Git compatibility
    const normalizedCwd = cwd.replace(/\\/g, '/');

    const isWindows = os.platform() === 'win32';

    const child = cp.spawn(gitBinary, args, {
      cwd: normalizedCwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Use shell on Windows to handle .cmd/.bat shims
      shell: isWindows,
      // Prevent the child window from appearing on Windows
      windowsHide: true,
      // On POSIX, create a new process group so we can kill the entire tree on timeout
      detached: !isWindows,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Set up timeout
    const timer = setTimeout(() => {
      killed = true;
      killProcess(child.pid);
      reject(
        new Error(
          `Git command timed out after ${timeoutMs / 1000}s.\n` +
          `Command: git ${args.join(' ')}\n` +
          'This usually means a network issue. Please check your internet connection and try again.'
        )
      );
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to execute Git command.\n` +
          `Command: git ${args.join(' ')}\n` +
          `Error: ${err.message}\n` +
          'Make sure Git is installed and accessible from your PATH.'
        )
      );
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      if (killed) {
        return; // Already rejected via timeout
      }
      resolve({ stdout, stderr, exitCode });
    });
  });
}

/**
 * Kill a process cross-platform.
 * On Windows, uses taskkill to properly terminate the process tree.
 * On POSIX, uses SIGTERM.
 */
function killProcess(pid: number | undefined): void {
  if (pid === undefined) {
    return;
  }

  try {
    if (os.platform() === 'win32') {
      // Windows: use taskkill to kill the entire process tree
      cp.exec(`taskkill /pid ${pid} /T /F`, { windowsHide: true });
    } else {
      // POSIX: send SIGTERM to the entire process group (negative PID)
      process.kill(-pid, 'SIGTERM');
    }
  } catch {
    // Process may have already exited — ignore errors
  }
}
