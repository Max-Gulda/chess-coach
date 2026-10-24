import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { Chess } from 'chess.js';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch({
  ...(process.env.CHESS_COACH_BROWSER_CHANNEL
    ? { channel: process.env.CHESS_COACH_BROWSER_CHANNEL }
    : {}),
  headless: true,
});
try {
  const page = await browser.newPage();
  const game = new Chess();
  for (const move of ['e4', 'e5', 'Nf3']) game.move(move);
  const pieces = game
    .board()
    .flat()
    .filter(Boolean)
    .map((piece) => {
      const square = `${piece.square.charCodeAt(0) - 96}${piece.square[1]}`;
      return `<div class="piece ${piece.color + piece.type} square-${square}"></div>`;
    })
    .join('');
  await page.setContent(
    `<style>.piece { width:10px;height:10px }</style><div class="board">${pieces}</div><div class="vertical-move-list"><div class="node">e4</div><div class="node">e5</div><div class="node selected"><span data-figurine="n"></span>f3</div></div>`,
  );
  await page.evaluate(() => {
    window.updates = [];
    window.chrome = {
      runtime: {
        onMessage: {
          addListener(listener) {
            window.syncListener = listener;
          },
        },
        async sendMessage(message) {
          if (message.type === 'get-state') return { enabled: true };
          window.updates.push(message.payload);
          return { ok: true };
        },
      },
    };
  });
  await page.addScriptTag({
    path: fileURLToPath(new URL('./dist/content.js', import.meta.url)),
  });
  await page.waitForFunction(() => window.updates.length > 0);
  const initial = await page.evaluate(() => window.updates[0]);
  assert.equal(initial.status, 'connected');
  assert.equal(initial.fen, game.fen());
  assert.match(initial.pgn, /Nf3/);

  await page
    .locator('.node')
    .first()
    .evaluate((node) => {
      node.textContent = 'd4';
    });
  await page.waitForFunction(() =>
    window.updates.some((update) => update.status === 'error'),
  );
  assert.match(
    await page.evaluate(() => window.updates.at(-1).error),
    /Cannot match/,
  );
  await page.evaluate(() =>
    window.syncListener({ type: 'set-enabled', enabled: false }),
  );
  await page.waitForFunction(() => window.updates.at(-1)?.status === 'stopped');
  const backgroundPage = await browser.newPage();
  await backgroundPage.evaluate(() => {
    window.saved = {};
    window.failConnection = true;
    window.chrome = {
      runtime: {
        onMessage: {
          addListener(listener) {
            window.backgroundListener = listener;
          },
        },
      },
      storage: {
        local: {
          async get() {
            return structuredClone(window.saved);
          },
          async set(value) {
            Object.assign(window.saved, structuredClone(value));
          },
        },
      },
      tabs: {
        async sendMessage() {
          if (window.failConnection)
            throw new Error('Content script unavailable');
        },
        onRemoved: { addListener() {} },
      },
    };
    window.backgroundMessage = (message) =>
      new Promise((resolve) => window.backgroundListener(message, {}, resolve));
  });
  await backgroundPage.addScriptTag({
    path: fileURLToPath(new URL('./dist/background.js', import.meta.url)),
  });
  let response = await backgroundPage.evaluate(() =>
    window.backgroundMessage({ type: 'set-enabled', tabId: 7, enabled: true }),
  );
  assert.equal(response.ok, false);
  assert.equal(
    await backgroundPage.evaluate(() => Boolean(window.saved.enabledTabs?.[7])),
    false,
  );
  await backgroundPage.evaluate(() => {
    window.failConnection = false;
  });
  response = await backgroundPage.evaluate(() =>
    window.backgroundMessage({ type: 'set-enabled', tabId: 7, enabled: true }),
  );
  assert.equal(response.ok, true);
  assert.equal(
    await backgroundPage.evaluate(() => Boolean(window.saved.enabledTabs?.[7])),
    true,
  );
  response = await backgroundPage.evaluate(() =>
    window.backgroundMessage({ type: 'set-enabled', tabId: 7, enabled: false }),
  );
  assert.equal(response.ok, true);
  assert.equal(
    await backgroundPage.evaluate(() => Boolean(window.saved.enabledTabs?.[7])),
    false,
  );
  console.log(
    'Board sync check passed: legal replay, full FEN, unreadable history, stop, and failed-connection recovery.',
  );
} finally {
  await browser.close();
}
