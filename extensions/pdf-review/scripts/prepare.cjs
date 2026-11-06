const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'node_modules/pdfjs-dist');
const dest = path.join(root, 'media/pdfjs');
fs.mkdirSync(dest, { recursive: true });
for (const file of ['build/pdf.mjs', 'build/pdf.worker.mjs', 'web/pdf_viewer.css', 'LICENSE']) {
  const target = path.join(dest, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(source, file), target);
}
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'web/images']) {
  fs.cpSync(path.join(source, dir), path.join(dest, dir), { recursive: true });
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
console.log('Bundled PDF.js assets prepared (no CDN).');
