#!/usr/bin/env bash
set -eu

# 出力先だけ所有者を調整する。sudo はパス検査付き補助処理に限定する。
sudo -n /usr/local/sbin/prepare-tex-workspace "$(pwd -P)"

# コンテナ内 Git は bind mount 上で safe.directory と filemode の影響を受けやすい。
workspace_root="$(pwd)"
if [ -e "${workspace_root}/.git" ]; then
  if ! git config --global --get-all safe.directory 2>/dev/null | grep -Fxq "${workspace_root}"; then
    git config --global --add safe.directory "${workspace_root}"
  fi
  # CI のチェックアウトなど、別 UID 所有で .git/config が書き込めない環境では
  # 文書の lint/build に影響しないため警告に留める。
  if ! git -C "${workspace_root}" config core.filemode false 2>/dev/null; then
    echo "warning: could not set core.filemode for ${workspace_root}" >&2
  fi
fi
