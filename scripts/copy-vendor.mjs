// Copies the browser builds of pdf.js and pdf-lib into src/vendor so the
// renderer can load them with plain <script> tags (no bundler required).
import { copyFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(root, 'src', 'vendor');

const files = [
  ['node_modules/pdfjs-dist/build/pdf.js', 'pdf.js'],
  ['node_modules/pdfjs-dist/build/pdf.worker.js', 'pdf.worker.js'],
  ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'pdf-lib.min.js'],
];

await mkdir(vendor, { recursive: true });

for (const [from, to] of files) {
  const src = join(root, from);
  try {
    await access(src);
  } catch {
    console.error(`[vendor] Falta ${from}. Ejecuta "npm install" primero.`);
    process.exitCode = 1;
    continue;
  }
  await copyFile(src, join(vendor, to));
  console.log(`[vendor] ${to}`);
}

// Optional assets used by pdf.js for CJK text and standard fonts.
try {
  await copyFile(
    join(root, 'node_modules/pdfjs-dist/cmaps/UniJIS-UCS2-H.bcmap'),
    join(vendor, 'UniJIS-UCS2-H.bcmap'),
  );
} catch {
  /* not required for latin documents */
}
