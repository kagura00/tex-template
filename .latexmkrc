#!/usr/bin/env perl

# 既定は LuaLaTeX で PDF を直接生成する。
$pdf_mode = 4;
$lualatex = 'lualatex %O -synctex=1 -interaction=nonstopmode -file-line-error -halt-on-error %S';

# 再実行回数と生成物の扱いは、増分ビルド寄りの設定にしておく。
$max_repeat = 5;
$cleanup_includes_generated = 0;
$aux_dir = 'aux';
$out_dir = 'out';

# 日本語文書で併用しやすい周辺コマンド。
$bibtex = 'upbibtex %O %B';
$biber = 'biber %O %B';
$makeindex = 'upmendex %O -o %D %S';
$dvipdf = 'dvipdfmx %O -o %D %S';

# clean 時に追加で片付けたい生成物。
$clean_ext .= ' synctex.gz run.xml';

# 出力先ディレクトリが無ければ用意する。
unless (-d $aux_dir) { mkdir $aux_dir; }
unless (-d $out_dir) { mkdir $out_dir; }
