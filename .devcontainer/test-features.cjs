// ネットワーク不要の実処理テスト。原稿と生成物は /tmp の専用領域だけで扱う。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tex-template-features-'));
const results = [];

function run(command, args, cwd, allowed = [0]) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 5 * 1024 * 1024
  });
  if (!allowed.includes(result.status)) {
    const tail = (result.stdout + '\n' + result.stderr).split('\n').slice(-18).join('\n');
    throw new Error(`${command}: exit=${result.status} ${result.error || ''}\n${tail}`);
  }
  return result.stdout;
}

function check(name, operation) {
  try {
    operation();
    results.push({ name, status: 'PASS' });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'FAIL', error: error.message });
    console.error(`FAIL ${name}\n${error.message}`);
  }
}

function fixture(name, source) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir);
  fs.copyFileSync(path.join(repo, '.latexmkrc'), path.join(dir, '.latexmkrc'));
  if (source) fs.writeFileSync(path.join(dir, 'main.tex'), source);
  return dir;
}

function task(dir, action) {
  run('bash', [path.join(repo, '.vscode/latex-task.sh'), action, path.join(dir, 'main.tex'), dir], dir);
}

function assertFile(file) {
  if (!fs.statSync(file).size) throw new Error(`Empty file: ${file}`);
}

function assertPdf(file, token) {
  assertFile(file);
  run('pdfinfo', [file], scratch);
  if (token) {
    const text = run('pdftotext', [file, '-'], scratch).replace(/\s/g, '');
    if (!text.includes(token)) throw new Error(`Missing PDF text: ${token}`);
  }
}

