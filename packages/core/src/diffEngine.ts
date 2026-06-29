import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { minimatch } from 'minimatch';
import { DiffResult } from './types';
import { HARDCODED_IGNORE_PATTERNS, BINARY_CHECK_BYTES } from './constants';

/**
 * Computes the diff between a student's local project and the cached solution.
 *
 * @param localRoot Absolute path to the student's workspace root.
 * @param solutionRoot Absolute path to the solution's target folder inside the cache.
 * @param configIgnorePatterns Ignore patterns from course-project.json.
 * @returns Array of DiffResult items (only added/modified/deleted — unchanged files are excluded).
 */
export async function computeDiff(
  localRoot: string,
  solutionRoot: string,
  configIgnorePatterns: string[]
): Promise<DiffResult[]> {
  // Merge hardcoded ignores with config-driven ignores
  const allIgnorePatterns = [...HARDCODED_IGNORE_PATTERNS, ...configIgnorePatterns];

  // Collect all file paths from both trees
  const localFiles = await walkDirectory(localRoot, localRoot, allIgnorePatterns);
  const solutionFiles = await walkDirectory(solutionRoot, solutionRoot, allIgnorePatterns);

  const localSet = new Set(localFiles);
  const solutionSet = new Set(solutionFiles);
  const allPaths = new Set([...localFiles, ...solutionFiles]);

  const results: DiffResult[] = [];

  for (const relativePath of allPaths) {
    const inLocal = localSet.has(relativePath);
    const inSolution = solutionSet.has(relativePath);

    const localAbsolute = path.join(localRoot, relativePath);
    const solutionAbsolute = path.join(solutionRoot, relativePath);

    if (inSolution && !inLocal) {
      // File exists only in solution → student needs to add it
      const isBinary = await isFileBinary(solutionAbsolute);
      results.push({
        relativePath,
        status: 'added',
        isBinary,
        solutionPath: solutionAbsolute,
      });
    } else if (inLocal && !inSolution) {
      // File exists only in local → student has extra file
      const isBinary = await isFileBinary(localAbsolute);
      results.push({
        relativePath,
        status: 'deleted',
        isBinary,
        localPath: localAbsolute,
      });
    } else if (inLocal && inSolution) {
      // File exists in both → check if content differs
      const isBinaryLocal = await isFileBinary(localAbsolute);
      const isBinarySolution = await isFileBinary(solutionAbsolute);
      const isBinary = isBinaryLocal || isBinarySolution;

      const isModified = await filesAreDifferent(localAbsolute, solutionAbsolute, isBinary);

      if (isModified) {
        results.push({
          relativePath,
          status: 'modified',
          isBinary,
          localPath: localAbsolute,
          solutionPath: solutionAbsolute,
        });
      }
      // Unchanged files are skipped
    }
  }

  // Sort by path for consistent ordering
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return results;
}

/**
 * Recursively walks a directory and returns all file paths relative to the root.
 * Filters out paths matching the ignore patterns.
 */
async function walkDirectory(
  dir: string,
  root: string,
  ignorePatterns: string[]
): Promise<string[]> {
  const files: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');

    // Check if this path should be ignored
    if (shouldIgnore(relativePath, entry.name, ignorePatterns)) {
      continue;
    }

    if (entry.isDirectory()) {
      const subFiles = await walkDirectory(fullPath, root, ignorePatterns);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * Checks if a path should be ignored based on the ignore patterns.
 */
function shouldIgnore(relativePath: string, name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Match against the relative path
    if (minimatch(relativePath, pattern, { dot: true })) {
      return true;
    }
    // Also match against just the filename/dirname
    if (minimatch(name, pattern, { dot: true })) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a file is binary by reading the first N bytes and looking for null bytes.
 */
export async function isFileBinary(filePath: string): Promise<boolean> {
  try {
    const fd = await fs.promises.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(BINARY_CHECK_BYTES);
      const { bytesRead } = await fd.read(buffer, 0, BINARY_CHECK_BYTES, 0);

      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) {
          return true;
        }
      }

      return false;
    } finally {
      await fd.close();
    }
  } catch {
    // If we can't read the file, assume it's not binary
    return false;
  }
}

/**
 * Compares two files to determine if they differ.
 * For text files, normalizes line endings (CRLF → LF) before comparison
 * to avoid false positives from Windows/Unix line ending differences.
 */
async function filesAreDifferent(fileA: string, fileB: string, isBinary: boolean): Promise<boolean> {
  try {
    if (isBinary) {
      // Binary files: raw byte comparison via MD5 hash
      const [hashA, hashB] = await Promise.all([
        computeFileHash(fileA),
        computeFileHash(fileB),
      ]);
      return hashA !== hashB;
    } else {
      // Text files: normalize line endings before comparison
      const [contentA, contentB] = await Promise.all([
        fs.promises.readFile(fileA, 'utf-8'),
        fs.promises.readFile(fileB, 'utf-8'),
      ]);
      const normalizedA = contentA.replace(/\r\n/g, '\n');
      const normalizedB = contentB.replace(/\r\n/g, '\n');
      return normalizedA !== normalizedB;
    }
  } catch {
    // If we can't read either file, assume they differ
    return true;
  }
}

/**
 * Computes the MD5 hash of a file (raw bytes, used for binary comparison).
 */
function computeFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
