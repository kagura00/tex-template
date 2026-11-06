import * as pdfjs from './pdfjs/build/pdf.mjs';

const vscode = acquireVsCodeApi();
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/build/pdf.worker.mjs', import.meta.url).href;
const $ = id => document.getElementById(id);
const ui = { review: null, version: 0, scale: 1, pages: [], selected: null, draft: null, busy: false, observer: null, pdf: null, pdfHash: null, generation: 0, authorEdited: false, restoredDraft: false };
const pending = new Map();

function error(message) { $('error').textContent = message; $('error').hidden = !message; }
function setBusy(value) {
  ui.busy = value;
  for (const node of document.querySelectorAll('#comments-panel button, #context-add, #add-comment, #region-mode, #comment-body')) node.disabled = value;
}
function send(type, payload = {}) {
  if (ui.busy) return Promise.reject(new Error('処理が完了するまでお待ちください。'));
  setBusy(true);
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    vscode.postMessage({ type, requestId, version: ui.version, ...payload });
  });
}
async function operation(op) {
  error('');
  const author = $('author').value.trim();
  if (!author) { $('author').focus(); throw new Error('表示名を入力してください。'); }
  return send('operation', { operation: op, author });
}
const handle = fn => (...args) => Promise.resolve().then(() => fn(...args)).catch(e => error(e.message));
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, onClick, className = '') {
  const node = el('button', className, text);
  node.type = 'button'; node.disabled = ui.busy;
  node.addEventListener('click', handle((...args) => { if (!ui.busy) return onClick(...args); })); return node;
}

function showPanel() { $('comments-panel').hidden = false; $('toggle-comments').setAttribute('aria-expanded', 'true'); }
function selectThread(id, scrollPdf = false) {
  ui.selected = id;
  const thread = ui.review.threads.find(t => t.id === id);
  if (!thread) return;
  showPanel();
  if (thread.status === 'resolved') $('show-resolved').checked = true;
  renderThreads(); drawAll();
  const card = document.querySelector(`.thread[data-id="${CSS.escape(id)}"]`);
  card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (scrollPdf) {
    const page = ui.pages[thread.anchor.page - 1];
    if (page) {
      const [, top] = viewportRect(page, thread.anchor.rects[0]);
      $('pdf-scroll').scrollTo({ top: page.element.offsetTop - $('pages').offsetTop + top - 80, behavior: 'smooth' });
    }
  }
}

function confirmDiscard() {
  const dialog = $('discard-dialog');
  if (dialog.open) return Promise.resolve(false);
  dialog.returnValue = '';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'discard'), { once: true });
    dialog.showModal();
  });
}
async function compose(draft) {
  if (ui.busy) return;
  if (ui.draft && $('comment-body').value.trim() && !await confirmDiscard()) return;
  ui.draft = draft; showPanel();
  $('composer').hidden = false;
  $('composer-title').textContent = draft.type === 'addThread' ? '新しいコメント' : draft.type === 'reply' ? '返信' : 'コメントを編集';
  $('selection-quote').textContent = draft.anchor?.quote || '';
  $('comment-body').value = draft.body || '';
  $('composer').scrollIntoView({ block: 'nearest' });
  $('comment-body').focus();
  persistDraft();
  drawAll();
}
function persistDraft() {
  if (!ui.review) return;
  vscode.postMessage({ type: 'draft', value: ui.draft ? { reviewId: ui.review.id, pdfHash: ui.review.pdf.sha256,
    author: $('author').value.slice(0, 100), draft: { ...ui.draft, body: $('comment-body').value.slice(0, 20000) } } : null });
}
function clearDraft() { ui.draft = null; $('composer').hidden = true; $('comment-body').value = ''; persistDraft(); drawAll(); }

