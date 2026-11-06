const crypto = require('node:crypto');

function html(webview, extensionUri, vscode) {
  const asset = file => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', file)).toString();
  const nonce = crypto.randomBytes(24).toString('base64');
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}' 'wasm-unsafe-eval'; worker-src ${webview.cspSource} blob:; connect-src ${webview.cspSource} blob:;">
<link rel="stylesheet" href="${asset('pdfjs/web/pdf_viewer.css')}">
<link rel="stylesheet" href="${asset('review.css')}"><title>PDFレビュー</title></head>
<body><div id="app" aria-busy="true">
<header class="toolbar">
  <strong id="document-name">PDFレビュー</strong>
  <label>ページ <input id="page-number" aria-label="ページ番号" type="number" min="1" value="1"></label><span id="page-count">/ —</span>
  <button id="zoom-out" aria-label="縮小">−</button><span id="zoom-label">100%</span><button id="zoom-in" aria-label="拡大">＋</button>
  <button id="region-mode" aria-pressed="false">図表の範囲指定</button>
  <button id="add-comment">コメントを追加</button>
  <button id="toggle-comments" aria-expanded="true">コメント <span id="open-count">0</span></button>
</header>
<div id="notice" role="status">レビュー対象は保存したPDFの版です。元のPDFを再ビルドしても変わりません。</div>
<div id="error" role="alert" hidden></div>
<main><section id="pdf-scroll" aria-label="レビュー対象PDF"><div id="pages"></div><p id="loading">PDFを読み込んでいます…</p></section>
<aside id="comments-panel" aria-label="コメント">
  <div class="panel-heading"><h2>コメント</h2><label><input id="show-resolved" type="checkbox">解決済みも表示</label></div>
  <label class="author-label">表示名 <input id="author" maxlength="100" autocomplete="off"></label>
  <div id="threads" aria-live="polite"></div>
  <form id="composer" hidden><strong id="composer-title">新しいコメント</strong><blockquote id="selection-quote"></blockquote>
    <label for="comment-body">コメント本文</label><textarea id="comment-body" maxlength="20000" rows="5" required></textarea>
    <div class="actions"><button id="submit-comment" type="submit">投稿</button><button id="cancel-comment" type="button">キャンセル</button></div>
  </form>
</aside></main>
<footer id="save-status" role="status">読み込み中</footer>
<div id="context-menu" role="menu" hidden><button id="context-add" role="menuitem">コメントを追加</button></div>
<dialog id="discard-dialog"><form method="dialog"><p>入力中のコメントを破棄しますか？</p><div class="actions"><button value="keep">入力を続ける</button><button value="discard">破棄する</button></div></form></dialog>
</div><script nonce="${nonce}" type="module" src="${asset('review.mjs')}"></script></body></html>`;
}
module.exports = { html };
