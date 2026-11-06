const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/model.cjs');
const pdf = Buffer.from('%PDF-1.7\nfixture\n%%EOF');
const anchor = { page: 1, quote: '本文', rects: [[20, 30, 70, 45]], point: { x: 45, y: 790 } };

test('threads, replies, edits, resolution and deletion survive JSON round trip without mutating the previous version', () => {
  const original = model.create(pdf, 'review.pdf');
  let review = model.applyOperation(original, { type: 'addThread', anchor, body: '根拠を追加してください。' }, 'Reviewer');
  assert.equal(original.threads.length, 0);
  const id = review.threads[0].id;
  review = model.applyOperation(review, { type: 'reply', threadId: id, body: '追記します。' }, 'Author');
  const messageId = review.threads[0].messages[1].id;
  review = model.applyOperation(review, { type: 'editMessage', threadId: id, messageId, body: '追記しました。' }, 'Author');
  review = model.applyOperation(review, { type: 'resolve', threadId: id }, 'Author');
  review = model.parse(JSON.stringify(review));
  assert.equal(review.threads[0].status, 'resolved');
  assert.equal(review.threads[0].messages[1].body, '追記しました。');
  assert.equal(review.threads[0].messages[0].author, 'Reviewer');
  review = model.applyOperation(review, { type: 'deleteMessage', threadId: id, messageId }, 'Author');
  assert.equal(review.threads[0].messages.length, 1);
  review = model.applyOperation(review, { type: 'deleteMessage', threadId: id, messageId: review.threads[0].messages[0].id }, 'Reviewer');
  assert.equal(review.threads.length, 0);
});
test('the embedded PDF cannot be replaced silently and hostile ranges/paths are rejected', () => {
  const review = model.create(pdf, 'review.pdf');
  const changed = structuredClone(review); changed.pdf.data = Buffer.from('%PDF-1.7 changed').toString('base64');
  assert.throws(() => model.parse(JSON.stringify(changed)), /一致/);
  for (const path of ['../outside.tex', 'C:/outside.tex', '/outside.tex', 'chapters/../a.tex', 'a\\b.tex']) assert.equal(model.safeRelative(path), false);
  for (const rects of [[[0, 0, Infinity, 5]], [[5, 0, 1, 2]], []]) assert.throws(() => model.applyOperation(review, { type: 'addThread', anchor: { ...anchor, rects }, body: 'x' }, 'a'));
  assert.throws(() => model.bytes('QQ=A', 100));
  assert.throws(() => model.applyOperation(review, { type: 'addThread', anchor, body: ' ' }, 'a'));
});
test('source anchors follow inserted lines, normalize CRLF, and refuse ambiguous/deleted text', () => {
  const text = 'alpha\nbeta\nunique sentence\ngamma\nend';
  const input = { sha256: model.hash(model.sourceText(text)), lines: model.lineHashes(text) };
  assert.deepEqual(model.relocate(input, text.replaceAll('\n', '\r\n'), 3), { kind: 'unchanged', line: 3 });
  assert.deepEqual(model.relocate(input, 'new paragraph\n' + text, 3), { kind: 'relocated', line: 4 });
  assert.equal(model.relocate(input, text.replace('unique sentence', 'different'), 3).kind, 'changed');
  assert.equal(model.relocate(input, text + '\n' + text, 3).kind, 'ambiguous');
  assert.equal(model.relocate(input, 'changed\ncontext\nunique sentence\nalso changed\nelsewhere', 3).kind, 'ambiguous');
});
test('large legal base64 data does not overflow the validator stack', () => {
  const value = Buffer.alloc(3 * 1024 * 1024, 65);
  assert.equal(model.bytes(value.toString('base64'), 4 * 1024 * 1024).length, value.length);
});
