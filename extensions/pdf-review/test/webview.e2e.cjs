const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { chromium } = require('playwright');
const model = require('../src/model.cjs');
const { html } = require('../src/html.cjs');

(async () => {
  const root = path.resolve(__dirname, '..');
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-review-ui-'));
  const pdf = await fs.readFile(process.env.REVIEW_TEST_PDF || path.resolve(root, '../../out/main.pdf'));
  let review = model.create(pdf, '日本語レビュー.pdf'), version = 1, draftState = null;
  const file = path.join(scratch, 'review.pdfreview');
  await fs.writeFile(file, JSON.stringify(review));
  const navigation = [], browserErrors = [];
  const state = (withDraft = false) => ({ type: 'state', version, dirty: false, author: 'Reviewer', review: { ...review, hasSync: false }, ...(withDraft ? { draftState } : {}) });
  let origin;
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/bridge' && req.method === 'POST') {
        let data = ''; for await (const chunk of req) data += chunk;
        const message = JSON.parse(data), events = [];
        if (message.type === 'ready') events.push(state(true));
        else if (message.type === 'draft') draftState = message.value;
        else if (message.type === 'operation') {
          assert.equal(message.version, version);
          review = model.applyOperation(review, message.operation, message.author); version++;
          await fs.writeFile(file, JSON.stringify(review));
          if (['addThread', 'reply', 'editMessage'].includes(message.operation.type)) draftState = null;
          events.push(state(), { type: 'ack', requestId: message.requestId });
        } else if (message.type === 'navigate') {
          navigation.push(message.threadId); events.push({ type: 'ack', requestId: message.requestId });
        }
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(events)); return;
      }
      if (req.url === '/') {
        const mock = { Uri: { joinPath: (_uri, ...parts) => path.join(root, ...parts) } };
        const webview = { cspSource: origin, asWebviewUri: file => new URL(path.relative(root, file).replaceAll('\\', '/'), origin + '/') };
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html(webview, root, mock)); return;
      }
      const relative = decodeURIComponent(new URL(req.url, origin).pathname).slice(1);
      const assetFile = path.resolve(root, relative);
      if (!assetFile.startsWith(root + path.sep) || !relative.startsWith('media/')) { res.writeHead(403).end(); return; }
      const type = { '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream' }[path.extname(assetFile)] || 'application/octet-stream';
      res.setHeader('Content-Type', type); res.end(await fs.readFile(assetFile));
    } catch (error) { console.error('Test bridge:', error); res.writeHead(500).end(error.message); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  let browser, page;
  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1560, height: 1000 } });
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
    await page.addInitScript(() => {
      window.acquireVsCodeApi = () => ({ postMessage(message) {
        fetch('/bridge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message) })
          .then(r => r.json()).then(events => events.forEach(data => window.dispatchEvent(new MessageEvent('message', { data }))));
      } });
    });
    await page.goto(origin);
    await page.locator('.pdf-page[data-page="1"][data-rendered="true"] .textLayer span').first().waitFor({ timeout: 60000 });
    const selected = await page.evaluate(() => {
      const span = [...document.querySelectorAll('.pdf-page[data-page="1"] .textLayer span')].find(n => n.textContent.trim().length > 5);
      const range = document.createRange(); range.selectNodeContents(span);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      const box = span.getBoundingClientRect(); return { text: span.textContent, x: box.x + 2, y: box.y + box.height / 2 };
    });
    await page.mouse.click(selected.x, selected.y, { button: 'right' });
    await page.getByRole('menuitem', { name: 'コメントを追加' }).click();
    const firstBody = 'この説明に根拠を追加してください。<img src=x onerror=alert(1)>';
    await page.getByLabel('コメント本文').fill(firstBody);
    await page.getByRole('button', { name: '投稿', exact: true }).click();
    await page.getByText(firstBody, { exact: true }).waitFor();
    assert.equal(review.threads.length, 1);
    assert.equal(await page.locator('.message-body img').count(), 0);
    assert.ok(review.threads[0].anchor.quote.trim());
    assert.ok(review.threads[0].anchor.rects.length);
    const originalAnchor = JSON.stringify(review.threads[0].anchor);
    await page.getByRole('button', { name: '返信', exact: true }).click();
    await page.getByLabel('コメント本文').fill('引用を追記しました。');
    await page.getByRole('button', { name: '投稿', exact: true }).click();
    await page.getByText('引用を追記しました。', { exact: true }).waitFor();
    await page.locator('.message').first().getByRole('button', { name: '編集', exact: true }).click();
    await page.getByLabel('コメント本文').fill('根拠を追加してください（編集済み）。');
    await page.getByRole('button', { name: '投稿', exact: true }).click();
    await page.getByText('根拠を追加してください（編集済み）。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '返信', exact: true }).click();
    await page.getByLabel('コメント本文').fill('未投稿の下書き');
    await page.waitForTimeout(100);
    await page.reload();
    await page.getByLabel('コメント本文').waitFor();
    assert.equal(await page.getByLabel('コメント本文').inputValue(), '未投稿の下書き');
    await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await page.getByRole('button', { name: '入力を続ける', exact: true }).click();
    assert.equal(await page.getByLabel('コメント本文').inputValue(), '未投稿の下書き');
    await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await page.getByRole('button', { name: '破棄する', exact: true }).click();
    await page.locator('#composer').waitFor({ state: 'hidden' });
    assert.equal(review.threads[0].messages.length, 2);
    await page.locator('.pdf-page[data-page="1"] .highlight').first().waitFor();
    const originalHighlight = await page.locator('.pdf-page[data-page="1"] .highlight').first().boundingBox();
    await page.getByRole('button', { name: '拡大', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('zoom-label').textContent === '120%');
    await page.locator('.pdf-page[data-page="1"][data-rendered="true"]').waitFor();
    assert.equal(JSON.stringify(review.threads[0].anchor), originalAnchor);
    const highlight = await page.locator('.pdf-page[data-page="1"] .highlight').first().boundingBox();
    assert.ok(highlight.width > 1 && highlight.height > 1);
    assert.ok(Math.abs(highlight.width / originalHighlight.width - 1.2) < .02);
    await page.getByRole('button', { name: 'TeXへ移動', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('submit-comment').disabled);
    assert.equal(navigation.length, 1);
    await page.getByRole('button', { name: '解決', exact: true }).click();
    await page.getByText('未対応のコメントはありません。').waitFor();
    await page.getByLabel('解決済みも表示').check();
    await page.getByRole('button', { name: '再開', exact: true }).waitFor();
    await page.reload();
    await page.locator('.pdf-page[data-page="1"][data-rendered="true"]').waitFor();
    await page.getByLabel('解決済みも表示').check();
    await page.getByText('引用を追記しました。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '再開', exact: true }).click();
    await page.getByRole('button', { name: '解決', exact: true }).waitFor();
    await page.getByRole('button', { name: '図表の範囲指定', exact: true }).click();
    const box = await page.locator('.pdf-page[data-page="1"]').boundingBox();
    await page.mouse.move(box.x + 80, box.y + 200); await page.mouse.down();
    await page.mouse.move(box.x + 190, box.y + 260, { steps: 5 }); await page.mouse.up();
    await page.getByLabel('コメント本文').fill('図の凡例を大きくしてください。');
    await page.getByRole('button', { name: '投稿', exact: true }).click();
    await page.getByText('図の凡例を大きくしてください。', { exact: true }).waitFor();
    assert.equal(review.threads.length, 2);
    assert.equal(model.parse(await fs.readFile(file, 'utf8')).threads.length, 2);
    await page.getByLabel('ページ番号').fill('2');
    await page.getByLabel('ページ番号').press('Enter');
    await page.getByLabel('ページ番号').press('Tab');
    await page.locator('.pdf-page[data-page="2"][data-rendered="true"] .textLayer span').first().waitFor();
    await page.evaluate(() => {
      const spans = [...document.querySelectorAll('.pdf-page[data-page="2"] .textLayer span')].filter(n => n.textContent.trim().length > 10);
      const range = document.createRange(); range.setStart(spans[0].firstChild, 0); range.setEnd(spans[3].firstChild, spans[3].firstChild.textContent.length);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    await page.getByRole('button', { name: 'コメントを追加', exact: true }).click();
    await page.getByLabel('コメント本文').fill('複数行にわたる本文への指摘です。');
    await page.getByRole('button', { name: '投稿', exact: true }).click();
    await page.getByText('複数行にわたる本文への指摘です。', { exact: true }).waitFor();
    assert.equal(review.threads[2].anchor.page, 2);
    assert.ok(review.threads[2].anchor.rects.length > 1);
    assert.ok(review.threads[2].anchor.quote.length > 30);
    await page.setViewportSize({ width: 620, height: 900 });
    const panelBox = await page.locator('#comments-panel').boundingBox();
    const pdfBox = await page.locator('#pdf-scroll').boundingBox();
    assert.ok(panelBox.width <= 620 && panelBox.y >= pdfBox.y + pdfBox.height - 2);
    await page.setViewportSize({ width: 1560, height: 1000 });
    await page.locator('.pdf-page[data-page="2"][data-rendered="true"]').waitFor();
    // 状態更新中に生成し直したマーカーも、ACK後には再び操作できる。
    await page.locator('.thread').first().getByRole('button', { name: '返信', exact: true }).click();
    await page.getByLabel('コメント本文').fill('解決・削除後も残す下書き');
    await page.waitForFunction(() => !document.getElementById('comment-body').disabled);
    await page.locator('.thread').last().getByRole('button', { name: '解決', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('comment-body').disabled);
    assert.equal(await page.locator('.comment-marker:disabled').count(), 0);
    assert.equal(draftState.draft.body, '解決・削除後も残す下書き');
    await page.reload();
    await page.getByLabel('コメント本文').waitFor();
    assert.equal(await page.getByLabel('コメント本文').inputValue(), '解決・削除後も残す下書き');
    await page.locator('.thread').nth(1).getByRole('button', { name: '削除', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('comment-body').disabled);
    assert.equal(await page.locator('.comment-marker:disabled').count(), 0);
    assert.equal(draftState.draft.body, '解決・削除後も残す下書き');
    // 返信先そのものの削除でも、本文を同じ範囲の新規コメントとして回収する。
    await page.locator('.thread').first().getByRole('button', { name: '削除', exact: true }).last().click();
    await page.waitForFunction(() => !document.getElementById('comment-body').disabled);
    await page.locator('.thread').first().getByRole('button', { name: '削除', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('comment-body').disabled);
    assert.equal(await page.getByLabel('コメント本文').inputValue(), '解決・削除後も残す下書き');
    assert.equal(await page.locator('#composer-title').textContent(), '新しいコメント');
    await page.reload();
    await page.getByLabel('コメント本文').waitFor();
    assert.equal(await page.getByLabel('コメント本文').inputValue(), '解決・削除後も残す下書き');
    assert.deepEqual(browserErrors, []);
    await fs.mkdir(path.join(root, 'dist'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'dist/review-ui.png'), fullPage: true });
    console.log('PASS: Japanese PDF selection/right-click, literal text, reply/edit, draft reload/discard recovery, zoom geometry, resolution/reopen, reload persistence, region and multi-line page-2 comments, navigation request, enabled markers after resolve/delete, and draft recovery after target deletion.');
  } catch (failure) {
    await fs.mkdir(path.join(root, 'dist'), { recursive: true });
    if (page) {
      await page.screenshot({ path: path.join(root, 'dist/review-ui-failure.png'), fullPage: true });
      console.error('UI failure:', await page.locator('#error').textContent(), 'threads:', review.threads.length, 'browser:', browserErrors);
    }
    throw failure;
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); await fs.rm(scratch, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
