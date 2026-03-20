#!/usr/bin/env bash
set -eu

# Windows 共有フォルダを bind mount したワークスペースでは、
# 既存の aux/ や out/ が root 所有の 755 で見えることがある。
# 保存時ビルドのたびに texlive ユーザーが書き込める状態へ整える。
sudo mkdir -p aux out
sudo chmod 0777 aux out

# コンテナ内 Git は bind mount 上で safe.directory と filemode の影響を受けやすい。
workspace_root="$(pwd)"
if [ -e "${workspace_root}/.git" ]; then
  if ! git config --global --get-all safe.directory 2>/dev/null | grep -Fxq "${workspace_root}"; then
    git config --global --add safe.directory "${workspace_root}"
  fi
  git -C "${workspace_root}" config core.filemode false
fi
