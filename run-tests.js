/**
 * Test runner script that bundles and runs tests with esbuild,
 * replacing the 'vscode' module with a mock.
 */
const esbuild = require('esbuild');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

const testFiles = [
  'src/test/config.test.ts',
  'src/test/gitService.test.ts',
  'src/test/diffEngine.test.ts',
];

const mockPath = path.resolve(__dirname, 'src/test/__mocks__/vscode.js');
const outDir = path.resolve(__dirname, 'out/test-bundled');

// Ensure output directory exists
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  let allPassed = true;

  for (const testFile of testFiles) {
    const testName = path.basename(testFile, '.ts');
    const outFile = path.join(outDir, `${testName}.js`);

    // Bundle the test with vscode mock
    try {
      await esbuild.build({
        entryPoints: [testFile],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        outfile: outFile,
        // Replace 'vscode' import with our mock
        alias: {
          'vscode': mockPath,
        },
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