const simple = '\\documentclass{article}\n\\begin{document}\nFEATUREPROBE\n\\end{document}\n';
let sample;
try {
  check('TeX binary shared libraries', () => {
    const bin = run('kpsewhich', ['-var-value=SELFAUTOLOC'], scratch).trim();
    const seen = new Set();
    for (const entry of fs.readdirSync(bin)) {
      let file;
      try {
        file = fs.realpathSync(path.join(bin, entry));
      } catch {
        continue; // Java 除外により参照先のないランチャーは別途サポート対象外。
      }
      if (seen.has(file) || !fs.statSync(file).isFile()) continue;
      seen.add(file);
      // X11 の外部 DVI ビューアはヘッドレス環境のサポート対象外。
      if (path.basename(file) === 'xdvi-xaw') continue;
      const header = Buffer.alloc(4), fd = fs.openSync(file, 'r');
      try { fs.readSync(fd, header, 0, 4, 0); } finally { fs.closeSync(fd); }
      if (header.toString('hex') !== '7f454c46') continue;
      const libraries = run('ldd', [file], scratch, [0, 1]);
      if (libraries.includes('not found')) throw new Error(`${file}\n${libraries}`);
    }
  });
  check('LuaLaTeX + BibTeX sample', () => {
    sample = fixture('Lua sample');
    for (const file of ['main.tex', 'references.bib', '.textlintrc.js']) {
      fs.copyFileSync(path.join(repo, file), path.join(sample, file));
    }
    fs.cpSync(path.join(repo, 'images'), path.join(sample, 'images'), { recursive: true });
    task(sample, 'lualatex');
    assertPdf(path.join(sample, 'out/main.pdf'), 'はじめに');
    const log = fs.readFileSync(path.join(sample, 'aux/main.log'), 'utf8');
    if (/undefined references|Citation .* undefined|Reference .* undefined|duplicate destination/.test(log)) {
      throw new Error('Unresolved references or duplicate destinations');
    }
  });
  check('textlint and ChkTeX', () => {
    run('textlint', ['main.tex'], sample);
    run('chktex', ['-wall', '-n19', '-n22', '-n30', '-e16', '-q', 'main.tex'], sample);
  });
  check('latexindent formatting and rebuild', () => {
    const dir = fixture('format', '\\documentclass{article}\n\\begin{document}\n\\begin{itemize}\n\\item FORMATPROBE\n\\end{itemize}\n\\end{document}\n');
    const formatted = run('latexindent', ['main.tex'], dir);
    if (!formatted.includes('FORMATPROBE')) throw new Error('Formatter dropped content');
    fs.writeFileSync(path.join(dir, 'main.tex'), formatted);
    task(dir, 'lualatex');
    assertPdf(path.join(dir, 'out/main.pdf'), 'FORMATPROBE');
  });
  for (const engine of ['uplatex', 'platex']) {
    check(`${engine} Japanese PDF`, () => {
      const options = engine === 'uplatex' ? 'uplatex,dvipdfmx' : 'dvipdfmx';
      const dir = fixture(engine, `\\documentclass[${options}]{jsarticle}\n\\begin{document}\n日本語の本文です．\n\\end{document}\n`);
      task(dir, engine);
      assertPdf(path.join(dir, 'out/main.pdf'), '日本語');
    });
  }
  check('biblatex + Biber', () => {
    const dir = fixture('biber', '\\documentclass{article}\n\\usepackage[backend=biber]{biblatex}\n\\addbibresource{refs.bib}\n\\begin{document}\n\\cite{probe}\\printbibliography\n\\end{document}\n');
    fs.writeFileSync(path.join(dir, 'refs.bib'), '@book{probe,author={Alice Example},title={BIBERPROBE},year={2026},publisher={Example}}\n');
    task(dir, 'lualatex');
    assertPdf(path.join(dir, 'out/main.pdf'), 'BIBERPROBE');
  });
  check('minted + shell-escape', () => {
    const dir = fixture('minted', '\\documentclass{article}\n\\usepackage{minted}\n\\begin{document}\n\\begin{minted}{python}\nprint("MINTEDPROBE")\n\\end{minted}\n\\end{document}\n');
    task(dir, 'lualatex-shell-escape');
    assertPdf(path.join(dir, 'out/main.pdf'), 'MINTEDPROBE');
  });
  check('XeLaTeX named TeX Live font', () => {
    const dir = fixture('font', '\\documentclass{article}\n\\usepackage{fontspec}\n\\setmainfont{Latin Modern Roman}\n\\begin{document}FONTPROBE\\end{document}\n');
    run('xelatex', ['-halt-on-error', '-interaction=nonstopmode', 'main.tex'], dir);
    assertPdf(path.join(dir, 'main.pdf'), 'FONTPROBE');
  });
  check('SyncTeX forward and backward', () => {
    const file = path.join(sample, 'main.tex'), pdf = path.join(sample, 'out/main.pdf');
    const forward = run('synctex', ['view', '-i', `145:1:${file}`, '-o', pdf], sample);
    const page = forward.match(/Page:(\d+)/)?.[1];
    const x = forward.match(/\nx:([^\n]+)/)?.[1], y = forward.match(/\ny:([^\n]+)/)?.[1];
    if (!page || !x || !y) throw new Error('Missing forward mapping');
    const backward = run('synctex', ['edit', '-o', `${page}:${x}:${y}:${pdf}`], sample);
    if (!backward.includes('Input:') || !backward.includes('Line:')) throw new Error('Missing backward mapping');
  });
  check('PDF rasterization', () => {
    run('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', '150', '-png', path.join(sample, 'out/main.pdf'), path.join(scratch, 'preview')], scratch);
    assertFile(path.join(scratch, 'preview.png'));
  });
  for (const tool of ['upmendex', 'texindy']) {
    check(`${tool} index generation`, () => {
      const dir = fixture(tool);
      fs.writeFileSync(path.join(dir, 'sample.idx'), '\\indexentry{alpha}{1}\n\\indexentry{beta}{2}\n');
      const options = tool === 'texindy' ? ['-L', 'english', '-C', 'utf8'] : [];
      run(tool, [...options, '-o', 'sample.ind', 'sample.idx'], dir);
      if (!fs.readFileSync(path.join(dir, 'sample.ind'), 'utf8').includes('alpha')) throw new Error('Missing index entry');
    });
  }
  check('EPS to PDF', () => {
    const dir = fixture('eps');
    fs.writeFileSync(path.join(dir, 'sample.eps'), '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n0 0 moveto 100 100 lineto stroke\nshowpage\n');
    run('epstopdf', ['--outfile=sample.pdf', 'sample.eps'], dir);
    assertPdf(path.join(dir, 'sample.pdf'));
  });
  check('DVI to SVG', () => {
    const dir = fixture('dvi', simple);
    run('latex', ['-halt-on-error', '-interaction=nonstopmode', 'main.tex'], dir);
    run('dvisvgm', ['--no-fonts', '--output=main.svg', 'main.dvi'], dir);
    assertFile(path.join(dir, 'main.svg'));
  });
  check('Asymptote PDF figure', () => {
    const dir = fixture('asy');
    fs.writeFileSync(path.join(dir, 'sample.asy'), 'size(100);\ndraw((0,0)--(1,1));\n');
    run('asy', ['-noV', '-f', 'pdf', 'sample.asy'], dir);
    assertPdf(path.join(dir, 'sample.pdf'));
  });
  check('gnuplot PDF figure', () => {
    const dir = fixture('gnuplot');
    fs.writeFileSync(path.join(dir, 'sample.gp'), "set terminal pdfcairo\nset output 'sample.pdf'\nplot x*x\n");
    run('gnuplot', ['sample.gp'], dir);
    assertPdf(path.join(dir, 'sample.pdf'));
  });
  check('ZIP creation and extraction', () => {
    const dir = fixture('zip');
    fs.writeFileSync(path.join(dir, 'probe.txt'), 'ZIPPROBE');
    run('zip', ['archive.zip', 'probe.txt'], dir);
    if (run('unzip', ['-p', 'archive.zip', 'probe.txt'], dir) !== 'ZIPPROBE') throw new Error('ZIP round trip mismatch');
  });
  check('HTML tidy', () => {
    const dir = fixture('tidy');
    fs.writeFileSync(path.join(dir, 'sample.html'), '<!DOCTYPE html><html><head><title>probe</title></head><body><p>TIDYPROBE</p></body></html>');
    run('tidy', ['-quiet', '-utf8', '-o', 'tidy.html', 'sample.html'], dir, [0, 1]);
    if (!fs.readFileSync(path.join(dir, 'tidy.html'), 'utf8').includes('TIDYPROBE')) throw new Error('Missing HTML text');
  });
  check('make4ht HTML conversion', () => {
    const dir = fixture('html', simple);
    run('make4ht', ['-l', 'main.tex'], dir);
    assertFile(path.join(dir, 'main.html'));
  });
  check('tex4ebook EPUB conversion', () => {
    const dir = fixture('epub', simple);
    run('tex4ebook', ['-l', 'main.tex'], dir);
    assertFile(path.join(dir, 'main.epub'));
    run('unzip', ['-t', 'main.epub'], dir);
    if (run('unzip', ['-p', 'main.epub', 'mimetype'], dir).trim() !== 'application/epub+zip') throw new Error('Incorrect EPUB mimetype');
  });
  check('Clean preserves PDF', () => {
    task(sample, 'clean');
    if (fs.readdirSync(path.join(sample, 'aux')).length) throw new Error('Auxiliary files remain');
    assertPdf(path.join(sample, 'out/main.pdf'), 'はじめに');
  });
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

console.log(JSON.stringify({ passed: results.filter(r => r.status === 'PASS').length, results }));
if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
