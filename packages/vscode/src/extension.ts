import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  loadConfig, hasConfigFile, checkGitVersion, cloneSparse, checkForUpdates, pullUpdate,
  getCacheDir, isCacheValid, nukeCache, clearAllCaches, ensureStorageDir,
  computeDiff, isFileBinary, CourseProjectConfig,
} from '@dicodingacademy/code-diffchecker-core';
import { resolveGitBinary } from './gitBinary';
import { DiffTreeViewProvider } from './treeViewProvider';

/** Output channel for logging. */
let outputChannel: vscode.OutputChannel;

/** File watcher state — activated after first successful fetch. */
interface FileWatcherState {
  watcher: vscode.FileSystemWatcher;
  saveListener: vscode.Disposable;
  debounceTimer: NodeJS.Timeout | undefined;
  workspaceRoot: string;
  cacheDir: string;
  config: CourseProjectConfig;
  treeProvider: DiffTreeViewProvider;
  treeView: vscode.TreeView<import('./treeViewProvider').DiffTreeItem>;
}
let activeWatcher: FileWatcherState | undefined;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Code Diff-Checker');
  context.subscriptions.push(outputChannel);

  log('Extension activating...');

  // Create TreeView provider
  const treeProvider = new DiffTreeViewProvider();
  const treeView = vscode.window.createTreeView('codeDiffCheckerTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Get workspace root
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    log('No workspace folder open.');
    return;
  }

  // Check for config file
  if (!hasConfigFile(workspaceRoot)) {
    log('No course-project.json found. Extension is idle.');
    return;
  }

  const globalStoragePath = context.globalStorageUri.fsPath;

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('codeDiffChecker.fetchSolution', () =>
      fetchSolutionCommand(context, workspaceRoot, globalStoragePath, treeProvider, treeView)
    ),
    vscode.commands.registerCommand('codeDiffChecker.refreshDiff', () =>
      refreshDiffCommand(workspaceRoot, globalStoragePath, treeProvider, treeView)
    ),
    vscode.commands.registerCommand('codeDiffChecker.clearCache', () =>
      clearCacheCommand(globalStoragePath, treeProvider)
    ),
    vscode.commands.registerCommand('codeDiffChecker.compareCurrentFile', () =>
      compareCurrentFileCommand(workspaceRoot, globalStoragePath)
    )
  );

  // Register internal menu command for the status bar button
  context.subscriptions.push(
    vscode.commands.registerCommand('codeDiffChecker.showMenu', async () => {
      const choice = await vscode.window.showQuickPick(
        [
          { label: '$(cloud-download) Fetch Solution', description: 'Compare all files in the project', value: 'fetch' },
          { label: '$(diff) Compare Current File', description: 'Compare the active file with solution', value: 'compare' },
        ],
        { placeHolder: 'Code Diff-Checker: What do you want to do?' }
      );

      if (choice?.value === 'fetch') {
        vscode.commands.executeCommand('codeDiffChecker.fetchSolution');
      } else if (choice?.value === 'compare') {
        vscode.commands.executeCommand('codeDiffChecker.compareCurrentFile');
      }
    })
  );

  // Create single status bar button (right side)
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(beaker) Diff-Checker';
  statusBarItem.tooltip = 'Code Diff-Checker: Compare your project with the solution';
  statusBarItem.command = 'codeDiffChecker.showMenu';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Auto-load: if cache exists, compute diff immediately
  autoLoadOnActivation(context, workspaceRoot, globalStoragePath, treeProvider, treeView);
}

