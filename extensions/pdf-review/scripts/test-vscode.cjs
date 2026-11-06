const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { runTests } = require('@vscode/test-electron');

(async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-review-vscode-'));
  try {
    await runTests({
      version: '1.143.1',
      ...(process.env.VSCODE_EXECUTABLE_PATH ? { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH } : {}),
      extensionDevelopmentPath: path.resolve(__dirname, '..'),
      extensionTestsPath: path.resolve(__dirname, '../test/vscode-suite.cjs'),
      extensionTestsEnv: { REVIEW_VSCODE_FIXTURES: scratch },
      launchArgs: [scratch, '--user-data-dir', path.join(scratch, 'user-data'), '--extensions-dir', path.join(scratch, 'extensions'), '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--no-sandbox']
    });
  } finally { await fs.rm(scratch, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
