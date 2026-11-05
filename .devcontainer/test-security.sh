#!/usr/bin/env bash
set -euo pipefail
repo=$(pwd -P)
test_root=$(mktemp -d /tmp/tex-template-test.XXXXXXXX)
trap 'rm -rf -- "$test_root"' EXIT
# npm 本体が共有する glob/minimatch のメジャー更新も実インストールで検証する。
mkdir "$test_root/npm"
cp .devcontainer/package.json .devcontainer/package-lock.json "$test_root/npm/"
npm ci --prefix "$test_root/npm" --ignore-scripts --omit=dev
npm audit --prefix "$test_root/npm" --package-lock-only --omit=dev
mkdir -p "$test_root/work/chapters" "$test_root/outside/aux"
script="$repo/.vscode/latex-task.sh"
printf '\\documentclass{article}\n' > "$test_root/work/main.tex"
printf '%% !TeX root = ../main.tex\n' > "$test_root/work/chapters/child.tex"
test "$(bash "$script" print-root "$test_root/work/chapters/child.tex" "$test_root/work")" = "$test_root/work/main.tex"
special="$test_root/work/\$(printf TASK_EXPANSION_PROBE).tex"
printf '\\documentclass{article}\n' > "$special"
test "$(bash "$script" print-root "$special" "$test_root/work")" = "$special"
printf '%% !TeX root = ../outside/main.tex\n' > "$test_root/work/escape.tex"
printf '\\documentclass{article}\n' > "$test_root/outside/main.tex"
printf 'keep\n' > "$test_root/outside/aux/keep"
if bash "$script" clean "$test_root/work/escape.tex" "$test_root/work"; then
  echo 'error: outside root accepted' >&2; exit 1
fi
test -s "$test_root/outside/aux/keep"
# 親ディレクトリから暗黙に選ぶ root も、実体と magic root の両方を検査する。
mkdir -p "$test_root/implicit/chapters"
printf 'child text\n' > "$test_root/implicit/chapters/child.tex"
ln -s "$test_root/outside/main.tex" "$test_root/implicit/main.tex"
if bash "$script" clean "$test_root/implicit/chapters/child.tex" "$test_root/implicit"; then
  echo 'error: outside implicit symlink root accepted' >&2; exit 1
fi
rm -- "$test_root/implicit/main.tex"
printf '%% !TeX root = ../outside/main.tex\n' > "$test_root/implicit/main.tex"
if bash "$script" clean "$test_root/implicit/chapters/child.tex" "$test_root/implicit"; then
  echo 'error: outside implicit magic root accepted' >&2; exit 1
fi
printf '\\documentclass{article}\n' > "$test_root/implicit/actual.tex"
printf '%% !TeX root = actual.tex\n' > "$test_root/implicit/main.tex"
test "$(bash "$script" print-root "$test_root/implicit/chapters/child.tex" "$test_root/implicit")" = "$test_root/implicit/actual.tex"
test -s "$test_root/outside/aux/keep"
ln -s "$test_root/outside/aux" "$test_root/work/aux"
if bash "$script" clean "$test_root/work/main.tex" "$test_root/work"; then
  echo 'error: symlink output accepted' >&2; exit 1
fi
test -s "$test_root/outside/aux/keep"
rm -- "$test_root/work/aux"
mkdir "$test_root/work/aux"
printf 'remove\n' > "$test_root/work/aux/remove"
bash "$script" clean "$test_root/work/main.tex" "$test_root/work"
test ! -e "$test_root/work/aux/remove"
printf '%% !TeX root = cycle-b.tex\n' > "$test_root/work/cycle-a.tex"
printf '%% !TeX root = cycle-a.tex\n' > "$test_root/work/cycle-b.tex"
if bash "$script" print-root "$test_root/work/cycle-a.tex" "$test_root/work"; then
  echo 'error: cyclic root accepted' >&2; exit 1
fi
# ZIP 展開と同じく .git も既存の生成物もない状態から検証する。
mkdir "$test_root/zip"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  # GitHub の ZIP と同じ管理対象だけを、現在の作業ファイルからコピーする。
  git ls-files -z | tar --null --files-from=- -cf - | tar -xf - -C "$test_root/zip"
else
  tar --exclude=.git --exclude=.cache --exclude=aux --exclude=out --exclude=tmp -cf - . | tar -xf - -C "$test_root/zip"
fi
cd "$test_root/zip"
test ! -e .git
textlint main.tex
chktex -wall -n19 -n22 -n30 -e16 -q main.tex
bash .vscode/latex-task.sh lualatex main.tex "$PWD"
test -s out/main.pdf
! grep -Eq 'duplicate destination|undefined references|Citation .* undefined|Reference .* undefined' aux/main.log
# 一般的な sudo コマンドの実行権限を与えていないことを確認する。
if sudo -n true 2>/dev/null; then echo 'error: unrestricted sudo' >&2; exit 1; fi
echo 'security and ZIP regression checks passed'
