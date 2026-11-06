const vscode = require('vscode');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const model = require('./model.cjs');
const sync = require('./synctex.cjs');
const { html } = require('./html.cjs');
const VIEW = 'texTemplate.pdfReview';

async function readLimited(uri, limit) {
  const stat = await vscode.workspace.fs.stat(uri);
  if (stat.size > limit) throw new Error(`ファイルが上限（${Math.round(limit / 1024 / 1024)} MiB）を超えています。`);
  return Buffer.from(await vscode.workspace.fs.readFile(uri));
}

function activate(context) {
  const sessions = new Map();
  let active;
  const report = error => vscode.window.showErrorMessage(`PDFレビュー: ${error.message}`);
  const defaultAuthor = () => vscode.workspace.getConfiguration('pdfReview').get('author')?.trim() || context.globalState.get('author') || os.userInfo().username;
  const rootFor = uri => vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath || (vscode.workspace.workspaceFolders?.length === 1 ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined);

  async function chooseRoot(uri) {
    const root = rootFor(uri);
    if (root) return root;
    const folders = vscode.workspace.workspaceFolders || [];
    if (!folders.length) throw new Error('TeXへ移動するには、執筆プロジェクトのフォルダーを開いてください。');
    return (await vscode.window.showQuickPick(folders.map(f => ({ label: f.name, root: f.uri.fsPath })), { placeHolder: 'TeX原稿のプロジェクトを選択' }))?.root;
  }

  async function open(resource) {
    if (!(resource instanceof vscode.Uri)) {
      const current = vscode.window.activeTextEditor?.document.uri;
      resource = current && /\.(pdf|pdfreview)$/i.test(current.path) ? current : (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'PDF／レビュー': ['pdf', 'pdfreview'] } }))?.[0];
    }
    if (!resource) return;
    if (/\.pdfreview$/i.test(resource.path)) return vscode.commands.executeCommand('vscode.openWith', resource, VIEW);
    if (!/\.pdf$/i.test(resource.path)) throw new Error('PDFまたは.pdfreviewファイルを選択してください。');
    const pdf = await readLimited(resource, model.MAX_PDF);
    const target = await vscode.window.showSaveDialog({ title: 'PDFとコメントをまとめるレビューの保存先', defaultUri: resource.with({ path: resource.path.replace(/\.pdf$/i, '.pdfreview') }), filters: { 'PDFレビュー': ['pdfreview'] } });
    if (!target) return;
    if (!/\.pdfreview$/i.test(target.path)) throw new Error('拡張子は.pdfreviewにしてください。元のPDFは上書きしません。');
    let exists = false;
    try { await vscode.workspace.fs.stat(target); exists = true; } catch (e) { if (e.code !== 'FileNotFound') throw e; }
    if (exists) {
      const choice = await vscode.window.showInformationMessage('同名のレビューが存在します。既存の内容を開きますか？新しい版は別名で作成してください。', '既存レビューを開く');
      if (choice) return vscode.commands.executeCommand('vscode.openWith', target, VIEW);
      return;
    }
    let snapshot;
    try { snapshot = await sync.snapshot(resource.fsPath, rootFor(resource)); }
    catch (error) { vscode.window.showWarningMessage(`PDFレビュー: SyncTeX情報を取り込めませんでした。PDFコメントは利用できます。${error.message}`); }
    const review = model.create(pdf, path.posix.basename(resource.path), snapshot);
    const content = JSON.stringify(review, null, 2) + '\n';
    if (Buffer.byteLength(content) > model.MAX_REVIEW) throw new Error('レビューの合計が64 MiBを超えています。');
    if (!['file', 'vscode-remote'].includes(target.scheme)) throw new Error('レビューの新規作成はローカル／リモートのファイルシステムに保存してください。');
    await fs.writeFile(target.fsPath, content, { encoding: 'utf8', flag: 'wx' });
    return vscode.commands.executeCommand('vscode.openWith', target, VIEW);
  }

  async function exportReview() {
    const session = active;
    if (!session) throw new Error('レビューを開いてから実行してください。');
    await session.queue;
    model.parse(session.document.getText());
    const target = await vscode.window.showSaveDialog({ title: 'レビューを別名で保存（PDFとコメントを含む）', defaultUri: session.document.uri, filters: { 'PDFレビュー': ['pdfreview'] } });
    if (!target) return;
    if (!/\.pdfreview$/i.test(target.path)) throw new Error('拡張子は.pdfreviewにしてください。');
    if (target.toString() === session.document.uri.toString()) return session.document.save();
    let exists = false;
    try { await vscode.workspace.fs.stat(target); exists = true; } catch (e) { if (e.code !== 'FileNotFound') throw e; }
    if (exists && await vscode.window.showWarningMessage('保存先のレビューを上書きしますか？', { modal: true }, '上書き') !== '上書き') return;
    await vscode.workspace.fs.writeFile(target, Buffer.from(session.document.getText(), 'utf8'));
    vscode.window.showInformationMessage('レビューを保存しました。この.pdfreviewファイルを相手へ渡してください。');
  }

  async function replace(session, review, expectedVersion) {
    const document = session.document;
    const text = JSON.stringify(review, null, 2) + '\n';
    if (Buffer.byteLength(text) > model.MAX_REVIEW) throw new Error('レビューの合計が64 MiBを超えています。');
    if (document.version !== expectedVersion) throw new Error('別の操作で更新されました。表示を確認して再操作してください。');
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
    if (!await vscode.workspace.applyEdit(edit)) throw new Error('コメントの更新を適用できませんでした。');
    if (!await document.save()) throw new Error('保存できませんでした。タブの未保存状態を確認してください。');
  }

  async function navigate(session, message) {
    if (!vscode.workspace.isTrusted) throw new Error('TeXへの移動にはワークスペースの信頼が必要です。');
    let review = model.parse(session.document.getText());
    const thread = review.threads.find(t => t.id === message.threadId);
    if (!thread) throw new Error('コメントが見つかりません。');
    const root = await chooseRoot(session.document.uri);
    if (!root) return;
    if (!review.sync?.inputs.length) {
      const pdfUri = (await vscode.window.showOpenDialog({ title: 'レビューと同じ版のPDFを選択（隣に.synctex.gzが必要）', canSelectMany: false, filters: { PDF: ['pdf'] } }))?.[0];
      if (!pdfUri) return;
      if (model.hash(await readLimited(pdfUri, model.MAX_PDF)) !== review.pdf.sha256) throw new Error('PDFの版が一致しません。レビュー対象と同じPDF・SyncTeX情報を選択してください。');
      const version = session.document.version;
      const snapshot = await sync.snapshot(pdfUri.fsPath, root);
      if (!snapshot?.inputs.length) throw new Error('対応するSyncTeX情報またはワークスペース内の原稿が見つかりません。');
      review = { ...review, sync: snapshot };
      await replace(session, model.validate(review), version);
    }
    const result = await sync.query(review, thread.anchor, vscode.workspace.getConfiguration('pdfReview').get('synctexPath') || 'synctex');
    await sync.safeFile(root, result.path);
    const folder = vscode.workspace.workspaceFolders.find(f => path.resolve(f.uri.fsPath) === path.resolve(root));
    if (!folder) throw new Error('原稿フォルダーが閉じられました。プロジェクトを開き直してください。');
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder.uri, ...result.path.split('/')));
    // 未保存の編集とファイル監視の遅延も含め、実際に表示する同じバッファで照合する。
    const source = doc.getText(), sourceVersion = doc.version;
    const input = review.sync.inputs.find(i => i.path === result.path);
    const location = model.relocate(input, source, result.line);
    let line = location.line;
    if (!['unchanged', 'relocated'].includes(location.kind)) {
      const answer = await vscode.window.showWarningMessage('原稿が変更され、指摘位置を一意に追跡できません。元の行番号付近を開きますか？', '元の行番号付近を開く');
      if (!answer) return;
      line = result.line;
    }
    const range = doc.lineAt(Math.max(0, Math.min(line - 1, doc.lineCount - 1))).range;
    const reviewColumn = session.panel.viewColumn;
    const reusable = session.sourceColumn && session.sourceColumn !== reviewColumn && vscode.window.tabGroups.all.some(g => g.viewColumn === session.sourceColumn);
    const column = reusable ? session.sourceColumn : (reviewColumn && reviewColumn < 9 ? reviewColumn + 1 : vscode.ViewColumn.Beside);
    const editor = await vscode.window.showTextDocument(doc, { viewColumn: column, selection: range, preserveFocus: false });
    session.sourceColumn = editor.viewColumn;
    if (doc.version !== sourceVersion) {
      vscode.window.showWarningMessage('移動中に原稿が更新されました。指摘位置を再確認してください。');
      return;
    }
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    if (location.kind === 'relocated') vscode.window.setStatusBarMessage('PDFレビュー: 周辺の行を照合して移動先を更新しました。', 5000);
  }

  const provider = {
    async resolveCustomTextEditor(document, panel) {
      const session = { document, panel, queue: Promise.resolve() };
      const draftKey = `draft:${document.uri.toString()}`;
      sessions.set(document.uri.toString(), session);
      active = session;
      panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] };
      panel.webview.html = html(panel.webview, context.extensionUri, vscode);
      const sendState = (withDraft = false) => {
        try {
          const review = model.parse(document.getText());
          session.review = review;
          panel.webview.postMessage({ type: 'state', version: document.version, dirty: document.isDirty, author: defaultAuthor(),
            review: { id: review.id, createdAt: review.createdAt, pdf: review.pdf, threads: review.threads, hasSync: Boolean(review.sync?.inputs.length) },
            ...(withDraft ? { draftState: context.globalState.get(draftKey) || null } : {}) });
        } catch (error) { panel.webview.postMessage({ type: 'error', message: `レビューを読み込めません: ${error.message}` }); }
      };
      const listener = vscode.workspace.onDidChangeTextDocument(e => { if (e.document.uri.toString() === document.uri.toString()) sendState(); });
      const saver = vscode.workspace.onDidSaveTextDocument(doc => { if (doc.uri.toString() === document.uri.toString()) sendState(); });
      panel.onDidChangeViewState(() => { if (panel.active) active = session; });
      panel.webview.onDidReceiveMessage(message => {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'ready') return sendState(true);
        if (message.type === 'draft') {
          const value = message.value;
          try {
            if (value !== null) {
              if (value?.reviewId !== session.review?.id || value?.pdfHash !== session.review?.pdf.sha256 ||
                  !['addThread', 'reply', 'editMessage'].includes(value.draft?.type) || typeof value.draft.body !== 'string' ||
                  value.draft.body.length > 20000 || typeof value.author !== 'string' || value.author.length > 100) throw new Error('下書きの形式が不正です。');
              if (value.draft.type === 'addThread') model.validateAnchor(value.draft.anchor);
              else if (!session.review.threads.some(t => t.id === value.draft.threadId)) throw new Error('下書きの返信先が見つかりません。');
            }
            context.globalState.update(draftKey, value || undefined).catch(error => {
              panel.webview.postMessage({ type: 'error', message: `下書きを保存できません。画面を閉じる前に投稿してください: ${error.message}` });
            });
          } catch (error) { panel.webview.postMessage({ type: 'error', message: error.message }); }
          return;
        }
        session.queue = session.queue.then(async () => {
          try {
            if (message.type === 'operation') {
              if (document.version !== message.version) throw new Error('レビューが更新されました。最新の表示を確認して再操作してください。');
              const author = message.author;
              if (typeof author !== 'string' || !author.trim() || author.length > 100) throw new Error('表示名を入力してください。');
              if (message.operation?.type === 'deleteMessage' && await vscode.window.showWarningMessage('このコメントを削除しますか？', { modal: true }, '削除') !== '削除') {
                panel.webview.postMessage({ type: 'ack', requestId: message.requestId, canceled: true }); return;
              }
              const next = model.applyOperation(model.parse(document.getText()), message.operation, author);
              await replace(session, next, message.version);
              try {
                await context.globalState.update(draftKey, undefined);
                await context.globalState.update('author', author.trim());
              } catch (error) {
                vscode.window.showWarningMessage(`コメントはレビューに保存済みですが、ローカルの下書き・表示名設定を更新できませんでした: ${error.message}`);
              }
            } else if (message.type === 'navigate') await navigate(session, message);
            else return;
            panel.webview.postMessage({ type: 'ack', requestId: message.requestId });
          } catch (error) {
            panel.webview.postMessage({ type: 'ack', requestId: message.requestId, error: error.message });
            sendState();
            report(error);
          }
        }).catch(report);
      });
      panel.onDidDispose(() => { listener.dispose(); saver.dispose(); sessions.delete(document.uri.toString()); if (active === session) active = undefined; });
    }
  };
  context.subscriptions.push(vscode.window.registerCustomEditorProvider(VIEW, provider, { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: false }));
  context.subscriptions.push(vscode.commands.registerCommand('pdfReview.open', uri => open(uri).catch(report)));
  context.subscriptions.push(vscode.commands.registerCommand('pdfReview.export', () => exportReview().catch(report)));
}

module.exports = { activate };
