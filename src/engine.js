import { Chess } from 'chess.js';

const aborted = () => new DOMException('Analysis cancelled', 'AbortError');

export class Engine {
  constructor({ onStatus = () => {} } = {}) {
    this.onStatus = onStatus;
    this.listeners = new Set();
    this.generation = 0;
    this.queue = Promise.resolve();
    this.worker = new Worker('/engine/stockfish-19-single.js');
    this.worker.onmessage = ({ data }) => {
      for (const line of String(data).split('\n')) {
        for (const listener of [...this.listeners]) listener(line);
      }
    };
    this.worker.onerror = (event) =>
      this.fail(
        new Error(
          event.message ||
            'Stockfish could not load. Reload the page to retry.',
        ),
      );
    this.onStatus('Loading Stockfish…');
    this.ready = this.initialize();
    // Keep a loading failure handled until the first analyze call awaits it.
    this.ready.catch(() => {});
  }

  async initialize() {
    await this.command('uci', (line) => line === 'uciok');
    this.worker.postMessage('setoption name Hash value 64');
    await this.command('isready', (line) => line === 'readyok');
    this.onStatus('Stockfish ready');
  }

  command(command, matches, timeout = 60000) {
    if (this.error) return Promise.reject(this.error);
    return new Promise((resolve, reject) => {
      const listener = (line, error) => {
        if (!error && !matches(line)) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        error ? reject(error) : resolve(line);
      };
      const timer = setTimeout(
        () =>
          this.fail(
            new Error('Stockfish timed out. Reload the page to retry.'),
          ),
        timeout,
      );
      this.listeners.add(listener);
      this.worker.postMessage(command);
    });
  }

  fail(error) {
    if (this.error) return;
    this.error = error;
    for (const listener of [...this.listeners]) listener('', error);
    this.worker.terminate();
    this.onStatus(error.message);
  }

  analyze(fen, { time = 1500, multiPv = 5 } = {}) {
    const generation = this.generation;
    const result = this.queue
      .catch(() => {})
      .then(async () => {
        await this.ready;
        if (generation !== this.generation) throw aborted();
        const board = new Chess(fen);
        if (board.isGameOver()) return [];
        const count = Math.min(
          Math.max(1, Math.floor(multiPv)),
          board.moves().length,
        );
        const duration = Math.max(100, Math.min(30000, Number(time) || 1500));
        this.worker.postMessage(`setoption name MultiPV value ${count}`);
        this.worker.postMessage(`position fen ${fen}`);
        let cycle = [];
        let complete = null;
        let partial = [];
        const sign = board.turn() === 'w' ? 1 : -1;
        const collect = (line) => {
          if (!line.startsWith('info ')) return;
          const depth = Number(line.match(/\bdepth (\d+)/)?.[1]);
          const rank = Number(line.match(/\bmultipv (\d+)/)?.[1] || 1);
          const score = line.match(/\bscore (cp|mate) (-?\d+)/);
          const pv = line.match(/\bpv (.+)$/);
          if (!depth || !score || !pv || rank > count) return;
          // Stockfish repeats MultiPV groups while searching; never mix old ranks into a new group.
          if (rank === 1) cycle = [];
          if (/(?:upperbound|lowerbound)/.test(line)) return;
          if (rank !== cycle.length + 1) return;
          cycle.push({
            rank,
            depth,
            score: { type: score[1], value: Number(score[2]) * sign },
            moves: pv[1].trim().split(/\s+/),
          });
          const roots = new Set();
          const unique = cycle.filter((candidate) => {
            if (roots.has(candidate.moves[0])) return false;
            roots.add(candidate.moves[0]);
            return true;
          });
          if (
            unique.length > partial.length ||
            (unique.length === partial.length && depth >= partial[0]?.depth)
          )
            partial = unique;
          if (
            unique.length === count &&
            cycle.every((candidate) => candidate.depth === depth) &&
            (!complete || depth >= complete[0].depth)
          ) {
            complete = [...cycle];
          }
        };
        this.listeners.add(collect);
        this.searching = true;
        this.onStatus('Analyzing…');
        try {
          await this.command(
            `go movetime ${duration}`,
            (line) => line.startsWith('bestmove '),
            duration + 20000,
          );
        } finally {
          this.searching = false;
          this.listeners.delete(collect);
        }
        if (generation !== this.generation) throw aborted();
        const lines = complete || partial;
        if (!lines.length)
          throw new Error(
            'Stockfish returned no analysis. Try analyzing again.',
          );
        this.onStatus('Stockfish ready');
        return lines;
      });
    this.queue = result;
    return result;
  }

  cancel() {
    this.generation++;
    if (this.searching && !this.error) this.worker.postMessage('stop');
  }

  terminate() {
    this.cancel();
    this.fail(new Error('Stockfish stopped'));
  }
}
