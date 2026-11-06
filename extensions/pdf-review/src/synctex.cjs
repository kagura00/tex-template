const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const model = require('./model.cjs');
const exec = promisify(execFile);
const PREFIX = '/__pdf_review__/';

function within(root, file) {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

async function safeFile(root, relative) {
  if (!model.safeRelative(relative)) throw new Error('原稿のパスが不正です。');
  const realRoot = await fs.realpath(root), file = await fs.realpath(path.join(realRoot, ...relative.split('/')));
  if (!within(realRoot, file)) throw new Error('ワークスペース外の原稿は開きません。');
  return file;
}

async function snapshot(pdfFile, root) {
  if (!root) return undefined;
  let data;
  try { data = await fs.readFile(pdfFile.replace(/\.pdf$/i, '.synctex.gz')); } catch (e) {
    if (e.code === 'ENOENT') return undefined;
    throw e;
  }
  if (data.length > 8 * 1024 * 1024) throw new Error('SyncTeX情報が8 MiBを超えています。');
  const text = zlib.gunzipSync(data, { maxOutputLength: 64 * 1024 * 1024 }).toString('utf8');
  const realRoot = await fs.realpath(root), inputs = new Map(), replacements = new Map();
  for (const match of text.matchAll(/^Input:(\d+):([^\r\n]+)$/gm)) {
    const [, tag, input] = match;
    let relative;
    const candidates = new Set();
    for (const candidate of path.isAbsolute(input) ? [input] : [path.resolve(root, input), path.resolve(path.dirname(pdfFile), input)]) {
      try {
        const file = await fs.realpath(candidate);
        if (!within(realRoot, file)) continue;
        const candidateRelative = path.relative(realRoot, file).split(path.sep).join('/');
        if (!model.safeRelative(candidateRelative)) continue;
        const stat = await fs.stat(file);
        if (!stat.isFile() || stat.size > 1024 * 1024) continue;
        candidates.add(file);
      } catch { /* 存在しない候補や外部の原稿は取り込まない。 */ }
    }
    if (candidates.size > 1) throw new Error('SyncTeXの相対パスに同名の原稿候補が複数あります。絶対パスを記録する設定でPDFを再生成してください。');
    for (const file of candidates) {
      try {
        relative = path.relative(realRoot, file).split(path.sep).join('/');
        const source = await fs.readFile(file, 'utf8');
        const lines = model.lineHashes(source);
        if (lines.length > 100000) { relative = undefined; continue; }
        inputs.set(relative, { path: relative, sha256: model.hash(model.sourceText(source)), lines });
        break;
      } catch { relative = undefined; }
    }
    replacements.set(tag, relative ? PREFIX + relative : `/__pdf_review_external__/${tag}`);
    if (inputs.size > 2000) throw new Error('原稿ファイルが多すぎます。');
  }
  const sanitized = text.replace(/^Input:(\d+):[^\r\n]+/gm, (_, tag) => `Input:${tag}:${replacements.get(tag)}`);
  return { data: zlib.gzipSync(sanitized).toString('base64'), inputs: [...inputs.values()] };
}

function parseResult(output) {
  const results = [];
  for (const section of output.split(/(?=Input:)/)) {
    const file = section.match(/^Input:([^\r\n]+)/m)?.[1];
    const line = Number(section.match(/^Line:(\d+)/m)?.[1]);
    if (!file?.startsWith(PREFIX) || !Number.isSafeInteger(line) || line < 1) continue;
    const relative = file.slice(PREFIX.length);
    if (model.safeRelative(relative)) results.push({ path: relative, line });
  }
  return results;
}

async function query(review, anchor, executable) {
  if (!review.sync) throw new Error('このレビューにはSyncTeX情報がありません。');
  model.validateAnchor(anchor);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tex-pdf-review-'));
  try {
    const pdf = path.join(tmp, 'review.pdf');
    await fs.writeFile(pdf, model.bytes(review.pdf.data, model.MAX_PDF));
    const syncData = model.bytes(review.sync.data, 8 * 1024 * 1024);
    zlib.gunzipSync(syncData, { maxOutputLength: 64 * 1024 * 1024 });
    await fs.writeFile(path.join(tmp, 'review.synctex.gz'), syncData);
    // PDF.js のPDF座標は下端原点。SyncTeXへの座標変換は呼出し側でページ寸法を検証する。
    const { x, y } = anchor.point || {};
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1000000 || Math.abs(y) > 1000000) throw new Error('移動先の座標が不正です。');
    const { stdout } = await exec(executable, ['edit', '-o', `${anchor.page}:${x}:${y}:${pdf}`], { cwd: tmp, timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true });
    const matches = parseResult(stdout).filter(result => review.sync.inputs.some(input => input.path === result.path));
    if (!matches.length) throw new Error('この場所に対応するワークスペース内のTeX原稿が見つかりません。');
    return matches[0];
  } finally { await fs.rm(tmp, { recursive: true, force: true }); }
}

module.exports = { PREFIX, within, safeFile, snapshot, parseResult, query };
