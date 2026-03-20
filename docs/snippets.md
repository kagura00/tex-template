# スニペットガイド

このテンプレートでは、LaTeX ファイル上でプレフィックスを入力し、補完候補を確定するか `Tab` を押すとスニペットを展開できます。
基本設定では、LaTeX ファイルに限って `Tab` でスニペットを展開するようにしています。

## 使い方

1. `.tex` ファイルを開く
2. たとえば `sec` や `fig` などのプレフィックスを入力する
3. 補完候補を選ぶか、そのまま `Tab` を押す
4. カーソルが順番に移動するので、必要な部分を書き換える

## よく使うスニペット

### 見出しと文書構造

| Prefix | 展開内容 | 補足 |
| --- | --- | --- |
| `sec` | `\section{...}` | 節見出し |
| `ssec` | `\subsection{...}` | 小節見出し |
| `sssec` | `\subsubsection{...}` | 小小節見出し |
| `abs` | `abstract` | 通常の要旨 |
| `abs2` | 2 段組み `abstract` | `\end{multicols}` の後で 1 段組みに戻せる例付き |
| `beg` | 任意の `begin/end` | 環境名を自分で指定 |
| `childtex` | `% !TeX root = ...` 付き子ファイル | 分割原稿向け |
| `jpdoc` | 日本語文書ひな型 | `main.tex` 相当の前文を展開 |

### 図表

| Prefix | 展開内容 | 補足 |
| --- | --- | --- |
| `fig` | `figure` | 初期状態は `[H]` |
| `subfig` | `subfigure` | `subcaption` が必要 |
| `tbl` | `table` | 初期状態は `[H]` |
| `btab` | `booktabs` を使う表 | `\toprule` など込み |
| `tab` | `tabular` | 表本体だけ欲しいとき |
| `img` | `\includegraphics` | `images/` 前提の画像挿入 |
| `mini` | `minipage` | 図や表を横並びにしたいとき |

### 数式

| Prefix | 展開内容 | 補足 |
| --- | --- | --- |
| `im` | `\(...\)` | インライン数式 |
| `eq` | `equation` | `\label` 付き |
| `ali` | `align` | 複数行数式 |
| `cases` | `cases` | 場合分け |
| `pmat` | `pmatrix` | 行列 |
| `eqr` | `\eqref{...}` | 数式番号の参照 |

### 参照とリンク

| Prefix | 展開内容 | 補足 |
| --- | --- | --- |
| `ref` | `\ref{...}` | 通常の参照 |
| `cref` | `\cref{...}` | `cleveref` が必要 |
| `cite` | `\cite{...}` | BibTeX 用の引用 |
| `lab` | `\label{...}` | ラベル付け |
| `href` | `\href{URL}{text}` | 任意リンク |
| `url` | `\url{...}` | URL 文字列 |

### 定理・証明

| Prefix | 展開内容 | 補足 |
| --- | --- | --- |
| `thm` | `theorem` | 定理 |
| `lem` | `lemma` | 補題 |
| `prop` | `proposition` | 命題 |
| `cor` | `corollary` | 系 |
| `defi` | `definition` | 定義 |
| `exm` | `example` | 例 |
| `rmk` | `remark` | 注意 |
| `prf` | `proof` | 証明 |

### 本文補助

| Prefix | 展開内容 | 補足 |
| --- | --- | --- |
| `it` | `itemize` | 箇条書き |
| `en` | `enumerate` | 番号付き箇条書き |
| `desc` | `description` | 用語説明 |
| `item` | `\item` | 箇条書き要素 |
| `fn` | `\footnote{...}` | 脚注 |
| `si` | `\SI{...}{...}` | `siunitx` 用 |
| `tt` | `\texttt{...}` | 等幅テキスト |

### コード掲載

| Prefix | 展開内容 | 補足 |
| --- | --- | --- |
| `lst` | `lstlisting` | 既定で使える |
| `mint` | `minted` | `minted` と `shell-escape` が必要 |

## 補足

- `fig`、`tbl`、`btab` は最初から見た目どおりに出やすいよう `[H]` を使っています。
- ページ全体のレイアウトを優先したい場合は、展開後に `[htbp]` や `[t]`、`[b]` へ変更してください。
- `subfig` を使うときは、前文のコメントにある `\usepackage{subcaption}` を有効にします。
- `cref` を使うときは、前文のコメントにある `\usepackage[noabbrev,nameinlink]{cleveref}` を有効にします。
- `mint` を使うときは、前文のコメントにある `\usepackage{minted}` を有効にし、`LuaLaTeX + shell-escape` のレシピを選びます。
