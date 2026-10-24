import { Chess } from 'chess.js';

let enabled = false;
let sending = false;
let lastSent = '';
let lastSentAt = 0;
const names = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: '',
};
const figurines = {
  '♔': 'K',
  '♕': 'Q',
  '♖': 'R',
  '♗': 'B',
  '♘': 'N',
  '♙': '',
  '♚': 'K',
  '♛': 'Q',
  '♜': 'R',
  '♝': 'B',
  '♞': 'N',
  '♟': '',
};

function visible(element) {
  return element.getClientRects().length > 0;
}

function boardPieces() {
  const boards = document.querySelectorAll(
    'wc-chess-board, chess-board, .board',
  );
  for (const board of boards) {
    if (!visible(board)) continue;
    const pieces = new Map();
    let duplicate = false;
    for (const element of board.querySelectorAll('.piece')) {
      const classes = [...element.classList];
      const kind = classes.find((name) => /^[wb][pnbrqk]$/.test(name));
      const square = classes.find((name) => /^square-[1-8][1-8]$/.test(name));
      if (!kind || !square || !visible(element)) continue;
      const squareName =
        String.fromCharCode(96 + Number(square[7])) + square[8];
      if (pieces.has(squareName)) duplicate = true;
      pieces.set(squareName, kind);
    }
    if (pieces.size >= 2 && !duplicate) return pieces;
  }
  throw new Error(
    'No readable chess board found. Open a Chess.com board and keep the move list visible.',
  );
}

function sanFromNode(node) {
  const clone = node.cloneNode(true);
  clone
    .querySelectorAll(
      '.move-number, .clock, .time, .evaluation, .annotation, .move-feedback',
    )
    .forEach((child) => child.remove());
  for (const element of clone.querySelectorAll('[data-figurine]')) {
    const value = element.getAttribute('data-figurine').toLowerCase();
    element.replaceWith(
      names[value] ?? (value === 'p' ? '' : value.toUpperCase()),
    );
  }
  let text = clone.textContent.replace(
    /[♔♕♖♗♘♙♚♛♜♝♞♟]/g,
    (value) => figurines[value],
  );
  text = text
    .replace(/\d+\.{1,3}/g, '')
    .replace(/[!?]/g, '')
    .replace(/\s/g, '')
    .replace(/0/g, 'O');
  if (
    !/^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?$/.test(
      text,
    )
  ) {
    throw new Error(
      'The move list could not be read completely. Expand the move list, or import a PGN into Chess Coach.',
    );
  }
  return text;
}

function samePosition(game, pieces) {
  const expected = new Map(
    game
      .board()
      .flat()
      .filter(Boolean)
      .map((piece) => [piece.square, piece.color + piece.type]),
  );
  return (
    pieces.size === expected.size &&
    [...pieces].every(([square, piece]) => expected.get(square) === piece)
  );
}

function readGame() {
  const pieces = boardPieces();
  const game = new Chess();
  const lists = [
    ...document.querySelectorAll(
      '.vertical-move-list, .move-list, wc-move-list, .play-notation',
    ),
  ].filter(visible);
  for (const list of lists) {
    const replay = new Chess();
    const nodes = [...list.querySelectorAll('.node, .move-node')].filter(
      (node) => visible(node) && !node.querySelector('.node, .move-node'),
    );
    if (!nodes.length) continue;
    try {
      const candidates = samePosition(replay, pieces) ? [new Chess()] : [];
      let selected;
      for (const node of nodes) {
        replay.move(sanFromNode(node));
        if (samePosition(replay, pieces)) {
          const candidate = new Chess();
          candidate.loadPgn(replay.pgn());
          candidates.push(candidate);
          if (
            node.matches(
              '.selected, .active, .current, [aria-current="true"]',
            ) ||
            node.querySelector('.selected, [aria-current="true"]')
          )
            selected = candidate;
        }
      }
      if (selected) return selected;
      if (candidates.length === 1) return candidates[0];
      if (candidates.length > 1)
        throw new Error(
          'Ambiguous repeated position. Select the displayed move in the move list.',
        );
    } catch {
      // A partial or unfamiliar move list must never produce guessed FEN rights.
    }
  }
  if (
    !lists.some((list) => list.querySelector('.node, .move-node')) &&
    samePosition(game, pieces)
  )
    return game;
  throw new Error(
    'Cannot match this board to its full move history. Show the move list from move 1, or import a PGN. Custom starting positions need PGN/FEN import.',
  );
}

async function sendUpdate(payload) {
  const key = JSON.stringify(payload);
  if (key === lastSent && Date.now() - lastSentAt < 5000) return;
  const result = await chrome.runtime.sendMessage({
    type: 'board-update',
    payload,
  });
  if (result?.ok) {
    lastSent = key;
    lastSentAt = Date.now();
  }
}

async function sync() {
  if (!enabled || sending) return;
  sending = true;
  try {
    let payload;
    try {
      const game = readGame();
      payload = {
        status: 'connected',
        pgn: game.pgn(),
        fen: game.fen(),
        url: location.href,
      };
    } catch (error) {
      payload = { status: 'error', error: error.message, url: location.href };
    }
    await sendUpdate(payload);
  } catch {
    // Extension reloads invalidate existing content scripts; reloading the tab reconnects.
  } finally {
    sending = false;
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'set-enabled') return;
  enabled = message.enabled;
  lastSent = '';
  if (enabled) void sync();
  else void sendUpdate({ status: 'stopped', url: location.href });
});

chrome.runtime
  .sendMessage({ type: 'get-state' })
  .then((state) => {
    enabled = Boolean(state?.enabled);
    void sync();
  })
  .catch(() => {});
setInterval(sync, 1000);
