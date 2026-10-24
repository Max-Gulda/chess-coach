import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('../extension/dist/', import.meta.url);
await mkdir(output, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL('extension/content.js', root))],
  outfile: fileURLToPath(new URL('content.js', output)),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
});
for (const file of [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.js',
]) {
  await copyFile(new URL(`extension/${file}`, root), new URL(file, output));
}
console.log(`Chrome extension ready: ${fileURLToPath(output)}`);
