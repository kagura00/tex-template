# tex-template-devcontainer

VS Code の Dev Container 環境で LaTeX 原稿を書くためのテンプレートです。
このテンプレートから作成した自分のリポジトリ、または ZIP 展開したフォルダを開いてコンテナに入り、`main.tex` を保存すれば、そのまま `out/` に PDF が出力されます。

初期状態では LuaLaTeX を前提にしています。`textlint`、`chktex`、`latexindent`、PDF プレビュー、各種スニペットもあわせて使えるようにしてあります。
Docker と VS Code が動く環境であれば、Windows、macOS、Linux のいずれでも使えます。

## クイックスタート

1. 公開してもよい原稿なら `Use this template`、GitHub に上げたくない原稿なら `Code > Download ZIP` を使う
2. 取得したフォルダを VS Code で開く
3. `Dev Containers: Reopen in Container` を実行する
4. `main.tex` を保存する
5. `LaTeX Workshop: View LaTeX PDF` で PDF を開く

初回のみコンテナ作成に時間がかかります。細かい補足は下の `導入` を見てください。

## 想定している使い方

- Docker と VS Code が動く Windows、macOS、Linux 環境で使う
- ホスト側には `Dev Containers` 拡張機能を入れておく
- 原稿はコンテナ内で編集し、保存時の自動ビルドで進める
- 章ごとにファイルを分ける場合も、基本は `main.tex` をルートにして管理する

## 導入

### 必要なもの

- Docker
  Windows では通常 `Docker Desktop` を入れておけばよいです。
  macOS でも `Docker Desktop` が一般的です。Linux では Docker Engine を使っても構いません。
- VS Code
- VS Code 拡張 `Dev Containers`

GitHub アカウントは、`Use this template` で自分用リポジトリを作る場合に使います。
ZIP で使うだけなら必須ではありません。

作成したリポジトリ、または ZIP 展開後のフォルダを VS Code で開くと、`.vscode/extensions.json` に基づいて推奨拡張の案内が表示されることがあります。
すでにインストール済みなら特に何も出ないこともあります。
ホスト側で必須なのは `Dev Containers` です。LaTeX 関連の拡張はコンテナ側に入ります。
このテンプレートをそのまま使うだけなら、ホスト側の `TeX Live` や `LaTeX Workshop` は基本的に不要です。

### 初回起動

使い方は 2 通りあります。

- 公開してもよい原稿や、テンプレートから自分用リポジトリを作って使いたい場合
  `Use this template` を使うのが扱いやすく、upstream との関係を残したい場合だけ fork を使えば十分です。
- 卒論・修論・投稿前原稿など、GitHub に上げたくない内容を書く場合
  GitHub 上で自分用リポジトリを作らず、このテンプレートを `Code > Download ZIP` でダウンロードして使う方が安全です。
  ZIP 展開後のフォルダには Git 履歴や remote 設定が含まれないため、誤って push するリスクを減らせます。

> [!CAUTION]
> 卒論・修論・投稿前原稿など、公開前提でない内容は GitHub 上の自分用リポジトリで書き始めない方が安全です。
> 誤って push するのを避けたい場合は、`Use this template` ではなく `Code > Download ZIP` を使ってください。

通常の使い方は次のとおりです。

1. GitHub で `Use this template` を使って自分用リポジトリを作る
2. 作成した自分のリポジトリをクローンする
3. VS Code でそのフォルダを開く
4. コマンドパレットから `Dev Containers: Reopen in Container` を実行する
5. コンテナの作成が終わるまで待つ（初回のみ時間がかかる）
6. `main.tex` を開いて保存する
7. `LaTeX Workshop: View LaTeX PDF` で PDF を開く

GitHub に上げたくない原稿では、上の 1. と 2. の代わりに `Code > Download ZIP` で取得し、展開したフォルダを VS Code で開いてください。

初回は TeX Live と Node.js を含むコンテナを組み立てるため、少し時間がかかります。
いったん作成できれば、その後の執筆作業は基本的にローカル環境だけで進められます。
また、初回ビルド直後は VS Code や拡張の状態によって PDF ビューアやサイドバーに出力がすぐ反映されないことがあります。
その場合は `Developer: Reload Window` を一度実行してください。

