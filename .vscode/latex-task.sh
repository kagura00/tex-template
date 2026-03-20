#!/usr/bin/env bash
set -eu

# VS Code タスクから呼び出す補助スクリプト。
# 子ファイルを開いていても root を辿って main.tex 側をビルドできるようにする。
#
# root の決め方は次の順序:
# 1. 先頭の % !TeX root = ...
# 2. アクティブファイル自身が \documentclass を持っていればそのファイル
# 3. 祖先ディレクトリごとに、まず main.tex
# 4. main.tex が無ければ \documentclass を持つ唯一の .tex
# 5. それも無ければアクティブファイル自身

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <lualatex|lualatex-shell-escape|uplatex|platex|clean|print-root> <active-file> <workspace-folder>" >&2
  exit 2
fi

action="$1"
active_file="$2"
workspace_folder="$3"

# bash の pwd ベースで正規化し、
# 相対パスや .. を含む入力でも比較しやすい絶対パスに揃える。
canonicalize_dir() {
  cd "$1" >/dev/null 2>&1 && pwd
}

canonicalize_file() {
  local target="$1"
  local dir
  local base

  if [[ "$target" != /* ]]; then
    target="$PWD/$target"
  fi

  dir=$(dirname "$target")
  base=$(basename "$target")
  dir=$(canonicalize_dir "$dir")
  printf '%s/%s\n' "$dir" "$base"
}

resolve_relative_file() {
  local base_dir="$1"
  local target="$2"
  local dir
  local base

  if [[ "$target" = /* ]]; then
    canonicalize_file "$target"
    return
  fi

  dir=$(dirname "$target")
  base=$(basename "$target")
  dir=$(cd "$base_dir" >/dev/null 2>&1 && cd "$dir" >/dev/null 2>&1 && pwd)
  printf '%s/%s\n' "$dir" "$base"
}

extract_magic_root() {
  sed -nE 's/^[[:space:]]*%[[:space:]]*!T[Ee]X[[:space:]]+root[[:space:]]*=[[:space:]]*(.+)$/\1/p' "$1" | head -n 1
}

has_documentclass() {
  grep -Eq '^[[:space:]]*\\documentclass([[:space:]]*\[[^]]*\])?[[:space:]]*\{' "$1"
}

# !TeX root が連鎖していても辿れるようにしつつ、
# 循環参照で無限ループしないよう訪問済みパスを記録する。
resolve_magic_root() {
  local current="$1"
  local seen=""
  local target=""

  while true; do
    case " $seen " in
      *" $current "*)
        break
        ;;
    esac

    seen="$seen $current"
    target=$(extract_magic_root "$current")

    if [ -z "$target" ]; then
      break
    fi

    current=$(resolve_relative_file "$(dirname "$current")" "$target")
  done

  printf '%s\n' "$current"
}

find_unique_document_root_in_dir() {
  local search_dir="$1"
  local candidate=""
  local count=0
  local file=""

  while IFS= read -r -d '' file; do
    if has_documentclass "$file"; then
      candidate="$file"
      count=$((count + 1))
      if [ "$count" -gt 1 ]; then
        return 1
      fi
    fi
  done < <(find "$search_dir" -maxdepth 1 -type f -name '*.tex' -print0 | sort -z)

  if [ "$count" -eq 1 ]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  return 1
}

find_nearest_root_candidate() {
  local current_dir="$1"
  local workspace_dir="$2"
  local candidate=""
  local parent_dir=""

  while true; do
    if [ -f "$current_dir/main.tex" ]; then
      printf '%s/main.tex\n' "$current_dir"
      return 0
    fi

    if candidate=$(find_unique_document_root_in_dir "$current_dir"); then
      printf '%s\n' "$candidate"
      return 0
    fi

    if [ "$current_dir" = "$workspace_dir" ]; then
      return 1
    fi

    parent_dir=$(dirname "$current_dir")
    if [ "$parent_dir" = "$current_dir" ]; then
      return 1
    fi

    current_dir="$parent_dir"
  done
}

resolve_root_file() {
  local file_path
  local workspace_dir
  local root_from_magic
  local root_from_nearest_dir

  file_path=$(canonicalize_file "$1")
  workspace_dir=$(canonicalize_dir "$2")
  root_from_magic=$(resolve_magic_root "$file_path")

  if [ "$root_from_magic" != "$file_path" ]; then
    printf '%s\n' "$root_from_magic"
    return
  fi

  if has_documentclass "$file_path"; then
    printf '%s\n' "$file_path"
    return
  fi

  if root_from_nearest_dir=$(find_nearest_root_candidate "$(dirname "$file_path")" "$workspace_dir"); then
    printf '%s\n' "$root_from_nearest_dir"
    return
  fi

  printf '%s\n' "$file_path"
}

# root を決めた後は、そのディレクトリへ移動してから latexmk を実行する。
root_file=$(resolve_root_file "$active_file" "$workspace_folder")
root_dir=$(dirname "$root_file")
root_name=$(basename "$root_file")
aux_dir="$root_dir/aux"
out_dir="$root_dir/out"

if [ "$action" = "print-root" ]; then
  printf '%s\n' "$root_file"
  exit 0
fi

cd "$root_dir"

case "$action" in
  lualatex)
    exec texfot latexmk -lualatex -synctex=1 -interaction=nonstopmode -file-line-error -halt-on-error -outdir=out -auxdir=aux "$root_name"
    ;;
  lualatex-shell-escape)
    exec texfot latexmk -lualatex -shell-escape -synctex=1 -interaction=nonstopmode -file-line-error -halt-on-error -outdir=out -auxdir=aux "$root_name"
    ;;
  uplatex)
    exec texfot latexmk -pdfdvi -latex="uplatex %O -synctex=1 -interaction=nonstopmode -file-line-error -halt-on-error %S" -outdir=out -auxdir=aux "$root_name"
    ;;
  platex)
    exec texfot latexmk -pdfdvi -latex="platex %O -synctex=1 -interaction=nonstopmode -file-line-error -halt-on-error %S" -outdir=out -auxdir=aux "$root_name"
    ;;
  clean)
    mkdir -p "$aux_dir" "$out_dir"
    find "$aux_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    exit 0
    ;;
  *)
    echo "unknown action: $action" >&2
    exit 2
    ;;
esac
