#!/usr/bin/env bash
set -eu

# 初回作成時に自動実行される準備スクリプト。
# ワークスペースの権限調整と Git の安定化は共通処理へ切り出す。
#
# devcontainer.json 側で waitFor=postCreateCommand を指定しているため、
# VS Code はこの処理が終わってから接続される。

bash .devcontainer/prepareWorkspace.sh

# VS Code Server 用ディレクトリは Dockerfile 側で事前に作成しているが、
# volume 初期化直後でも空ディレクトリとして使えるようここでも揃えておく。
mkdir -p "${HOME}/.vscode-server/extensions" "${HOME}/.vscode-server/data"

# LuaLaTeX 既定のテンプレートなので、初回ビルド時に走る
# フォントキャッシュ生成をコンテナ作成時に前倒ししておく。
# 失敗しても執筆は続けられるため、ここでは警告扱いに留める。
if command -v luaotfload-tool >/dev/null 2>&1; then
  if ! luaotfload-tool --update --force >/tmp/luaotfload-tool.log 2>&1; then
    echo "warning: luaotfload-tool cache warmup failed" >&2
  fi
fi