function renderThreads() {
  const container = $('threads'); container.replaceChildren();
  const open = ui.review.threads.filter(t => t.status === 'open').length;
  $('open-count').textContent = String(open);
  const threads = ui.review.threads.filter(t => t.status === 'open' || $('show-resolved').checked);
  if (!threads.length) container.append(el('p', 'empty', ui.review.threads.length ? '未対応のコメントはありません。' : '文章を選択して右クリック、または「図表の範囲指定」でコメントを追加できます。'));
  for (const thread of threads) {
    const card = el('article', `thread ${thread.status === 'resolved' ? 'resolved' : ''} ${thread.id === ui.selected ? 'selected' : ''}`);
    card.dataset.id = thread.id;
    const heading = el('div', 'thread-heading');
    heading.append(button(`p.${thread.anchor.page} ${thread.status === 'resolved' ? '解決済み' : '未対応'}`, () => selectThread(thread.id, true)),
      button(thread.status === 'resolved' ? '再開' : '解決', () => operation({ type: 'resolve', threadId: thread.id })));
    card.append(heading, el('blockquote', 'thread-quote', thread.anchor.quote || '図表・領域へのコメント'));
    for (const message of thread.messages) {
      const node = el('div', 'message'), meta = el('div', 'message-heading');
      const time = el('time', '', new Date(message.createdAt).toLocaleString()); time.dateTime = message.createdAt;
      meta.append(el('strong', '', message.author), time);
      if (message.updatedAt) meta.append(el('span', '', '編集済み'));
      const actions = el('div', 'message-actions');
      actions.append(button('編集', () => compose({ type: 'editMessage', threadId: thread.id, messageId: message.id, body: message.body })),
        button('削除', () => operation({ type: 'deleteMessage', threadId: thread.id, messageId: message.id })));
      node.append(meta, el('p', 'message-body', message.body), actions); card.append(node);
    }
    const actions = el('div', 'actions');
    actions.append(button('返信', () => compose({ type: 'reply', threadId: thread.id })),
      button('TeXへ移動', () => send('navigate', { threadId: thread.id })));
    card.append(actions);
    card.addEventListener('click', event => { if (!event.target.closest('button,textarea,input')) selectThread(thread.id, false); });
    container.append(card);
  }
}

function viewportRect(page, rect) {
  const a = page.viewport.convertToViewportPoint(rect[0], rect[1]), b = page.viewport.convertToViewportPoint(rect[2], rect[3]);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])];
}
function pdfRect(page, rect) {
  const box = page.element.getBoundingClientRect();
  const a = page.viewport.convertToPdfPoint(rect.left - box.left, rect.top - box.top);
  const b = page.viewport.convertToPdfPoint(rect.right - box.left, rect.bottom - box.top);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}
function anchor(page, rects, quote) {
  const first = rects[0], view = page.pdfPage.view, unit = page.pdfPage.userUnit || 1;
  return { page: page.number, rects, quote: quote.slice(0, 10000), point: { x: ((first[0] + first[2]) / 2 - view[0]) * unit, y: (view[3] - (first[1] + first[3]) / 2) * unit } };
}

function captureSelection() {
  const selection = document.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed || !$('pages').contains(selection.anchorNode) || !$('pages').contains(selection.focusNode)) return null;
  const original = selection.getRangeAt(0), anchors = [];
  for (const page of ui.pages) {
    const layer = page.textLayer;
    if (!layer || !original.intersectsNode(layer)) continue;
    const range = original.cloneRange();
    if (!layer.contains(range.startContainer)) range.setStart(layer, 0);
    if (!layer.contains(range.endContainer)) range.setEnd(layer, layer.childNodes.length);
    const box = page.element.getBoundingClientRect();
    const rects = [...range.getClientRects()].filter(r => r.width > .5 && r.height > .5 && r.left >= box.left - 2 && r.right <= box.right + 2 && r.top >= box.top - 2 && r.bottom <= box.bottom + 2)
      .map(r => pdfRect(page, r));
    const unique = [...new Map(rects.map(r => [r.map(n => n.toFixed(2)).join(','), r])).values()];
    if (unique.length) anchors.push(anchor(page, unique, range.toString().trim()));
  }
  if (!anchors.length) return null;
  // 複数ページは1スレッドにつき1ページ。曖昧な範囲を黙って切り捨てない。
  if (anchors.length > 1) throw new Error('ページをまたぐ選択は、ページごとにコメントを追加してください。');
  return anchors[0];
}