### どのウィンドウで作業するか

- 普段の執筆とビルドは、`Dev Containers: Reopen in Container` 後のウィンドウで行います
- LaTeX のログやエラーに `/workspaces/...` が出ていれば、コンテナ側で動いています
- `C:\texlive\...` や `D:\...` のような Windows パスが出ていれば、ホスト側 TeX が反応しています
  macOS や Linux でも同様に、ホスト側のパスが出ている場合はコンテナ外の TeX が反応しています。
- `Codex` や Git 操作のためにホスト側ウィンドウを開くことはできますが、その場合の LaTeX 診断はこのテンプレート本来の実行結果ではありません

## 普段の使い方

### まず触るファイル

主に操作するファイルは、次の 4 つです。

- `main.tex`: 本文を書く中心ファイル
- `references.bib`: 文献データ
- `images/`: 図や写真の置き場
- `docs/snippets.md`: スニペットの早見表

`.devcontainer/`、`.vscode/`、`.latexmkrc`、`.textlintrc.js` などは設定ファイルです。
普段の執筆では毎回触る必要はありません。

### 単一ファイルで書く

- `main.tex` を編集して保存(ctrlキー + S)すると、自動でビルドが走ります
- PDF は `out/`、補助ファイルやログは `aux/` に出力されます
- SyncTeX 用の `*.synctex.gz` は PDF と同じ `out/` に置かれます
- PDF は VS Code のタブで開けます
- ソースと PDF の相互ジャンプも使えます
- 参考文献を更新したときも、通常は `latexmk` が BibTeX まで自動で回します
- サンプル本文と既定の校正方針は `，` と `．` を前提にしています。句点を変えたい場合は `.textlintrc.js` の `periodMark` を調整してください
- `out/main.pdf` は初期状態のサンプル PDF として追跡しています。本文を書き始めるとこのファイルが更新されます

初期の `main.tex` は `ltjsarticle` を使った最小構成です。
日本語文書を LuaLaTeX で書き始めるための土台として置いてあります。
数式、表、図、リンク、簡単なコード掲載に必要なパッケージに加え、定理環境、単位表記、要旨用の `multicol` も既定で入れています。
また、`images/sample.drawio.png` を同梱しているため、図の挿入例や Draw.io 拡張の確認にもそのまま使えます。
`main.tex` には、要旨だけ 2 段組みにする例、図表見出し名や定理環境名を書き換える例も入れてあります。
さらに、図表・定理・コード・文献参照の最小例をそのまま載せているので、サンプルを削りながら本文へ置き換えていく使い方ができます。
図表はソースの順に確認しやすいよう、`float` パッケージを既定で読み込み、初期状態では `[H]` を使う方針にしています。
レイアウトの最適化を優先したくなったら、各 `figure` / `table` の配置指定を `[htbp]` などへ変更してください。

### 参考文献を使う

- 初期状態の `main.tex` は `references.bib` を使う前提です
- 本文では `\cite{...}` を使い、末尾で `\bibliography{references}` を読み込みます
- このテンプレートでは `BibTeX + upbibtex` を使う前提で設定しています
- 文献を追加するときは `references.bib` に追記してください

現時点の `main.tex` と `references.bib` には、最小限の例を入れてあります。

### 複数ファイルに分けて書く

`main.tex` をルートにして、本文を `\input{...}` や `\include{...}` で分割できます。
保存時の自動ビルドは LaTeX Workshop が検出したルートファイルに対して実行されるため、通常は子ファイルを保存しても `main.tex` 側がビルドされます。

たとえば次のようにフォルダを分けると管理しやすくなります。

```text
.
|-- main.tex
|-- references.bib
|-- images/
|   `-- experiment/
|       `-- setup.png
`-- sections/
    |-- intro.tex
    |-- method.tex
    `-- conclusion.tex
```

この場合、`main.tex` では次のように読み込みます。

```tex
\input{sections/intro}
\input{sections/method}
\input{sections/conclusion}
```

画像も、たとえば `images/experiment/setup.png` を置いたなら、
`\includegraphics{experiment/setup.png}` のように `images/` からの相対パスで書けます。

子ファイルだけを先に開く運用では、先頭に次のようなコメントを入れておくとルート判定が安定します。