export function deactivate() {
  // No cleanup needed — cache persists
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/**
 * Fetch Solution command: clone the remote repo (or update if cache exists)
 * and compute the diff.
 */
async function fetchSolutionCommand(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  globalStoragePath: string,
  treeProvider: DiffTreeViewProvider,
  treeView: vscode.TreeView<import('./treeViewProvider').DiffTreeItem>
): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Code Diff-Checker',
      cancellable: false,
    },
    async (progress) => {
      try {
        // Step 1: Load config
        progress.report({ message: 'Reading configuration...' });
        const config = await loadConfig(workspaceRoot);
        log(`Config loaded: ${config.repoUrl} @ ${config.branch}${config.targetFolder ? ' → ' + config.targetFolder : ' (flat repo)'}`);

        // Step 2: Resolve and validate Git
        progress.report({ message: 'Checking Git installation...' });
        const gitBinary = await resolveGitBinary();
        const version = await checkGitVersion(gitBinary);
        log(`Git found: ${version}`);

        // Step 3: Ensure storage directory
        await ensureStorageDir(globalStoragePath);
        const cacheDir = getCacheDir(globalStoragePath, config);

        // Step 4: Clone or update
        if (isCacheValid(cacheDir, config.targetFolder)) {
          progress.report({ message: 'Checking for updates...' });
          const hasUpdates = await checkForUpdates(gitBinary, cacheDir, config.branch);

          if (hasUpdates) {
            progress.report({ message: 'Updating solution...' });
            try {
              await pullUpdate(gitBinary, cacheDir, config.branch);
              log('Solution updated via pull.');
            } catch {
              // Pull failed — nuke and re-clone
              log('Pull failed, performing fresh clone.');
              await nukeCache(cacheDir);
              progress.report({ message: 'Downloading solution (fresh)...' });
              await cloneSparse(gitBinary, config.repoUrl, config.branch, config.targetFolder, cacheDir);
              log('Fresh clone completed.');
            }
          } else {
            log('Solution is already up to date.');
          }
        } else {
          // Fresh clone
          await nukeCache(cacheDir); // Clean up any partial state
          progress.report({ message: 'Downloading solution...' });
          await cloneSparse(gitBinary, config.repoUrl, config.branch, config.targetFolder, cacheDir);
          log('Clone completed.');
        }

        // Step 5: Compute diff
        progress.report({ message: 'Computing differences...' });
        await computeAndDisplayDiff(workspaceRoot, cacheDir, config, treeProvider, treeView);

        vscode.window.showInformationMessage(
          `Code Diff-Checker: Found ${treeProvider.diffCount} difference(s).`
        );

        // Auto-reveal the sidebar TreeView
        await vscode.commands.executeCommand('codeDiffCheckerTree.focus');

        // Start real-time file watching
        startFileWatcher(context, workspaceRoot, cacheDir, config, treeProvider, treeView);
      } catch (err) {
        handleError(err);
      }
    }
  );
}

/**
 * Refresh Diff command: re-compute diff from existing cache (no network).
 */
async function refreshDiffCommand(
  workspaceRoot: string,
  globalStoragePath: string,
  treeProvider: DiffTreeViewProvider,
  treeView: vscode.TreeView<import('./treeViewProvider').DiffTreeItem>
): Promise<void> {
  try {
    const config = await loadConfig(workspaceRoot);
    const cacheDir = getCacheDir(globalStoragePath, config);

    if (!isCacheValid(cacheDir, config.targetFolder)) {
      vscode.window.showWarningMessage(
        'No solution cached yet. Please run "Fetch Solution" first.',
        'Fetch Solution'
      ).then((choice) => {
        if (choice === 'Fetch Solution') {
          vscode.commands.executeCommand('codeDiffChecker.fetchSolution');
        }
      });
      return;
    }

    await computeAndDisplayDiff(workspaceRoot, cacheDir, config, treeProvider, treeView);

    vscode.window.showInformationMessage(
      `Code Diff-Checker: Found ${treeProvider.diffCount} difference(s).`
    );
  } catch (err) {
    handleError(err);
  }
}

/**
 * Clear Cache command: delete all cached solutions.
 */
async function clearCacheCommand(
  globalStoragePath: string,
  treeProvider: DiffTreeViewProvider
): Promise<void> {
  const answer = await vscode.window.showWarningMessage(
    'Are you sure you want to clear the solution cache? You will need to re-fetch.',
    { modal: true },
    'Clear Cache'
  );

  if (answer === 'Clear Cache') {
    stopFileWatcher();
    await clearAllCaches(globalStoragePath);
    treeProvider.clear();
    vscode.window.showInformationMessage('Code Diff-Checker: Cache cleared.');
    log('Cache cleared.');
  }
}

/**
 * Compare Current File command: compare just the active editor file against the solution.
 * Auto-fetches the solution if not cached yet.
 */
