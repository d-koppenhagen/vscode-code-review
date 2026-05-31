import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Remove ELECTRON_RUN_AS_NODE from the environment, otherwise Code.exe
    // starts in Node.js mode and rejects all VS Code / Electron CLI flags.
    delete process.env.ELECTRON_RUN_AS_NODE;

    await runTests({ extensionDevelopmentPath, extensionTestsPath, version: '1.95.0' });
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