```tex
% !TeX root = ../main.tex
```

この用途向けに `childtex` スニペットを用意してあります。
ルートファイル名を `main.tex` 以外に変える場合も、各子ファイルに `% !TeX root = ...` を書けば同じ運用で使えます。

## 発展的な使い方

### 手動ビルド

通常は保存時の自動ビルドだけで足りますが、VS Code のタスクから手動実行もできます。

- `LaTeX: Build (LuaLaTeX)`
- `LaTeX: Build (LuaLaTeX + shell-escape)`
- `LaTeX: Build (upLaTeX + dvipdfmx)`
- `LaTeX: Build (pLaTeX + dvipdfmx)`
- `LaTeX: Clean`

これらのタスクは、次の順で対象ファイルを決めます。

1. アクティブファイル先頭の `% !TeX root = ...`
2. アクティブファイル自身に `\documentclass` があればそのファイル
3. 祖先ディレクトリを近い方からたどり、そのディレクトリに `main.tex` があればそれ
4. `main.tex` が無ければ、そのディレクトリ内で `\documentclass` を持つ唯一の `.tex`
5. それも見つからない場合はアクティブファイル自身

そのため、子ファイルを開いたままでも、`main.tex` をルートにしたまま手動ビルドできます。
また、ルートファイル名を `main.tex` 以外に変えていても、近いディレクトリ内でルート候補が 1 つだけならそのまま拾えます。
`LaTeX: Clean` は `out/` の PDF と `*.synctex.gz` を残し、`aux/` の補助ファイルだけを片付けます。

### エンジン切り替え

利用できるレシピは次の 4 つです。

- `latexmk (LuaLaTeX)`
- `latexmk (LuaLaTeX + shell-escape)`
- `latexmk (upLaTeX + dvipdfmx)`
- `latexmk (pLaTeX + dvipdfmx)`

レシピの切り替えは `LaTeX Workshop: Build with recipe` から行います。
一度選んだレシピは、その後の自動ビルドでも使われます。

ただし、配布時点の `main.tex` は LuaLaTeX 用です。
`upLaTeX` や `pLaTeX` に切り替える場合は、レシピだけでなく `\documentclass` や関連パッケージもそのエンジン向けに変更してください。

### 外部で作った表紙 PDF を先頭に入れる

Word などで表紙だけを別に作り、PDF として 1 ページ目へ差し込みたい場合もあります。
その場合は、たとえば `images/titlepage.pdf` を置き、`main.tex` 側で次のように設定します。

1. `images/titlepage.pdf` のように表紙 PDF を配置する
2. `\begin{document}` の直後に `\includepdf[pages=1]{images/titlepage.pdf}` を入れる
3. 外部表紙で `\maketitle` を置き換えるなら、`\maketitle` はコメントアウトする

最小例は次のとおりです。

```tex
\begin{document}
\includepdf[pages=1]{images/titlepage.pdf}
% \maketitle
```

表紙 PDF が複数ページある場合は、`pages=1` の代わりに `pages=-` を使えば全ページをまとめて挿入できます。

## 入っている機能

- 保存時の自動ビルド
- `out/` への PDF 出力
- `aux/` への補助ファイル集約
- PDF プレビューと SyncTeX
- `latexindent` による整形
- `chktex` による LaTeX の lint
- `textlint` による日本語校正
- `Error Lens` による診断表示
- `references.bib` を使った BibTeX 管理
- 定理環境と `siunitx` の初期設定
- `listings` によるコード掲載の初期設定
- 図表見出し名を変えるためのコメント付き例
- LaTeX 用スニペット

既定の `textlint` は、論文でよく使う `，` と `．` を前提にしています。

コンテナに同梱している拡張は次のとおりです。

- `james-yu.latex-workshop`
- `3w36zj6.textlint`
- `hediet.vscode-drawio`
- `usernamehw.errorlens`

`Codex` のように個人のログイン情報を扱う拡張は同梱していません。
必要な場合は利用者ごとにコンテナ内へ追加してください。

個人用の拡張をコンテナ内に追加した場合、その拡張本体や状態は `Rebuild Container` 後も残ることがあります。
このテンプレートでは `/home/texlive/.vscode-server/extensions` と `/home/texlive/.vscode-server/data` を Docker の named volume に分けて保持しているためです。