async function compareCurrentFileCommand(
  workspaceRoot: string,
  globalStoragePath: string
): Promise<void> {
  // Check if there's an active editor
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Code Diff-Checker: Please open a file first.');
    return;
  }

  const fileUri = editor.document.uri;

  // Only handle file:// scheme
  if (fileUri.scheme !== 'file') {
    vscode.window.showWarningMessage('Code Diff-Checker: This command only works with local files.');
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Code Diff-Checker',
      cancellable: false,
    },
    async (progress) => {
      try {
        // Step 1: Load config
        progress.report({ message: 'Reading configuration...' });
        const config = await loadConfig(workspaceRoot);

        // Step 2: Resolve and validate Git
        progress.report({ message: 'Checking Git installation...' });
        const gitBinary = await resolveGitBinary();
        await checkGitVersion(gitBinary);

        // Step 3: Ensure cache
        await ensureStorageDir(globalStoragePath);
        const cacheDir = getCacheDir(globalStoragePath, config);

        if (!isCacheValid(cacheDir, config.targetFolder)) {
          // Auto-fetch: clone the solution first
          progress.report({ message: 'Downloading solution...' });
          await nukeCache(cacheDir);
          await cloneSparse(gitBinary, config.repoUrl, config.branch, config.targetFolder, cacheDir);
          log('Clone completed (triggered by Compare Current File).');
        }

        // Step 4: Compute relative path of the active file
        const localAbsolute = fileUri.fsPath;
        const relativePath = path.relative(workspaceRoot, localAbsolute).replace(/\\/g, '/');

        // Step 5: Find the corresponding solution file
        const solutionRoot = config.targetFolder ? path.join(cacheDir, config.targetFolder) : cacheDir;
        const solutionAbsolute = path.join(solutionRoot, relativePath);
        const solutionUri = vscode.Uri.file(solutionAbsolute);

        const localExists = fs.existsSync(localAbsolute);
        const solutionExists = fs.existsSync(solutionAbsolute);

        if (!solutionExists && localExists) {
          vscode.window.showInformationMessage(
            `Code Diff-Checker: "${path.basename(relativePath)}" doesn't exist in the solution. This is an extra file in your project.`
          );
          return;
        }

        // Check if binary
        const isBinaryFile = localExists
          ? await isFileBinary(localAbsolute)
          : await isFileBinary(solutionAbsolute);

        if (isBinaryFile) {
          vscode.window.showWarningMessage(
            `Code Diff-Checker: "${path.basename(relativePath)}" is a binary file and cannot be compared.`
          );
          return;
        }

        // Check if identical (normalize line endings for cross-platform comparison)
        if (localExists && solutionExists) {
          const localContent = (await fs.promises.readFile(localAbsolute, 'utf-8')).replace(/\r\n/g, '\n');
          const solutionContent = (await fs.promises.readFile(solutionAbsolute, 'utf-8')).replace(/\r\n/g, '\n');
          if (localContent === solutionContent) {
            vscode.window.showInformationMessage(
              `Code Diff-Checker: "${path.basename(relativePath)}" matches the solution! ✅`
            );
            return;
          }
        }

        // Step 6: Open the diff editor
        const leftUri = localExists ? fileUri : vscode.Uri.parse('untitled:empty');
        const rightUri = solutionExists ? solutionUri : vscode.Uri.parse('untitled:empty');
        const filename = path.basename(relativePath);
        const title = `${filename} (Student ↔ Solution)`;

        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
      } catch (err) {
        handleError(err);
      }
    }
  );
}

// ─── Auto-Load ────────────────────────────────────────────────────────────────

/**
 * On activation, if cache exists, load the diff immediately.
 * Also check for updates in the background.
 */
