const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const sync = require('../src/synctex.cjs');

test('source snapshot retains matching input IDs while removing absolute/external paths', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'review-sync-test-'));
  try {
    await fs.mkdir(path.join(dir, 'out'));
    await fs.writeFile(path.join(dir, 'main.tex'), 'one\ntwo\n');
    const source = `SyncTeX Version:1\nInput:1:${path.join(dir, 'main.tex')}\nInput:2:/private/user/secret.cls\nOutput:pdf\n`;
    const pdf = path.join(dir, 'out/main.pdf');
    await fs.writeFile(path.join(dir, 'out/main.synctex.gz'), zlib.gzipSync(source));
    const result = await sync.snapshot(pdf, dir);
    const text = zlib.gunzipSync(Buffer.from(result.data, 'base64')).toString();
    assert.ok(text.includes('Input:1:/__pdf_review__/main.tex'));
    assert.ok(!text.includes(dir)); assert.ok(!text.includes('/private/'));
    assert.equal(result.inputs[0].path, 'main.tex');
    assert.equal(result.inputs[0].lines.length, 3);
    assert.equal(await sync.safeFile(dir, 'main.tex'), await fs.realpath(path.join(dir, 'main.tex')));
    await assert.rejects(sync.safeFile(dir, '../secret.tex'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('query results reject outside paths and preserve names containing spaces', () => {
  const result = sync.parseResult('SyncTeX result begin\nInput:/private/a.tex\nLine:8\nInput:/__pdf_review__/chapter one/main.tex\nLine:12\nColumn:-1\n');
  assert.deepEqual(result, [{ path: 'chapter one/main.tex', line: 12 }]);
});