ただし、これらの volume はリポジトリの管理対象外であり、通常の `git add` や GitHub への push には含まれません。
そのため、`Codex` などへログインした状態でも、その認証情報がこのリポジトリ経由でそのまま公開されるわけではありません。

一方で、同じ PC を別の人が使う場合や、Docker volume ごと引き継ぐ場合は状態が残ります。
個人用拡張を使った後に状態を消したい場合は、拡張側で sign out したうえで、必要に応じて次を削除してください。

- `tex-template-vscode-server-data`
- `tex-template-vscode-server-extensions`

### 補助ツールについて

ベースイメージには、TeX Live 本体に加えて `Perl`、`Python`、`Pygments`、`Java` などの補助ツールも入っています。
これらは LaTeX 関連ツールの実行に使うためのもので、基本的に追加の VS Code 拡張は必要ありません。

- `Perl`: `latexmk`、`upbibtex`、`biber`、`xindy` などが内部で使用します
- `Python` と `Pygments`: `minted` などのコードハイライト系パッケージで使用できます
- `Java`: `arara` を使う場合に必要です
- `ripgrep`: コンテナ内でログや本文を検索するときに使えます
- `poppler-utils`: `pdftotext` や `pdfinfo` で PDF の確認に使えます

ただし、このテンプレートの既定設定では次の点に注意してください。

- `minted` を使う場合は、`\usepackage{minted}` を追加し、`latexmk (LuaLaTeX + shell-escape)` か `LaTeX: Build (LuaLaTeX + shell-escape)` を使ってください
- `arara` はコマンド自体は入っていますが、専用レシピやタスクは同梱していません。使う場合は各自で追加してください

## スニペット

LaTeX ファイルでプレフィックスを入力し、補完候補を確定するか `Tab` を押すとスニペットを展開できます。
定義本体は [`.vscode/latex.code-snippets`](./.vscode/latex.code-snippets) にあり、一覧と補足は [docs/snippets.md](./docs/snippets.md) にまとめています。

README では、最初によく使うものだけ挙げます。

- 見出し: `sec`、`ssec`、`sssec`
- 図表: `fig`、`tbl`、`btab`、`img`
- 数式: `eq`、`ali`、`eqr`、`im`
- 参照: `ref`、`cite`、`lab`
- 定理: `thm`、`lem`、`prop`、`defi`、`prf`
- ひな型: `jpdoc`、`childtex`

詳細な一覧を確認したいときは `docs/snippets.md` を見てください。

## ディレクトリ構成

主要なファイルだけ挙げると、構成は次のとおりです。

```text
.
|-- .devcontainer/
|   |-- devcontainer.json
|   |-- Dockerfile
|   |-- prepareWorkspace.sh
|   `-- postCreate.sh
|-- docs/
|   `-- snippets.md
|-- .vscode/
|   |-- extensions.json
|   |-- latex.code-snippets
|   |-- latex-task.sh
|   |-- settings.json
|   `-- tasks.json
|-- .editorconfig
|-- .latexmkrc
|-- LICENSE
|-- .textlintignore
|-- .textlintrc.js
|-- references.bib
|-- aux/
|-- images/
|-- out/
`-- main.tex
```

それぞれの役割は次のとおりです。

- `main.tex`: 執筆開始用のサンプル文書
- `.latexmkrc`: `latexmk` の共通設定
- `LICENSE`: このテンプレート自体のライセンス。作成する文書へ自動で適用されるものではない
- `.textlintrc.js`: `textlint` のルール
- `.textlintignore`: `textlint` から除外するパス
- `references.bib`: 参考文献データ
- `.vscode/settings.json`: LaTeX Workshop などのワークスペース設定
- `.vscode/tasks.json`: 手動ビルドとクリーンのタスク
- `.vscode/latex-task.sh`: 手動タスク実行時の root 解決
- `.vscode/latex.code-snippets`: スニペット定義
- `docs/snippets.md`: スニペットの日本語ガイド
- `.devcontainer/`: コンテナの構成
- `aux/`: 補助ファイルとログの出力先
- `images/`: 画像置き場。`sample.drawio.png` を編集例として同梱
- `out/`: PDF と SyncTeX ファイルの出力先

