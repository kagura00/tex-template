const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const model = require('../src/model.cjs');
const sync = require('../src/synctex.cjs');
const exec = promisify(execFile);

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tex review integration '));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'tex review outside '));
  try {
    const source = '\\documentclass{article}\n\\begin{document}\nFirst paragraph before the probe.\n\nSOURCEANCHORPROBE second paragraph.\n\\end{document}\n';
    await fs.writeFile(path.join(root, 'main.tex'), source);
    await exec('lualatex', ['-synctex=1', '-halt-on-error', '-interaction=nonstopmode', 'main.tex'], { cwd: root, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const pdfFile = path.join(root, 'main.pdf');
    const snapshot = await sync.snapshot(pdfFile, root);
    assert.ok(snapshot.inputs.some(i => i.path === 'main.tex'));
    const review = model.create(await fs.readFile(pdfFile), 'main.pdf', snapshot);
    const { stdout } = await exec('synctex', ['view', '-i', `5:1:${path.join(root, 'main.tex')}`, '-o', pdfFile], { cwd: root });
    const page = Number(stdout.match(/^Page:(\d+)/m)?.[1]), x = Number(stdout.match(/^x:([^\r\n]+)/m)?.[1]), y = Number(stdout.match(/^y:([^\r\n]+)/m)?.[1]);
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && page > 0);
    const anchor = { page, rects: [[1, 1, 2, 2]], quote: 'SOURCEANCHORPROBE', point: { x, y } };
    const result = await sync.query(review, anchor, 'synctex');
    assert.equal(result.path, 'main.tex'); assert.equal(result.line, 5);
    const input = review.sync.inputs.find(i => i.path === result.path);
    assert.deepEqual(model.relocate(input, '% a new line\n' + source, result.line), { kind: 'relocated', line: 6 });
    // レビュー対象のPDFは元のPDFの再生成・上書きから独立している。
    await fs.writeFile(pdfFile, 'replaced');
    const again = await sync.query(model.parse(JSON.stringify(review)), anchor, 'synctex');
    assert.deepEqual(again, result);
    await fs.writeFile(path.join(outside, 'private.tex'), 'not a project input');
    await fs.symlink(outside, path.join(root, 'outside'));
    await assert.rejects(sync.safeFile(root, 'outside/private.tex'), /ワークスペース外/);
    console.log('PASS: real LuaLaTeX + captured/sanitized SyncTeX maps the preserved PDF to main.tex:5; source insertion relocates to line 6; original PDF replacement leaves review intact.');
  } finally { await fs.rm(root, { recursive: true, force: true }); await fs.rm(outside, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
