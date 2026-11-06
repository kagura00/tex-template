const crypto = require('node:crypto');

const FORMAT = 'tex-template.pdf-review';
const MAX_PDF = 32 * 1024 * 1024;
const MAX_REVIEW = 64 * 1024 * 1024;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sourceText = text => text.replace(/\r\n/g, '\n');
const lineHashes = text => sourceText(text).split('\n').map(line => hash(line));

function requireText(value, max, label, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
    throw new Error(`${label}が空欄、または長すぎます。`);
  }
  return value;
}

function bytes(base64, limit) {
  if (typeof base64 !== 'string' || base64.length > Math.ceil(limit / 3) * 4 || base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error('埋め込みデータの形式・サイズが不正です。');
  }
  const result = Buffer.from(base64, 'base64');
  if (result.length > limit || result.toString('base64') !== base64) throw new Error('埋め込みデータの形式・サイズが不正です。');
  return result;
}

function safeRelative(file) {
  return typeof file === 'string' && file.length > 0 && file.length < 2048 &&
    !file.includes('\\') && !file.includes(':') && !file.includes('\0') &&
    !file.startsWith('/') && file.split('/').every(part => part && part !== '.' && part !== '..');
}

function validateAnchor(anchor) {
  if (!anchor || !Number.isInteger(anchor.page) || anchor.page < 1 || anchor.page > 100000 ||
      !Array.isArray(anchor.rects) || !anchor.rects.length || anchor.rects.length > 2000) {
    throw new Error('コメント範囲が不正です。');
  }
  requireText(anchor.quote, 10000, '選択した文章', true);
  if (!anchor.point || !Number.isFinite(anchor.point.x) || !Number.isFinite(anchor.point.y) ||
      Math.abs(anchor.point.x) > 1000000 || Math.abs(anchor.point.y) > 1000000) throw new Error('TeXへの移動用座標が不正です。');
  for (const r of anchor.rects) {
    if (!Array.isArray(r) || r.length !== 4 || r.some(n => !Number.isFinite(n) || Math.abs(n) > 1000000) || r[2] <= r[0] || r[3] <= r[1]) {
      throw new Error('コメントの座標が不正です。');
    }
  }
}

function validate(review) {
  if (!review || review.format !== FORMAT || review.version !== 1 || !review.pdf ||
      !Array.isArray(review.threads) || review.threads.length > 5000) {
    throw new Error('このファイルは対応するPDFレビュー形式ではありません。');
  }
  requireText(review.id, 100, 'レビューID');
  requireText(review.pdf.name, 255, 'PDF名');
  const pdf = bytes(review.pdf.data, MAX_PDF);
  if (pdf.subarray(0, 1024).indexOf('%PDF-') < 0 || hash(pdf) !== review.pdf.sha256) {
    throw new Error('PDFの内容と識別情報が一致しません。');
  }
  if (review.sync) {
    bytes(review.sync.data, 8 * 1024 * 1024);
    if (!Array.isArray(review.sync.inputs) || review.sync.inputs.length > 2000) throw new Error('SyncTeX情報が不正です。');
    for (const input of review.sync.inputs) {
      if (!safeRelative(input.path) || !Array.isArray(input.lines) || input.lines.length > 100000 ||
          !/^[a-f0-9]{64}$/.test(input.sha256) || input.lines.some(h => !/^[a-f0-9]{64}$/.test(h))) throw new Error('原稿の対応情報が不正です。');
    }
  }
  const ids = new Set();
  for (const thread of review.threads) {
    requireText(thread.id, 100, 'スレッドID');
    if (ids.has(thread.id)) throw new Error('スレッドIDが重複しています。');
    ids.add(thread.id);
    validateAnchor(thread.anchor);
    if (!['open', 'resolved'].includes(thread.status) || !Array.isArray(thread.messages) || !thread.messages.length || thread.messages.length > 1000) {
      throw new Error('コメントスレッドが不正です。');
    }
    const messageIds = new Set();
    for (const message of thread.messages) {
      requireText(message.id, 100, 'コメントID');
      if (messageIds.has(message.id)) throw new Error('コメントIDが重複しています。');
      messageIds.add(message.id);
      requireText(message.body, 20000, 'コメント');
      requireText(message.author, 100, '表示名');
      if (!Number.isFinite(Date.parse(message.createdAt))) throw new Error('コメントの日時が不正です。');
    }
  }
  return review;
}

