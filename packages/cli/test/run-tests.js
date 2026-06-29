/**
 * Test runner: bundles each test file with esbuild, then runs it with node.
 * The CLI imports `@dicodingacademy/code-diffchecker-core`, which esbuild resolves
 * to the workspace-symlinked package (its `dist/` must be built beforehand).
 */
const esbuild = require('esbuild');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const { builtinModules } = require('module');

const packageRoot = path.resolve(__dirname, '..');

// Keep Node built-ins external so esbuild doesn't try to bundle them. `platform:'node'`
// covers most, but subpath builtins like `readline/promises` need to be listed explicitly.
const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'readline/promises',
];

const testFiles = [
  'test/init.test.ts',
  'test/config.test.ts',
  'test/diff.test.ts',
  'test/cache.test.ts',
];

const outDir = path.join(packageRoot, 'out/test-bundled');

// Ensure output directory exists
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  let allPassed = true;

  for (const testFile of testFiles) {
    const testName = path.basename(testFile, '.ts');
    const outFile = path.join(outDir, `${testName}.js`);

    // Bundle the test (CLI source + core + deps get inlined)
    try {
      await esbuild.build({
        entryPoints: [path.join(packageRoot, testFile)],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        outfile: outFile,
        external: nodeExternals,
        logLevel: 'error',
      });
    } catch (err) {
      console.error(`\n❌ Failed to bundle ${testFile}:`, err.message);
      allPassed = false;
      continue;
    }

    // Run the bundled test
    try {
      const output = execSync(`node "${outFile}"`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      console.log(output);
    } catch (err) {
      console.error(err.stdout || '');
      console.error(err.stderr || '');
      console.error(`\n❌ Test failed: ${testFile}`);
      allPassed = false;
    }
  }

  if (!allPassed) {
    process.exit(1);
  }

  console.log('\n🎉 All test suites passed!\n');
}

main();
