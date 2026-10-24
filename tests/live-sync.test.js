import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { Chess } from 'chess.js';
import {
  createLiveSyncMiddleware,
  isTrustedRequest,
  validateUpdate,
} from '../server/live-sync.js';

const game = new Chess();
game.move('e4');
const update = {
  status: 'connected',
  pgn: game.pgn(),
  fen: game.fen(),
  url: 'https://www.chess.com/play/computer',
};

test('board updates preserve legal positions and reject mismatched move history', () => {
  assert.deepEqual(validateUpdate(update), update);
  assert.throws(() => validateUpdate({ ...update, pgn: '1. d4' }), /match/);
  assert.throws(() => validateUpdate({ ...update, fen: 'not a position' }));
  assert.throws(() =>
    validateUpdate({ ...update, url: 'https://example.com/game' }),
  );
  assert.deepEqual(validateUpdate({ status: 'stopped' }), {
    status: 'stopped',
  });
  assert.deepEqual(
    validateUpdate({ status: 'error', error: 'Show the full move list.' }),
    { status: 'error', error: 'Show the full move list.' },
  );
});

test('local sync allows the app and extension while rejecting foreign origins and hosts', () => {
  const request = (headers) => ({
    headers: { host: '127.0.0.1:4173', ...headers },
  });
  assert.equal(
    isTrustedRequest(request({ origin: 'http://127.0.0.1:4173' })),
    true,
  );
  assert.equal(
    isTrustedRequest(
      request({
        origin: `chrome-extension://${'a'.repeat(32)}`,
        'sec-fetch-site': 'cross-site',
      }),
    ),
    true,
  );
  assert.equal(
    isTrustedRequest(request({ origin: 'https://evil.example' })),
    false,
  );
  assert.equal(isTrustedRequest(request({ host: 'evil.example' })), false);
  assert.equal(
    isTrustedRequest(request({ 'sec-fetch-site': 'cross-site' })),
    false,
  );
});

test('HTTP sync keeps the last valid board and limits incoming payloads', async (t) => {
  const middleware = createLiveSyncMiddleware();
  const server = http.createServer(middleware);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/live`;
  const post = (value, headers = {}) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(value),
    });
  assert.equal(await (await fetch(url)).json(), null);
  assert.equal((await post(update)).status, 200);
  assert.equal((await post({ ...update, pgn: '1. d4' })).status, 400);
  assert.equal((await (await fetch(url)).json()).fen, game.fen());
  assert.equal(
    (await post(update, { Origin: 'https://evil.example' })).status,
    403,
  );
  assert.equal((await post({ padding: 'x'.repeat(200_001) })).status, 413);
  assert.equal((await fetch(url, { method: 'DELETE' })).status, 405);
});
