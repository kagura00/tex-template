// VS Code Serverの起動後に、未公開VSIXを構築してコンテナ側へ導入する。
// Gitやワークスペース内のnode_modules、生成済みVSIXには依存しない。
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const extensionRoot = path.resolve(__dirname, '../extensions/pdf-review');
const inputs = ['package.json', 'package-lock.json', 'README.md', 'LICENSE', '.vscodeignore', 'scripts/prepare.cjs', 'src', 'media/review.mjs', 'media/review.css'];

async function sourceFiles(root) {
  const files = [];
  async function visit(relative) {
    const stat = await fs.lstat(path.join(root, relative));
    if (stat.isSymbolicLink()) throw new Error(`拡張の入力にシンボリックリンクは使用できません: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(path.join(root, relative))).sort()) await visit(path.join(relative, name));
    } else if (stat.isFile()) files.push(relative);
    else throw new Error(`拡張の入力が通常ファイルではありません: ${relative}`);
  }
  for (const input of inputs) await visit(input);
  return files;
}

async function fingerprint(root, files) {
  const hash = crypto.createHash('sha256');
  for (const relative of files) hash.update(relative.split(path.sep).join('/') + '\0').update(await fs.readFile(path.join(root, relative))).update('\0');
  return hash.digest('hex');
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, timeout: 180000, ...options });
    let stdout = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(`${path.basename(command)} が終了コード ${code} で失敗しました。`)));
  });
}

async function cliCandidates() {
  const candidates = [];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (dir) candidates.push(path.join(dir, 'code'), path.join(dir, 'code-insiders'));
  }
  // 通常はPATH上の公式remote CLIを利用。ライフサイクル環境にPATHが
  // 渡らない場合には、インストール済み公式VS Code ServerのCLIを利用する。
  const roots = [process.env.VSCODE_AGENT_FOLDER, path.join(os.homedir(), '.vscode-server'), path.join(os.homedir(), '.vscode-server-insiders')].filter(Boolean);
  const servers = [];
  for (const root of roots) {
    for (const [base, suffix] of [[path.join(root, 'bin'), ['bin', 'code-server']], [path.join(root, 'cli/servers'), ['server', 'bin', 'code-server']]]) {
      for (const name of await fs.readdir(base).catch(() => [])) {
        const file = path.join(base, name, ...suffix);
        const stat = await fs.stat(file).catch(() => null);
        if (stat?.isFile()) servers.push({ file, modified: stat.mtimeMs });
      }
    }
  }
  return [...new Set([...candidates, ...servers.sort((a, b) => b.modified - a.modified).map(s => s.file)])];
}

async function install({ root = extensionRoot, cache = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'tex-template-pdf-review'), cli, cliArgs = [], extensionsDir } = {}) {
  const files = await sourceFiles(root), digest = await fingerprint(root, files);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const id = `${manifest.publisher}.${manifest.name}`, expected = `${id}@${manifest.version}`;
  const targetArgs = [...cliArgs, ...(extensionsDir ? ['--extensions-dir', extensionsDir] : [])];
  let installed;
  for (const candidate of cli ? [cli] : await cliCandidates()) {
    try {
      installed = await run(candidate, [...targetArgs, '--list-extensions', '--show-versions'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000 });
      cli = candidate; break;
    } catch { /* PATH上の非CLIや終了済みServerは飛ばす。 */ }
  }
  if (installed === undefined) throw new Error('VS CodeのCLIが見つかりません。コンテナ接続後に再実行してください。');
  const target = crypto.createHash('sha256').update(extensionsDir || 'default').digest('hex').slice(0, 16);
  const stampFile = path.join(cache, `installed-${target}.json`);
  const stamp = await fs.readFile(stampFile, 'utf8').then(JSON.parse).catch(() => null);
  const present = () => installed.split(/\r?\n/).some(line => line.trim().toLowerCase() === expected.toLowerCase());
  if (stamp?.digest === digest && present()) {
    console.log(`PDFレビュー: ${expected} は導入済みです。`); return;
  }
  await fs.mkdir(cache, { recursive: true });
  const vsix = path.join(cache, `${digest}.vsix`);
  if (!await fs.stat(vsix).then(s => s.isFile() && s.size > 0).catch(() => false)) {
    const build = await fs.mkdtemp(path.join(cache, 'build-'));
    try {
      for (const relative of files) {
        const dest = path.join(build, relative);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(path.join(root, relative), dest);
      }
      console.log('PDFレビュー: 固定依存から初回のVSIXを作成しています。');
      await run('npm', ['ci', '--ignore-scripts', '--no-fund'], { cwd: build, stdio: 'inherit', timeout: 600000 });
      await run('npm', ['run', 'package'], { cwd: build, stdio: 'inherit' });
      // ビルド完了後にだけキャッシュとして公開する。
      await fs.rename(path.join(build, 'dist/tex-template-pdf-review.vsix'), vsix);
    } finally { await fs.rm(build, { recursive: true, force: true }); }
  }
  await run(cli, [...targetArgs, '--install-extension', vsix, '--force'], { stdio: 'inherit' });
  installed = await run(cli, [...targetArgs, '--list-extensions', '--show-versions'], { stdio: ['ignore', 'pipe', 'inherit'] });
  if (!present()) throw new Error(`${expected} の導入完了を確認できませんでした。`);
  await fs.writeFile(stampFile, JSON.stringify({ digest, id, version: manifest.version }) + '\n');
  console.log(`PDFレビュー: ${expected} の自動導入が完了しました。`);
}

if (require.main === module) {
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = { '--code-cli': 'cli', '--extensions-dir': 'extensionsDir' }[process.argv[i]];
    if (!key || !process.argv[i + 1]) throw new Error('引数は --code-cli PATH / --extensions-dir DIR を使用してください。');
    options[key] = process.argv[i + 1];
  }
  install(options).catch(error => {
    console.error(`PDFレビューの自動導入に失敗しました: ${error.message}\nコンテナ接続後、node .devcontainer/install-pdf-review.cjs で再試行できます。`);
    process.exitCode = 1;
  });
}
module.exports = { sourceFiles, fingerprint, install };
