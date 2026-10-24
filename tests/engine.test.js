import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from 'chess.js';
import { Engine } from '../src/engine.js';

class FakeWorker {
  postMessage(command) {
    if (command === 'uci') queueMicrotask(() => this.emit('uciok'));
    if (command === 'isready') queueMicrotask(() => this.emit('readyok'));
    if (command.startsWith('go ')) {
      this.timer = setTimeout(() => {
        const roots = ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'b1c3'];
        for (let rank = 1; rank <= 5; rank++) {
          this.emit(
            `info depth 10 multipv ${rank} score cp ${30 - rank} pv ${roots[rank - 1]}`,
          );
        }
        // A partial re-search at the same depth must preserve the completed group.
        this.emit('info depth 10 multipv 1 score cp 70 pv d2d4');
        this.emit('info depth 10 multipv 2 score cp 65 pv e2e4');
        // Ranks from different depths cannot form a complete group.
        this.emit('info depth 11 multipv 1 score cp 99 pv d2d4 d7d5');
        this.emit('info depth 11 multipv 2 score cp 98 pv e2e4');
        this.emit('info depth 10 multipv 3 score cp 27 pv g1f3');
        this.emit('info depth 10 multipv 4 score cp 26 pv c2c4');
        this.emit('info depth 10 multipv 5 score cp 25 pv b1c3');
        // Even a full group is invalid if two ranks repeat the same root move.
        for (let rank = 1; rank <= 5; rank++) {
          this.emit(
            `info depth 12 multipv ${rank} score cp 50 pv ${roots[rank === 4 ? 2 : rank - 1]}`,
          );
        }
        this.emit('bestmove e2e4');
      }, 15);
    }
    if (command === 'stop') {
      clearTimeout(this.timer);
      queueMicrotask(() => this.emit('bestmove e2e4'));
    }
  }

  emit(data) {
    this.onmessage({ data });
  }

  terminate() {
    clearTimeout(this.timer);
  }
}

function createEngine(t) {
  const originalWorker = globalThis.Worker;
  globalThis.Worker = FakeWorker;
  const engine = new Engine();
  t.after(() => {
    engine.terminate();
    globalThis.Worker = originalWorker;
  });
  return engine;
}

test('MultiPV returns a complete search depth with five distinct root moves', async (t) => {
  const engine = createEngine(t);
  const lines = await engine.analyze(new Chess().fen());
  assert.equal(lines.length, 5);
  assert.ok(lines.every((line) => line.depth === 10));
  assert.equal(new Set(lines.map((line) => line.moves[0])).size, 5);
  assert.deepEqual(lines[0].score, { type: 'cp', value: 29 });
});

test('engine evaluations are normalized to White perspective', async (t) => {
  const engine = createEngine(t);
  const board = new Chess();
  board.move('e4');
  assert.equal((await engine.analyze(board.fen()))[0].score.value, -29);
});

test('cancellation rejects current and queued work while keeping the engine usable', async (t) => {
  const engine = createEngine(t);
  const first = engine.analyze(new Chess().fen());
  const queued = engine.analyze(new Chess().fen());
  const rejected = Promise.all([
    assert.rejects(first, { name: 'AbortError' }),
    assert.rejects(queued, { name: 'AbortError' }),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 1));
  engine.cancel();
  await rejected;
  assert.equal((await engine.analyze(new Chess().fen())).length, 5);
});

test('invalid positions reject without blocking subsequent analysis', async (t) => {
  const engine = createEngine(t);
  await assert.rejects(engine.analyze('invalid FEN'));
  assert.equal((await engine.analyze(new Chess().fen())).length, 5);
});
