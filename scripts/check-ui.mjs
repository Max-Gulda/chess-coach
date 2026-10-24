import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = join(root, 'artifacts');
const base = 'http://127.0.0.1:4183';
const server = spawn(
  process.execPath,
  [
    join(root, 'node_modules/vite/bin/vite.js'),
    '--host',
    '127.0.0.1',
    '--port',
    '4183',
    '--strictPort',
  ],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverError;
let serverOutput = '';
let browser;
let page;
const errors = [];
server.on('error', (error) => {
  serverError = error;
});
server.stdout.on('data', (data) => {
  serverOutput += data;
});
server.stderr.on('data', (data) => {
  serverOutput += data;
});
const shutdown = () => {
  if (server.exitCode === null) server.kill('SIGTERM');
};
process.on('exit', shutdown);

try {
  await mkdir(artifacts, { recursive: true });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (serverError) throw serverError;
    if (server.exitCode !== null)
      throw new Error(`The isolated test server failed:\n${serverOutput}`);
    try {
      ready = (await fetch(base)).ok;
    } catch {
      /* The server is still starting. */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, `The isolated test server did not start:\n${serverOutput}`);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHESS_COACH_BROWSER_CHANNEL
      ? { channel: process.env.CHESS_COACH_BROWSER_CHANNEL }
      : {}),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  assert.equal(await page.locator('.coach-panel').getAttribute('open'), null);
  assert.equal(await page.locator('.board-help').getAttribute('open'), null);
  await page.locator('.coach-panel summary').click();
  assert.equal(await page.locator('#insight').isVisible(), true);
  await page.locator('.coach-panel summary').click();
  assert.equal(await page.locator('#insight').isVisible(), false);
  await page.waitForFunction(
    () => document.querySelectorAll('.move-line').length === 5,
    null,
    { timeout: 60000 },
  );
  assert.equal(await page.locator('.square').count(), 64);
  assert.equal(await page.locator('#live-enabled').isVisible(), true);
  const suggestions = await page.locator('.move-line strong').allTextContents();
  assert.equal(new Set(suggestions).size, 5, 'Five distinct suggested moves');

  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  assert.equal(
    await page.locator('.square').first().getAttribute('data-square'),
    'h1',
  );
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  assert.equal(
    await page.locator('.square').first().getAttribute('data-square'),
    'a8',
  );
  await page.locator('[data-square=e2]').click();
  await page.locator('[data-square=e4]').click();
  await page.waitForFunction(() =>
    document.querySelector('#move-counter').textContent.includes('e4'),
  );
  await page.waitForFunction(() =>
    document.querySelector('#insight h3')?.textContent.includes('e4'),
  );
  await page.locator('.move-line').first().click();
  await page.locator('#preview-bar').waitFor({ state: 'visible' });
  await page.locator('#preview-close').click();

  await page.locator('#import-open').click();
  await page.locator('#demo').click();
  let dialogs = 0;
  const dismissUnexpectedDialog = (dialog) => {
    dialogs++;
    void dialog.dismiss();
  };
  page.on('dialog', dismissUnexpectedDialog);
  await page.locator('[data-square=e2]').click();
  await page.locator('[data-square=e5]').click();
  assert.equal(
    dialogs,
    0,
    'Illegal moves must not request replacement of later moves.',
  );
  page.off('dialog', dismissUnexpectedDialog);
  await page.locator('#end').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#position-status').textContent === 'Checkmate',
  );
  await page.waitForFunction(() =>
    document
      .querySelector('#insight')
      .textContent.includes('delivers checkmate'),
  );
  await page.locator('#review').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('#review-status')
        .textContent.startsWith('Complete'),
    null,
    { timeout: 30000 },
  );
  assert.equal(await page.locator('.quality').count(), 4);

  await page.locator('#import-open').click();
  await page.locator('#import-text').fill('7k/P7/8/8/8/8/8/7K w - - 0 1');
  await page.locator('#import-form button[type=submit]').click();
  assert.equal(
    await page.locator('#game-title').textContent(),
    '',
    'A new position clears the previous game title.',
  );
  await page.locator('[data-square=a7]').click();
  await page.locator('[data-square=a8]').click();
  await page.locator('#promotion-choices button').first().click();
  assert.match(await page.locator('#move-counter').textContent(), /a8=Q/);

  await page.locator('#live-enabled').check();
  const response = await page.request.post(base + '/api/live', {
    data: {
      status: 'connected',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      pgn: '1. e4',
    },
  });
  assert.equal(response.status(), 200);
  await page.waitForFunction(() =>
    document.querySelector('#live-status').textContent.startsWith('Connected'),
  );
  assert.match(await page.locator('#move-counter').textContent(), /e4/);
  await page.locator('#live-enabled').uncheck();
  await page.waitForFunction(
    () => document.querySelectorAll('.move-line').length === 5,
  );
  await page.screenshot({
    path: join(artifacts, 'desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(artifacts, 'mobile.png'),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'Mobile page should not overflow',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Browser checks passed: Stockfish, legal moves, board orientation, variations, PGN import, game review, promotion, extension sync, and responsive layout.',
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page
      .screenshot({ path: join(artifacts, 'failure.png'), fullPage: true })
      .catch(() => {});
    console.error(await page.locator('body').innerText());
  }
  console.error(errors);
  throw error;
} finally {
  await browser?.close();
  shutdown();
}
