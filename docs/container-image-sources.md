# Dockerイメージの取得元

2026-11-06確認。定義の正本は [.devcontainer/Dockerfile](../.devcontainer/Dockerfile)。

このリポジトリは完成済みの独自イメージをレジストリから取得するのではなく、2つの公開イメージと公式配布物から利用者のPCで最終イメージを構築する。Dev Containersが作成する `vsc-tex-template-...` は、そのローカルイメージの名前である。CIでも同じDockerfileから `tex-template-ci` を構築する。

## OSの土台

- レジストリ: Docker Hub、`docker.io/library/debian`
- タグ: `trixie-slim`（Debian 13）
- 固定digest: `sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2`
- 区分: Docker Official Image。Debian Developersがメンテナンス。
- 公開情報: [Docker Hub](https://hub.docker.com/_/debian)、[イメージ生成元](https://github.com/debuerreotype/docker-debian-artifacts)

このdigestのamd64マニフェストは `sha256:7378260c0a098d27ac206225db5e7d92b8c7c84ea7afccc86eeb513756bbd392`。公開マニフェストは2026-11-04作成、生成元revision `373f61a386722a989c79f0c11f23fcf379b56e94` を記録している。

構築時にはDebianのHTTPS APTリポジトリからstable/securityの更新と補助パッケージを適用する。そのため、FROMのdigest固定はOSの初期イメージを固定するものであり、APTを含む最終環境の完全なバイト一致を保証するものではない。

## TeX Liveの取得元

- レジストリ: Docker Hub、`docker.io/texlive/texlive`
- タグ: `latest`。ただし実際の取得内容は下記digestに固定。
- 固定digest: `sha256:07e8062637249c4f780ca59f42cc2ed592bc2dc1db4320769406aee3f98aa70e`
- 区分: Island of TeXによるTeX Live向けのコミュニティイメージ。DebianのDocker Official Imageとは区分が異なる。
- 公開情報: [Docker Hub](https://hub.docker.com/r/texlive/texlive/)、[提供者の説明](https://islandoftex.gitlab.io/community/projects/docker/)、[Dockerfile・構築元](https://gitlab.com/islandoftex/images/texlive)
- 提供者の別レジストリ: `registry.gitlab.com/islandoftex/images/texlive`。このリポジトリのDockerfileが実際に参照しているのはDocker Hub側。

このdigestのamd64マニフェストは `sha256:97bde4bd80e73a697bcccdd626966a484f528e3f60c773b5c74cd7b8104c42fe`、arm64は `sha256:5219d725856d0e7f32335ef372732d24616caad7ad51c84755c67e98acefa673`。

TeX Live 2026の `/usr/local/texlive/2026` とCA証明書を取得し、Debianの最終ステージへコピーする。TeX Liveのマクロ・フォントはfull schemeをもとにし、documentation/sourceとJava用JARは含めない。元のTeXイメージのOS全体を最終環境として使う構成ではない。通常起動時に `tlmgr update` は実行しない。

## 追加の取得元

- Node.js 24.22.2: `https://nodejs.org/dist/v24.22.2/` の公式Linuxバイナリ。amd64/arm64別のSHA-256をDockerfile内で照合する。
- npm 12.2.2およびtextlint関連: npmレジストリ。textlint関連の推移依存とintegrityは `.devcontainer/package-lock.json` で固定。
- PDFレビュー拡張: コンテナ接続時にリポジトリ内のソースから構築する。依存は `extensions/pdf-review/package-lock.json` で固定し、作成した未公開VSIXをコンテナ側のVS Code Serverへ導入する。
- その他のVS Code拡張: `.devcontainer/devcontainer.json` に列挙したMarketplaceの拡張を接続時に導入する。これらはDockerイメージのFROMやnpm lockfileの固定対象とは別である。

digestは取得するイメージの同一性を固定するもので、脆弱性がないことや提供者の署名を検証したことを意味しない。更新後の受入れは、公式修正の適用方針とCIの機能・セキュリティ検査で確認する。