## オフライン利用

初回のコンテナ作成にはネットワークが必要です。
この段階では、`texlive/texlive` ベースイメージの取得、`apt-get`、Node.js の取得、`npm` パッケージの取得、VS Code 拡張の初回インストールが発生します。
ベースイメージは `texlive/texlive` の full scheme をもとにしつつ、documentation/source は含めず、リポジトリ側では digest を固定して使っています。
初回のインストール作業は時間がかかりますが、次回以降は早くなります。

一方、初回起動が一度成功した後は、次の作業はオフラインでも実行できます。

- 既存コンテナの起動
- `.tex` の編集
- 保存時の自動ビルド
- PDF プレビュー
- `latexindent`
- `chktex`
- `textlint`
- 手動ビルドとクリーン

ただし、イメージや volume を削除した場合、Dockerfile を変えて再取得が必要になった場合、新しい PC で使う場合は、再びネットワークが必要です。

## トラブルシューティング

### PDF が更新されない

- `LaTeX Workshop: View LaTeX PDF` で開き直す
- ファイルの変更が一度に多い場合、自動では最新状態へ切り替わらないことがあるため、いったん PDF タブを開き直して最新状態に更新する
- `Developer: Reload Window` を実行する
- 初回ビルド直後に PDF がサイドバーやビューアに出ない場合も、まずは `Developer: Reload Window` を試す

### `textlint` が効かない

- `.devcontainer/` 配下を変えた後は `Dev Containers: Rebuild Container` を実行する
- ターミナルで `textlint main.tex` が通るか確認する
- `Code.exe ENOENT` のようなエラーが出る場合は、`textlint` 拡張がホスト側で動いている可能性があるため、コンテナ側で開き直す

### `C:\texlive\...` のログが出る

- そのログはホスト側 Windows の TeX 環境です
- このテンプレートの本来のビルドはコンテナ側で行うため、まず `Dev Containers: Reopen in Container` 後のウィンドウで作業しているか確認する
- `Codex` などの都合でホスト側ウィンドウを開いている場合は、ホスト側 `LaTeX Workshop` の診断は無視して構いません
- コンテナ側のログは `/workspaces/...` のパスになります

### Dev Container を開けない

- Docker Desktop などの Docker 本体が起動しているか確認する
- `docker ps` がエラーなく実行できるか確認する
- Windows では Docker Desktop の起動直後は安定するまで少し待ってから `Dev Containers: Reopen in Container` をやり直す
- Docker を再起動した後も改善しない場合は、VS Code 側で `Developer: Reload Window` を試す

### `aux/tmp1.tmp` や `lualatex*.fls: Permission denied` が出る

- `.devcontainer/` 配下を更新した後は `Dev Containers: Rebuild Container` を実行する
- 更新後のコンテナでは起動時に `.devcontainer/prepareWorkspace.sh` で権限を整える

### コンテナ内 Git が大量の差分を出す

- まず `Dev Containers: Rebuild Container` を実行する
- このテンプレートは初回作成時に `safe.directory` と `core.filemode=false` を設定するため、古いコンテナでは再作成で直ることがある
- それでも直らない場合は、コンテナ内ターミナルで `git config --global --add safe.directory "$(pwd)"` と `git config core.filemode false` を確認する

### エンジンを切り替えたらビルドできない

- レシピだけでなく、`\documentclass` と関連パッケージがそのエンジンに合っているか確認する
- 配布時点の `main.tex` は LuaLaTeX 向けである点に注意する

## カスタマイズする場所

- ビルドの挙動を変える: `.vscode/settings.json`
- `latexmk` の共通設定を変える: `.latexmkrc`
- 参考文献を追加する: `references.bib`
- `textlint` のルールを変える: `.textlintrc.js`
- スニペットを増やす: `.vscode/latex.code-snippets`
- ベースイメージを更新する: `.devcontainer/Dockerfile`

ベースイメージは週次更新される `texlive/texlive` を元にしていますが、このテンプレートでは再現性を優先して digest を固定しています。
TeX Live や同梱パッケージを更新したい場合は、`.devcontainer/Dockerfile` の `FROM` 行を更新し、`Dev Containers: Rebuild Container` で動作確認してください。
