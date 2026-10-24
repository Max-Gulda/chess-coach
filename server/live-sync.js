import { Chess } from 'chess.js';

const MAX_BODY_BYTES = 200_000;

export function isTrustedRequest(request) {
  try {
    const local = new URL(`http://${request.headers.host}`);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(local.hostname))
      return false;
    const origin = request.headers.origin;
    if (origin && /^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return true;
    if (request.headers['sec-fetch-site'] === 'cross-site') return false;
    return !origin || origin === local.origin;
  } catch {
    return false;
  }
}

export function validateUpdate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a board update.');
  const status = value.status ?? 'connected';
  if (!['connected', 'error', 'stopped'].includes(status))
    throw new Error('Unknown board status.');
  const update = { status };
  if (value.url !== undefined) {
    const url = new URL(value.url);
    if (
      url.protocol !== 'https:' ||
      !['chess.com', 'www.chess.com'].includes(url.hostname)
    )
      throw new Error('Expected a Chess.com board URL.');
    update.url = url.href;
  }
  if (status === 'connected') {
    if (typeof value.fen !== 'string' || value.fen.length > 150)
      throw new Error('Expected a valid FEN position.');
    update.fen = new Chess(value.fen).fen();
    if (value.pgn !== undefined) {
      if (typeof value.pgn !== 'string') throw new Error('Expected PGN text.');
      if (value.pgn) {
        const board = new Chess();
        board.loadPgn(value.pgn);
        if (board.fen() !== update.fen)
          throw new Error('The moves do not match the board.');
      }
      update.pgn = value.pgn;
    }
  } else if (status === 'error') {
    if (typeof value.error !== 'string')
      throw new Error('Expected an error description.');
    update.error = value.error.slice(0, 1000);
  }
  return update;
}

export function createLiveSyncMiddleware() {
  let latest = null;
  return async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, value) => {
      response.statusCode = status;
      response.end(JSON.stringify(value));
    };
    if (!isTrustedRequest(request)) {
      send(403, { error: 'Use the local app or the board-sync extension.' });
      return;
    }
    if (request.method === 'GET') {
      send(200, latest);
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      send(405, { error: 'Method not allowed.' });
      return;
    }
    const chunks = [];
    let bytes = 0;
    try {
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > MAX_BODY_BYTES) {
          send(413, { error: 'Board update is too large.' });
          return;
        }
        chunks.push(chunk);
      }
      const update = validateUpdate(
        JSON.parse(Buffer.concat(chunks).toString('utf8')),
      );
      latest = { ...update, receivedAt: Date.now() };
      send(200, { ok: true });
    } catch {
      if (!response.writableEnded)
        send(400, {
          error:
            'Invalid board update. Check that its moves match the position.',
        });
    }
  };
}