async function autoLoadOnActivation(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  globalStoragePath: string,
  treeProvider: DiffTreeViewProvider,
  treeView: vscode.TreeView<import('./treeViewProvider').DiffTreeItem>
): Promise<void> {
  try {
    const config = await loadConfig(workspaceRoot);
    const cacheDir = getCacheDir(globalStoragePath, config);

    if (isCacheValid(cacheDir, config.targetFolder)) {
      // Compute and show diff immediately
      await computeAndDisplayDiff(workspaceRoot, cacheDir, config, treeProvider, treeView);
      log(`Auto-loaded diff: ${treeProvider.diffCount} difference(s).`);

      // Start real-time file watching
      startFileWatcher(context, workspaceRoot, cacheDir, config, treeProvider, treeView);

      // Background: check for updates
      backgroundUpdateCheck(cacheDir, config);
    }
  } catch (err) {
    // Non-fatal on activation — just log
    log(`Auto-load skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Silently checks for updates in the background and shows a toast if behind.
 */
async function backgroundUpdateCheck(
  cacheDir: string,
  config: CourseProjectConfig
): Promise<void> {
  try {
    const gitBinary = await resolveGitBinary();
    const hasUpdates = await checkForUpdates(gitBinary, cacheDir, config.branch);

    if (hasUpdates) {
      const choice = await vscode.window.showInformationMessage(
        'A newer version of the solution is available.',
        'Update Now',
        'Dismiss'
      );

      if (choice === 'Update Now') {
        vscode.commands.executeCommand('codeDiffChecker.fetchSolution');
      }
    }
  } catch {
    // Silent — don't bother the student if the background check fails
  }
}

// ─── File Watcher ─────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;

/**
 * Starts (or restarts) a FileSystemWatcher on the workspace.
 * On any file create/change/delete, debounces 300ms then re-computes the full diff.
 */
function startFileWatcher(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  cacheDir: string,
  config: CourseProjectConfig,
  treeProvider: DiffTreeViewProvider,
  treeView: vscode.TreeView<import('./treeViewProvider').DiffTreeItem>
): void {
  // Don't create duplicate watchers
  if (activeWatcher) {
    stopFileWatcher();
  }

  const pattern = new vscode.RelativePattern(workspaceRoot, '**/*');
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  const state: FileWatcherState = {
    watcher,
    saveListener: undefined!,  // assigned below
    debounceTimer: undefined,
    workspaceRoot,
    cacheDir,
    config,
    treeProvider,
    treeView,
  };

  const debouncedRefresh = () => {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }
    state.debounceTimer = setTimeout(async () => {
      try {
        await computeAndDisplayDiff(
          state.workspaceRoot,
          state.cacheDir,
          state.config,
          state.treeProvider,
          state.treeView
        );
        log(`File watcher: refreshed diff (${state.treeProvider.diffCount} differences).`);
      } catch (err) {
        log(`File watcher refresh error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, DEBOUNCE_MS);
  };

  // FileSystemWatcher: catches file create/delete and external changes
  watcher.onDidChange((uri) => {
    log(`File watcher event: onDidChange → ${uri.fsPath}`);
    debouncedRefresh();
  });
  watcher.onDidCreate((uri) => {
    log(`File watcher event: onDidCreate → ${uri.fsPath}`);
    debouncedRefresh();
  });
  watcher.onDidDelete((uri) => {
    log(`File watcher event: onDidDelete → ${uri.fsPath}`);
    debouncedRefresh();
  });

  // onDidSaveTextDocument: reliably catches in-editor saves (content modifications)
  // No path filter needed — debounce handles performance
  const saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
    log(`File watcher event: onDidSave → ${doc.uri.fsPath}`);
    debouncedRefresh();
  });
  state.saveListener = saveListener;

  context.subscriptions.push(watcher, saveListener);
  activeWatcher = state;
  log('File watcher started.');
}

/**
 * Stops the active file watcher if one exists.
 */
function stopFileWatcher(): void {
  if (activeWatcher) {
    if (activeWatcher.debounceTimer) {
      clearTimeout(activeWatcher.debounceTimer);
    }
    activeWatcher.watcher.dispose();
    activeWatcher.saveListener.dispose();
    activeWatcher = undefined;
    log('File watcher stopped.');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Computes the diff and updates the TreeView.
 */
async function computeAndDisplayDiff(
  workspaceRoot: string,
  cacheDir: string,
  config: CourseProjectConfig,
  treeProvider: DiffTreeViewProvider,
  treeView: vscode.TreeView<import('./treeViewProvider').DiffTreeItem>
): Promise<void> {
  const solutionRoot = config.targetFolder ? path.join(cacheDir, config.targetFolder) : cacheDir;
  const diffResults = await computeDiff(workspaceRoot, solutionRoot, config.ignorePaths);
  treeProvider.refresh(diffResults);

  // Update TreeView title with count
  treeView.title = `Solution Diff (${diffResults.length})`;
}

/**
 * Returns the first workspace folder's path, or undefined.
 */
function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0].uri.fsPath;
}

/**
 * Handles errors with user-facing messages.
 */
function handleError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  log(`ERROR: ${message}`);
  vscode.window.showErrorMessage(`Code Diff-Checker: ${message}`);
}

/**
 * Logs a message to the output channel.
 */
function log(message: string): void {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] ${message}`);
}
