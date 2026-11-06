const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../src/model.cjs');

const anchor = { page: 1, rects: [[1, 1, 20, 20]], quote: 'test', point: { x: 10, y: 10 } };
async function host() {
  let review = model.create(Buffer.from('%PDF-1.7\nmock'), 'test.pdf');
  review = model.applyOperation(review, { type: 'addThread', anchor, body: 'original' }, 'Reviewer');
  const uri = { toString: () => 'file:///review.pdfreview', fsPath: '/review.pdfreview' };
  const document = { uri, version: 1, isDirty: false, getText: () => text,
    positionAt: offset => offset, save: async () => { document.isDirty = false; return true; } };
  let text = JSON.stringify(review), receive, provider;
  const events = [], warnings = [], values = new Map(), changes = [];
  const panel = { webview: { postMessage: message => events.push(message), onDidReceiveMessage: fn => { receive = fn; } },
    onDidChangeViewState() {}, onDidDispose() {} };
  const vscode = { Uri: { joinPath: () => uri }, Range: class {}, WorkspaceEdit: class { replace(_uri, _range, value) { this.value = value; } },
    workspace: { isTrusted: true, workspaceFolders: [], getWorkspaceFolder: () => ({ uri: { fsPath: '/project' } }),
      getConfiguration: () => ({ get: () => '' }), onDidChangeTextDocument: fn => { changes.push(fn); return { dispose() {} }; },
      onDidSaveTextDocument: () => ({ dispose() {} }),
      fs: { stat: async () => ({ size: 20 }), readFile: async () => Buffer.from('%PDF-1.7\nmock') },
      applyEdit: async edit => { update(JSON.parse(edit.value)); return true; } },
    window: { registerCustomEditorProvider: (_id, value) => { provider = value; },
      showWarningMessage: async message => { warnings.push(message); return '削除'; }, showErrorMessage: async () => {},
      showOpenDialog: async () => [uri] }, commands: { registerCommand() {} } };
  function update(value) { text = JSON.stringify(value); document.version++; document.isDirty = true; changes.forEach(fn => fn({ document })); }
  const context = { subscriptions: [], extensionUri: uri,
    globalState: { get: key => values.get(key), update: async (key, value) => { values.set(key, value); } } };
  const source = fs.readFileSync(path.join(__dirname, '../src/extension.cjs'), 'utf8');
  const module = { exports: {} };
  const sync = { snapshot: async () => ({ data: require('node:zlib').gzipSync('SyncTeX Version:1\n').toString('base64'),
    inputs: [{ path: 'main.tex', sha256: model.hash('source'), lines: model.lineHashes('source') }] }) };
  vm.runInThisContext(`(function(require,module){${source}\n})`)(name => name === 'vscode' ? vscode : name === './html.cjs' ? { html: () => '' } : name === './synctex.cjs' ? sync : name === './model.cjs' ? model : require(name), module);
  module.exports.activate(context);
  await provider.resolveCustomTextEditor(document, panel);
  receive({ type: 'ready' });
  let sequence = 0;
  async function request(type, payload = {}) {
    const requestId = String(++sequence);
    receive({ type, requestId, version: document.version, author: 'Reviewer', ...payload });
    for (let i = 0; i < 100; i++) {
      const ack = events.find(event => event.type === 'ack' && event.requestId === requestId);
      if (ack) return ack;
      await new Promise(resolve => setImmediate(resolve));
    }
    throw new Error('No response');
  }
  return { document, vscode, events, warnings, values, receive, request, update,
    review: () => model.parse(text), draftKey: `draft:${uri.toString()}` };
}

test('resolve/delete preserve unrelated drafts; posting clears only the matching draft', async () => {
  const h = await host(), threadId = h.review().threads[0].id;
  const draft = { reviewId: h.review().id, pdfHash: h.review().pdf.sha256, author: 'Reviewer',
    draft: { type: 'reply', threadId, anchor, body: 'UNPOSTED TEXT' } };
  h.receive({ type: 'draft', value: draft });
  await h.request('operation', { operation: { type: 'resolve', threadId, resolved: true } });
  assert.deepEqual(h.values.get(h.draftKey), draft);
  const other = await h.request('operation', { operation: { type: 'addThread', anchor, body: 'another comment' } });
  assert.equal(other.error, undefined);
  assert.deepEqual(h.values.get(h.draftKey), draft);
  const second = h.review().threads[1];
  await h.request('operation', { operation: { type: 'deleteMessage', threadId: second.id, messageId: second.messages[0].id } });
  assert.deepEqual(h.values.get(h.draftKey), draft);
  await h.request('operation', { operation: { type: 'reply', threadId, body: 'UNPOSTED TEXT' } });
  assert.equal(h.values.get(h.draftKey), undefined);
  assert.equal(h.review().threads[0].messages.length, 2);
});

test('SyncTeX attach refuses to overwrite edits made while the PDF picker is open', async () => {
  const h = await host(), threadId = h.review().threads[0].id;
  h.vscode.window.showOpenDialog = async () => {
    h.update(model.applyOperation(h.review(), { type: 'reply', threadId, body: 'concurrent reply' }, 'Another author'));
    return [{ fsPath: '/test.pdf' }];
  };
  const ack = await h.request('navigate', { threadId });
  assert.match(ack.error, /別の操作で更新/);
  assert.equal(h.review().threads[0].messages[1].body, 'concurrent reply');
  assert.equal(h.review().sync, undefined);
});

for (const throws of [false, true]) test(`applied post is acknowledged when save ${throws ? 'throws' : 'returns false'}`, async () => {
  const h = await host();
  h.document.save = async () => { if (throws) throw new Error('disk full'); return false; };
  const ack = await h.request('operation', { operation: { type: 'addThread', anchor, body: 'saved in buffer' } });
  assert.equal(ack.error, undefined);
  assert.equal(h.review().threads.length, 2);
  assert.equal(h.document.isDirty, true);
  assert.ok(h.events.some(event => event.type === 'state' && event.dirty));
  assert.ok(h.warnings.some(message => message.includes('再投稿せず')));
});
