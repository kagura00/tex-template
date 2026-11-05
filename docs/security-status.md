# セキュリティ検証と残存課題

2026-11-06 の機能復旧後の記録。現在値は週次 CI と最新の勧告で再確認する。

## 更新方針

ローカルでの利用を前提とし、公式に提供された修正のみを適用する。
OS は Debian stable/security、Node.js と npm 依存は公式リリースを使用し、独自の脆弱性修正パッチや Debian testing/unstable のライブラリ混在は行わない。
公式修正版が未提供の指摘は記録・表示を続け、提供された後に適用する。
変更の受入れは、機能・コンテナ移行の検証成功と、公式修正版のある High/Critical が残っていないことを基準とする。

## 更新と検証

- Debian 13 stable/security と digest 固定の TeX Live 2026 を使用。
- Node.js 24.22.2、npm 12.2.2。npm の glob/minimatch も lock 済みの修正版を共有する。
- npm lockfile 監査: 指摘 0 件。npm CLI の実インストール操作も検証。
- Trivy 0.76.2 の完成イメージ検査: Critical 1 件、High 104 件、修正版のある High/Critical 0 件。
- 原稿の lint、LuaLaTeX/BibTeX、Git 履歴なしの ZIP 相当ビルドを検証。
- 外部 root、循環 root、出力先 symlink を拒否。sudo は出力先準備だけに限定。
- Java ランタイムと JAR を除外。Java 補助ツールはサポートしない。
- ヘッドレス環境のため X11 の外部 DVI ビューア `xdvi-xaw` は対象外。共有ライブラリの検査もこのバイナリを除外する。
- Asymptote、gnuplot、zip/unzip、tidy、EPUB と XeLaTeX のフォント名指定を復旧。
- `.devcontainer/test-features.cjs` の 22 項目を非 root・ネットワークなしで検証。LuaLaTeX/BibTeX、日本語 pLaTeX/upLaTeX、Biber、minted、latexindent、SyncTeX、PDF 画像化、索引、EPS/DVI 変換、HTML/EPUB、作図、Clean を含む。
- 暗黙に選択した親の `main.tex` にも、実体パスと magic root の制限を適用。外部 symlink / magic root の拒否と、内部 root の正常解決を検証。
- postCreate、ZIP 相当ビルド、npm 実インストールと監査、Node.js の公開済み修正リリース・サポート期限の検査を再実行。

## 機能復旧に伴う追加指摘

Asymptote の共有ライブラリを復旧すると、`libglut3.12 -> libgl1 -> libglx0 -> libglx-mesa0 -> mesa-libgallium -> libllvm19 -> libxml2` が導入される。
これにより libxml2 の Critical 1 件と High 7 件、libxi6 の High 2 件、および libx11-xcb1 の High 1 件が増えた。
Debian stable/security と公式 trixie-backports の候補を確認したが、この libxml2 を解消する更新は未提供だった。

Critical の `CVE-2026-6653` は、細工した XML の解析時に発生する use-after-free に関する指摘。
[Debian の勧告](https://security-tracker.debian.org/tracker/CVE-2026-6653) は trixie を vulnerable、扱いを `no-dsa (Minor issue)` とし、説明はサービス拒否としている。
これはスキャナーの Critical 指摘を無効化する根拠や、無害・到達不能の証明ではない。
新しい libxml2 は Debian unstable/testing にあるが、共有ライブラリの ABI が異なるため、stable のパッケージへ混在させたり互換 symlink で置換したりしない。

機能テストと既存の「修正版のある High/Critical を拒否する」基準は通るが、脆弱性が解消した状態とは判断できない。
特に信頼できない原稿・XML を扱う用途の安全性は保証しない。
CI は未修正分も含む全 High/Critical を JSON で取得し、`check-image-security.cjs` が件数・Critical・CVE 一覧をジョブサマリーに表示してから修正版の有無を判定する。
実レポートの集計、サマリーファイルへの書込み、修正版ありを模したレポートと不正なレポートの拒否もローカルで確認した。
GitHub Actions の実行結果は、対応するコミットの Checks を参照する。

## 既存コンテナの置換検証

Dev Containers CLI で実際の既存コンテナを修正版へ置換し、postCreate と postStart の成功を確認した。
ホストの原稿フォルダーと既存の VS Code 用ボリュームを引き継ぎ、拡張 10,074 ファイル・設定等 183 ファイルの内容ハッシュは置換前後で一致した。
置換後の実コンテナでも、非 root の `texlive` ユーザーで 22 項目の機能テストと Node.js 検査が成功した。
停止後の再起動でも同じコンテナが選択され、postStart が成功した。arm64 と VS Code の画面操作は今回の確認範囲に含まない。

## 修正版未提供の指摘

Debian 13 の High/Critical 指摘は 38 種類の CVE、パッケージ別の重複を含めると 105 件。
復旧前の同日・同じ DB による比較検査は High 94 件、Critical 0 件、28 種類の CVE だった。
これは修正版が Debian 13 に未提供というスキャナーの判定であり、無害・到達不能という判定ではない。
CI のゲートは、全指摘のうち `FixedVersion` のある High/Critical で失敗する。従来の `ignore-unfixed: true` と同じ拒否基準を保ち、未修正分も可視化する。
修正版が公開された後は、ベース更新とキャッシュなしの再ビルドで適用する。
この記録の件数を現在値として流用しないこと。

```text
CVE-2026-76642 CVE-2026-78408 CVE-2026-78409 CVE-2026-78410
CVE-2026-12064 CVE-2026-8458 CVE-2026-24882 CVE-2026-54369
CVE-2026-34980 CVE-2026-55453 CVE-2026-113351 CVE-2026-117610
CVE-2026-118370 CVE-2025-69720 CVE-2026-9538 CVE-2026-15308
CVE-2026-19445 CVE-2026-19553 CVE-2026-7210 CVE-2026-82049
CVE-2026-119373 CVE-2026-16742 CVE-2026-36849 CVE-2026-52490
CVE-2026-88806 CVE-2026-88807 CVE-2026-96512 CVE-2026-76844
CVE-2026-109089 CVE-2026-109090 CVE-2026-6653 CVE-2026-74860
CVE-2026-86138 CVE-2026-86139 CVE-2026-86140 CVE-2026-86142
CVE-2026-86143 CVE-2026-86144
```

## 運用上の制限

TeX、latexmk の設定、textlint の設定・プラグインはコードを実行できる。
信頼できない入力のための安全なサンドボックスとは扱わない。
既存コンテナには更新が自動適用されないため、VS Code で Rebuild Container を実行する。
拡張の更新とホスト側 Docker/VS Code/Git の更新は、リポジトリの lockfile の管理外。
arm64 用の構成を含むが、今回の実行検証は amd64 のみ。
