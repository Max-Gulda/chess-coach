import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from 'chess.js';
import { explainMove, lineToSan, uciMove } from '../src/analysis.js';

function line(value, moves, type = 'cp') {
  return { rank: 1, depth: 15, score: { type, value }, moves };
}

test('legal UCI moves convert to SAN and invalid moves are rejected', () => {
  const start = new Chess().fen();
  assert.deepEqual(lineToSan(start, ['e2e4', 'e7e5', 'g1f3']), [
    'e4',
    'e5',
    'Nf3',
  ]);
  assert.equal(uciMove(new Chess(), 'e2e5'), null);
  assert.equal(uciMove(new Chess(), 'invalid'), null);
});

test('UCI conversion preserves underpromotion and en passant captures', () => {
  const promotion = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');
  assert.equal(uciMove(promotion, 'a7a8n').promotion, 'n');
  const enPassant = new Chess('7k/8/8/3pP3/8/8/8/7K w - d6 0 1');
  assert.equal(uciMove(enPassant, 'e5d6').captured, 'p');
});

test('White move quality uses the loss in White perspective evaluation', () => {
  const review = explainMove(
    new Chess().fen(),
    'f2f3',
    [line(30, ['e2e4'])],
    [line(-220, ['e7e5'])],
  );
  assert.equal(review.label, 'Blunder');
  assert.equal(review.loss, 250);
});

test('Black move quality reverses the evaluation-loss direction', () => {
  const board = new Chess();
  board.move('e4');
  const review = explainMove(
    board.fen(),
    'f7f6',
    [line(20, ['e7e5'])],
    [line(270, ['d2d4'])],
  );
  assert.equal(review.label, 'Blunder');
  assert.equal(review.loss, 250);
});

test('delivering checkmate is recognized without an after-position engine line', () => {
  const board = new Chess();
  for (const move of ['f3', 'e5', 'g4']) board.move(move);
  const review = explainMove(
    board.fen(),
    'd8h4',
    [line(-1, ['d8h4'], 'mate')],
    [],
  );
  assert.equal(review.label, 'Best');
  assert.match(review.text, /delivers checkmate/);
});

test('allowing forced mate is described through the concrete mating reply', () => {
  const board = new Chess();
  for (const move of ['f3', 'e5']) board.move(move);
  const review = explainMove(
    board.fen(),
    'g2g4',
    [line(-100, ['e2e4'])],
    [line(-1, ['d8h4'], 'mate')],
  );
  assert.equal(review.label, 'Blunder');
  assert.match(review.text, /allows a forced mate/);
  assert.match(review.text, /reply Qh4# is checkmate/);
  assert.equal(review.loss, null);
});
