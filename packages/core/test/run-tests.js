/**
 * Test runner: bundles each test file with esbuild, then runs it with node.
 * Core is editor-agnostic (no `vscode` imports), so no module alias is needed.
 */
const esbuild = require('esbuild');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

const packageRoot = path.resolve(__dirname, '..');

const testFiles = [
  'test/config.test.ts',
  'test/gitService.test.ts',
  'test/diffEngine.test.ts',
];

const outDir = path.join(packageRoot, 'out/test-bundled');

// Ensure output directory exists
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  let allPassed = true;

  for (const testFile of testFiles) {
    const testName = path.basename(testFile, '.ts');
    const outFile = path.join(outDir, `${testName}.js`);

    // Bundle the test (core + minimatch get inlined)
    try {
      await esbuild.build({
        entryPoints: [path.join(packageRoot, testFile)],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        outfile: outFile,
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
