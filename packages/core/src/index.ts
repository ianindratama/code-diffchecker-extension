// Public API barrel for @dicodingacademy/code-diffchecker-core.
// Consumers (the VS Code extension and the CLI) import from here.

export * from './types';
export * from './constants';

export { loadConfig, hasConfigFile } from './config';

export { execGit } from './processManager';

export {
  resolveGitBinary,
  validateGitVersion,
  checkGitVersion,
  cloneSparse,
  checkForUpdates,
  pullUpdate,
  resetGitBinaryCache,
} from './gitService';

export {
  getCacheDir,
  isCacheValid,
  nukeCache,
  clearAllCaches,
  ensureStorageDir,
} from './cacheManager';

export { computeDiff, isFileBinary } from './diffEngine';
