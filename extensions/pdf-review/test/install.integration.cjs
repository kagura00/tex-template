// 実CLI・空の拡張ディレクトリで、GitなしZIP相当からの自動導入を検証する。
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { install, sourceFiles } = require('../../../.devcontainer/install-pdf-review.cjs');
const exec = promisify(execFile);

(async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf review install '));
  const oldPath = process.env.PATH;
  try {
    const root = path.join(scratch, 'zip-source'), cache = path.join(scratch, 'cache'), extensionsDir = path.join(scratch, 'extensions');
    const original = path.resolve(__dirname, '..');
    for (const relative of await sourceFiles(original)) {
      await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      await fs.copyFile(path.join(original, relative), path.join(root, relative));
    }
    assert.equal(await fs.stat(path.join(root, '.git')).catch(() => null), null);
    assert.equal(await fs.stat(path.join(root, 'node_modules')).catch(() => null), null);
    let cli = process.env.REVIEW_CODE_CLI;
    if (!cli) {
      const sdk = require('@vscode/test-electron');
      const executable = await sdk.downloadAndUnzipVSCode('1.143.1');
      cli = sdk.resolveCliPathFromVSCodeExecutablePath(executable);
    }
    const cliArgs = ['--user-data-dir', path.join(scratch, 'user-data'), '--no-sandbox'];
    const options = { root, cache, extensionsDir, cli, cliArgs };
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    const id = `${manifest.publisher}.${manifest.name}`;
    async function installedCss() {
      const dir = (await fs.readdir(extensionsDir)).find(name => name.startsWith(`${id}-${manifest.version}`));
      assert.ok(dir, 'extension installed into the isolated remote extension directory');
      return fs.readFile(path.join(extensionsDir, dir, 'media/review.css'), 'utf8');
    }
    await install(options);
    assert.equal(await installedCss(), await fs.readFile(path.join(root, 'media/review.css'), 'utf8'));
    const stampFile = (await fs.readdir(cache)).find(name => name.startsWith('installed-'));
    const firstStamp = await fs.readFile(path.join(cache, stampFile), 'utf8');
    // 再接続・手動アンインストール後の再導入ではnpmのネット接続が不要。
    const bin = path.join(scratch, 'bin'), npmProbe = path.join(scratch, 'unexpected-npm');
    await fs.mkdir(bin);
    await fs.writeFile(path.join(bin, 'npm'), `#!/bin/sh\nprintf invoked > '${npmProbe}'\nexit 42\n`, { mode: 0o755 });
    process.env.PATH = bin + path.delimiter + oldPath;
    await install(options);
    assert.equal(await fs.readFile(path.join(cache, stampFile), 'utf8'), firstStamp);
    await exec(cli, [...cliArgs, '--extensions-dir', extensionsDir, '--uninstall-extension', id]);
    await install(options);
    assert.equal(await fs.stat(npmProbe).catch(() => null), null);
    assert.ok((await installedCss()).length > 0);
    process.env.PATH = oldPath;
    // 同一バージョンでもソースが変わった場合は実ファイルを更新する。
    const changed = (await installedCss()) + '\n/* source update probe */\n';
    await fs.writeFile(path.join(root, 'media/review.css'), changed);
    await install(options);
    assert.equal(await installedCss(), changed);
    assert.notEqual(await fs.readFile(path.join(cache, stampFile), 'utf8'), firstStamp);
    // インストールの失敗を成功扱いしない。
    const failing = path.join(bin, 'failing-code');
    await fs.writeFile(failing, '#!/bin/sh\nfor arg in "$@"; do if [ "$arg" = "--install-extension" ]; then exit 17; fi; done\nexit 0\n', { mode: 0o755 });
    await assert.rejects(install({ ...options, cli: failing }), /17/);
    assert.equal(await fs.stat(path.join(root, 'node_modules')).catch(() => null), null);
    assert.equal(await fs.stat(path.join(root, 'dist')).catch(() => null), null);
    console.log('PASS: real VS Code CLI cold install from ZIP-only sources, reconnect without npm, cached recovery after uninstall, same-version source update, failure propagation, and no workspace build residue.');
  } finally {
    process.env.PATH = oldPath;
    await fs.rm(scratch, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
