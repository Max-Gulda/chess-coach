import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const stockfish = dirname(require.resolve('stockfish/package.json'));
const output = fileURLToPath(new URL('../public/engine/', import.meta.url));
await mkdir(output, { recursive: true });
for (const file of ['stockfish-19-single.js', 'stockfish-19-single.wasm']) {
  await copyFile(join(stockfish, 'bin', file), join(output, file));
}
await copyFile(join(stockfish, 'Copying.txt'), join(output, 'COPYING.txt'));
console.log('Stockfish 19 assets are ready for local analysis.');