function drawPage(page) {
  page.annotations.replaceChildren();
  page.element.querySelectorAll('.comment-marker').forEach(n => n.remove());
  const threads = ui.review.threads.filter(t => t.anchor.page === page.number && (t.status === 'open' || $('show-resolved').checked));
  const markerTops = [];
  for (const thread of threads) {
    for (const rect of thread.anchor.rects) {
      const node = el('div', `highlight ${thread.id === ui.selected ? 'selected' : ''} ${thread.status === 'resolved' ? 'resolved' : ''}`);
      const [x, y, w, h] = viewportRect(page, rect);
      Object.assign(node.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      page.annotations.append(node);
    }
    let top = viewportRect(page, thread.anchor.rects[0])[1];
    while (markerTops.some(t => Math.abs(t - top) < 28)) top += 28;
    top = Math.min(top, page.viewport.height - 26); markerTops.push(top);
    const marker = button('▤', () => selectThread(thread.id), `comment-marker ${thread.id === ui.selected ? 'selected' : ''}`);
    marker.style.top = `${top}px`; marker.setAttribute('aria-label', `ページ${page.number}のコメント: ${thread.messages[0].body.slice(0, 80)}`);
    marker.title = thread.messages[0].body.slice(0, 180); page.element.append(marker);
  }
  if (ui.draft?.anchor?.page === page.number) {
    for (const rect of ui.draft.anchor.rects) {
      const node = el('div', 'highlight selected'), [x, y, w, h] = viewportRect(page, rect);
      Object.assign(node.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` }); page.annotations.append(node);
    }
  }
}
function drawAll() { for (const page of ui.pages) drawPage(page); }

async function renderPage(page) {
  if (page.rendered || page.rendering) return;
  page.rendering = true;
  const generation = ui.generation;
  try {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    page.canvas.width = Math.ceil(page.viewport.width * dpr); page.canvas.height = Math.ceil(page.viewport.height * dpr);
    const task = page.pdfPage.render({ canvasContext: page.canvas.getContext('2d'), viewport: page.viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] });
    page.renderTask = task; await task.promise;
    if (generation !== ui.generation) return;
    const text = new pdfjs.TextLayer({ textContentSource: page.pdfPage.streamTextContent(), container: page.textLayer, viewport: page.viewport });
    page.textTask = text; await text.render();
    if (generation !== ui.generation) return;
    page.rendered = true; page.element.dataset.rendered = 'true';
  } catch (e) { if (!/cancel/i.test(e.name)) error(`ページ${page.number}: ${e.message}`); }
  finally { page.rendering = false; }
}

async function layoutPages() {
  ui.generation++; ui.observer?.disconnect();
  for (const page of ui.pages) { page.renderTask?.cancel(); page.textTask?.cancel(); }
  const previousPage = Number($('page-number').value) || 1;
  const generation = ui.generation;
  ui.pages = []; $('pages').replaceChildren();
  ui.observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const page = ui.pages[Number(entry.target.dataset.page) - 1];
      if (entry.isIntersecting && page) renderPage(page);
      // テキストは選択・検索用に残し、遠くのページのビットマップを解放する。
      else if (page?.rendered && Math.abs(page.element.getBoundingClientRect().top) > innerHeight * 4) {
        page.canvas.width = 0; page.canvas.height = 0; page.rendered = false; page.textLayer.replaceChildren();
      }
    }
  }, { root: $('pdf-scroll'), rootMargin: '1200px 0px' });
  for (let number = 1; number <= ui.pdf.numPages; number++) {
    const pdfPage = await ui.pdf.getPage(number);
    if (generation !== ui.generation) return;
    const viewport = pdfPage.getViewport({ scale: ui.scale });
    const element = el('div', 'pdf-page'); element.dataset.page = String(number);
    element.style.width = `${viewport.width}px`; element.style.height = `${viewport.height}px`;
    element.style.setProperty('--scale-factor', String(ui.scale)); element.style.setProperty('--total-scale-factor', String(ui.scale * (pdfPage.userUnit || 1)));
    const canvas = el('canvas'); canvas.setAttribute('aria-label', `PDF ${number}ページ`);
    const textLayer = el('div', 'textLayer'), annotations = el('div', 'annotation-layer');
    element.append(canvas, textLayer, annotations); $('pages').append(element);
    const page = { number, pdfPage, viewport, element, canvas, textLayer, annotations, rendered: false, rendering: false };
    ui.pages.push(page); ui.observer.observe(element); drawPage(page);
  }
  $('loading').hidden = true; $('app').setAttribute('aria-busy', 'false');
  $('page-number').max = String(ui.pdf.numPages); $('page-count').textContent = `/ ${ui.pdf.numPages}`;
  $('zoom-label').textContent = `${Math.round(ui.scale * 100)}%`;
  ui.pages[Math.min(previousPage, ui.pages.length) - 1]?.element.scrollIntoView({ block: 'start' });
}

async function loadPdf(review) {
  if (ui.pdfHash === review.pdf.sha256) return;
  ui.pdfHash = review.pdf.sha256;
  $('loading').hidden = false; $('app').setAttribute('aria-busy', 'true');
  ui.generation++; ui.observer?.disconnect();
  for (const page of ui.pages) { page.renderTask?.cancel(); page.textTask?.cancel(); }
  if (ui.pdf) await ui.pdf.destroy();
  const data = Uint8Array.from(atob(review.pdf.data), c => c.charCodeAt(0));
  ui.pdf = await pdfjs.getDocument({ data, cMapUrl: new URL('./pdfjs/cmaps/', import.meta.url).href, cMapPacked: true,
    standardFontDataUrl: new URL('./pdfjs/standard_fonts/', import.meta.url).href, wasmUrl: new URL('./pdfjs/wasm/', import.meta.url).href,
    isEvalSupported: false, enableXfa: false }).promise;
  await layoutPages();
}

window.addEventListener('message', handle(async event => {
  const message = event.data;
  if (message.type === 'state') {
    ui.version = message.version; ui.review = message.review;
    if (!ui.authorEdited) $('author').value = message.author || '';
    $('document-name').textContent = ui.review.pdf.name; document.title = `${ui.review.pdf.name} — PDFレビュー`;
    $('save-status').textContent = message.dirty ? '未保存の変更があります（Ctrl+Sで保存）' : '保存済み · .pdfreviewファイルを渡すとPDFとコメントを共有できます';
    renderThreads();
    if (!ui.restoredDraft && Object.hasOwn(message, 'draftState')) {
      ui.restoredDraft = true;
      const saved = message.draftState;
      if (saved?.reviewId === ui.review.id && saved?.pdfHash === ui.review.pdf.sha256 && saved.draft?.body &&
          (saved.draft.type === 'addThread' || ui.review.threads.some(t => t.id === saved.draft.threadId))) {
        $('author').value = saved.author || $('author').value;
        await compose(saved.draft);
      }
    }
    await loadPdf(ui.review); drawAll();
  } else if (message.type === 'ack') {
    const request = pending.get(message.requestId); pending.delete(message.requestId); setBusy(false);
    if (request) message.error ? request.reject(new Error(message.error)) : request.resolve(message);
  } else if (message.type === 'error') error(message.message);
}));
$('author').addEventListener('input', () => { ui.authorEdited = true; if (ui.draft) persistDraft(); });
$('comment-body').addEventListener('input', persistDraft);
$('show-resolved').addEventListener('change', () => { if (ui.review) { renderThreads(); drawAll(); } });
$('toggle-comments').addEventListener('click', () => { $('comments-panel').hidden = !$('comments-panel').hidden; $('toggle-comments').setAttribute('aria-expanded', String(!$('comments-panel').hidden)); });
$('page-number').addEventListener('change', () => { ui.pages[Number($('page-number').value) - 1]?.element.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
let scrollTimer;
$('pdf-scroll').addEventListener('scroll', () => {
  clearTimeout(scrollTimer); scrollTimer = setTimeout(() => {
    const top = $('pdf-scroll').getBoundingClientRect().top;
    const page = ui.pages.find(p => p.element.getBoundingClientRect().bottom > top + 30);
    if (page) $('page-number').value = String(page.number);
  }, 100);
});
for (const [id, delta] of [['zoom-in', .2], ['zoom-out', -.2]]) $(id).addEventListener('click', handle(async () => {
  if (!ui.pdf) return; ui.scale = Math.max(.4, Math.min(2.5, Math.round((ui.scale + delta) * 10) / 10)); await layoutPages();
}));
$('add-comment').addEventListener('mousedown', event => event.preventDefault());
$('add-comment').addEventListener('click', handle(() => {
  const selected = captureSelection();
  if (selected) { compose({ type: 'addThread', anchor: selected }); document.getSelection()?.removeAllRanges(); }
  else error('PDF内の文章を選択してください。図表には「図表の範囲指定」を使えます。');
}));
$('composer').addEventListener('submit', event => {
  event.preventDefault();
  handle(async () => {
    if (!ui.draft) return;
    const result = await operation({ ...ui.draft, body: $('comment-body').value });
    if (!result.canceled) clearDraft();
  })();
});
$('cancel-comment').addEventListener('click', handle(async () => { if (!$('comment-body').value.trim() || await confirmDiscard()) clearDraft(); }));

let contextAnchor;
$('pdf-scroll').addEventListener('contextmenu', event => {
  if (!event.target.closest('.pdf-page')) return;
  event.preventDefault();
  try { contextAnchor = captureSelection(); } catch (e) { error(e.message); contextAnchor = null; }
  if (!contextAnchor) { $('context-menu').hidden = true; return; }
  const menu = $('context-menu'); menu.hidden = false;
  menu.style.left = `${Math.min(event.clientX, innerWidth - 190)}px`; menu.style.top = `${Math.min(event.clientY, innerHeight - 50)}px`;
  $('context-add').focus({ preventScroll: true });
});
$('context-add').addEventListener('click', () => {
  $('context-menu').hidden = true;
  if (contextAnchor) { compose({ type: 'addThread', anchor: contextAnchor }); document.getSelection()?.removeAllRanges(); }
});
document.addEventListener('mousedown', e => { if (!e.target.closest('#context-menu')) $('context-menu').hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('context-menu').hidden = true; });

$('pdf-scroll').addEventListener('click', event => {
  if (event.target.closest('button') || !document.getSelection()?.isCollapsed) return;
  const element = event.target.closest('.pdf-page');
  if (!element) return;
  const page = ui.pages[Number(element.dataset.page) - 1], box = element.getBoundingClientRect();
  const [x, y] = page.viewport.convertToPdfPoint(event.clientX - box.left, event.clientY - box.top);
  const match = ui.review.threads.find(t => t.anchor.page === page.number && (t.status === 'open' || $('show-resolved').checked) && t.anchor.rects.some(r => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]));
  if (match) selectThread(match.id);
});
let region = null;
$('region-mode').addEventListener('click', () => {
  const enabled = $('region-mode').getAttribute('aria-pressed') !== 'true';
  $('region-mode').setAttribute('aria-pressed', String(enabled)); $('pdf-scroll').classList.toggle('region-select', enabled);
  error(enabled ? '図表をドラッグして範囲を囲んでください。' : '');
});
$('pdf-scroll').addEventListener('pointerdown', event => {
  if (!$('pdf-scroll').classList.contains('region-select') || event.button !== 0 || event.target.closest('button')) return;
  const element = event.target.closest('.pdf-page'); if (!element) return;
  event.preventDefault();
  const page = ui.pages[Number(element.dataset.page) - 1], box = element.getBoundingClientRect();
  const preview = el('div', 'region-preview'); element.append(preview);
  region = { page, x: event.clientX - box.left, y: event.clientY - box.top, preview, pointerId: event.pointerId };
  element.setPointerCapture(event.pointerId);
});
$('pdf-scroll').addEventListener('pointermove', event => {
  if (!region) return;
  const box = region.page.element.getBoundingClientRect(), x = Math.max(0, Math.min(box.width, event.clientX - box.left)), y = Math.max(0, Math.min(box.height, event.clientY - box.top));
  Object.assign(region.preview.style, { left: `${Math.min(x, region.x)}px`, top: `${Math.min(y, region.y)}px`, width: `${Math.abs(x - region.x)}px`, height: `${Math.abs(y - region.y)}px` });
});
$('pdf-scroll').addEventListener('pointerup', event => {
  if (!region) return;
  const current = region; region = null;
  const rect = current.preview.getBoundingClientRect(); current.preview.remove(); current.page.element.releasePointerCapture(event.pointerId);
  if (rect.width < 4 || rect.height < 4) return;
  compose({ type: 'addThread', anchor: anchor(current.page, [pdfRect(current.page, rect)], '') });
  $('region-mode').setAttribute('aria-pressed', 'false'); $('pdf-scroll').classList.remove('region-select'); error('');
});
$('pdf-scroll').addEventListener('pointercancel', () => { region?.preview.remove(); region = null; });
vscode.postMessage({ type: 'ready' });