function parse(text) {
  if (Buffer.byteLength(text, 'utf8') > MAX_REVIEW) throw new Error('レビューが64 MiBを超えています。');
  return validate(JSON.parse(text));
}

function create(pdf, name, sync) {
  return validate({ format: FORMAT, version: 1, id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    pdf: { name, sha256: hash(pdf), data: pdf.toString('base64') }, ...(sync ? { sync } : {}), threads: [] });
}

function applyOperation(review, operation, author) {
  if (!operation || typeof operation !== 'object') throw new Error('操作の形式が不正です。');
  const next = structuredClone(review);
  const now = new Date().toISOString();
  const makeMessage = body => ({ id: crypto.randomUUID(), body: requireText(body, 20000, 'コメント').trim(), author: requireText(author, 100, '表示名').trim(), createdAt: now });
  if (operation.type === 'addThread') {
    validateAnchor(operation.anchor);
    next.threads.push({ id: crypto.randomUUID(), anchor: operation.anchor, status: 'open', messages: [makeMessage(operation.body)] });
  } else {
    const thread = next.threads.find(t => t.id === operation.threadId);
    if (!thread) throw new Error('対象のコメントが見つかりません。最新の表示を確認してください。');
    if (operation.type === 'reply') thread.messages.push(makeMessage(operation.body));
    else if (operation.type === 'resolve') thread.status = thread.status === 'open' ? 'resolved' : 'open';
    else if (operation.type === 'editMessage') {
      const message = thread.messages.find(m => m.id === operation.messageId);
      if (!message) throw new Error('編集対象が見つかりません。');
      message.body = requireText(operation.body, 20000, 'コメント').trim();
      message.updatedAt = now;
    } else if (operation.type === 'deleteMessage') {
      if (!thread.messages.some(m => m.id === operation.messageId)) throw new Error('削除対象が見つかりません。');
      thread.messages = thread.messages.filter(m => m.id !== operation.messageId);
      if (!thread.messages.length) next.threads = next.threads.filter(t => t.id !== thread.id);
    } else throw new Error('未対応の操作です。');
    thread.updatedAt = now;
  }
  return validate(next);
}

function relocate(input, text, line) {
  if (!Number.isInteger(line) || line < 1 || line > input.lines.length) return { kind: 'missing' };
  if (hash(sourceText(text)) === input.sha256) return { kind: 'unchanged', line };
  const current = lineHashes(text), candidates = [];
  for (let i = 0; i < current.length; i++) {
    if (current[i] !== input.lines[line - 1]) continue;
    let score = 0;
    for (let offset = -2; offset <= 2; offset++) {
      if (input.lines[line - 1 + offset] && input.lines[line - 1 + offset] === current[i + offset]) score++;
    }
    candidates.push({ line: i + 1, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const requiredContext = Math.min(3, input.lines.slice(Math.max(0, line - 3), line + 2).length);
  if (candidates.length && candidates[0].score >= requiredContext && (candidates.length === 1 || candidates[0].score > candidates[1].score)) {
    return { kind: 'relocated', line: candidates[0].line };
  }
  return { kind: candidates.length ? 'ambiguous' : 'changed', line };
}

module.exports = { FORMAT, MAX_PDF, MAX_REVIEW, hash, sourceText, lineHashes, bytes, safeRelative, validateAnchor, validate, parse, create, applyOperation, relocate };
