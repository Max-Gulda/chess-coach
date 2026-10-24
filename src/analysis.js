import { Chess } from 'chess.js';

const names = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function uciMove(board, uci) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci || '')) return null;
  try {
    return board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci[4] ? { promotion: uci[4] } : {}),
    });
  } catch {
    return null;
  }
}

export function lineToSan(fen, moves) {
  const board = new Chess(fen);
  const result = [];
  for (const uci of moves) {
    const move = uciMove(board, uci);
    if (!move) break;
    result.push(move.san);
  }
  return result;
}

function material(board, color) {
  return board
    .board()
    .flat()
    .reduce(
      (sum, piece) =>
        sum +
        (piece ? values[piece.type] * (piece.color === color ? 1 : -1) : 0),
      0,
    );
}

function scoreText(score) {
  if (score.type === 'mate') {
    return `${score.value > 0 ? 'White' : 'Black'} has a forced mate in ${Math.abs(score.value)}`;
  }
  if (Math.abs(score.value) < 15) return 'the position is roughly equal';
  return `${score.value > 0 ? 'White' : 'Black'} is ahead by about ${(Math.abs(score.value) / 100).toFixed(1)} pawns in evaluation`;
}

export function explainMove(
  beforeFen,
  playedUci,
  bestLines = [],
  afterLines = [],
) {
  const board = new Chess(beforeFen);
  const color = board.turn();
  const played = uciMove(board, playedUci);
  if (!played) throw new Error('Cannot review an illegal move.');
  const best = bestLines[0];
  const bestSan = best
    ? lineToSan(beforeFen, best.moves.slice(0, 1))[0] || ''
    : '';
  let afterScore = afterLines[0]?.score;
  if (board.isCheckmate())
    afterScore = { type: 'mate', value: color === 'w' ? 1 : -1 };
  else if (board.isDraw()) afterScore = { type: 'cp', value: 0 };
  const beforeScore = best?.score;
  let loss = null;
  let label = 'Unclear';
  const parts = [];
  const isBest = best?.moves[0] === playedUci;
  if (beforeScore && afterScore) {
    if (beforeScore.type === 'cp' && afterScore.type === 'cp') {
      loss = isBest
        ? 0
        : Math.max(
            0,
            (beforeScore.value - afterScore.value) * (color === 'w' ? 1 : -1),
          );
      label = isBest
        ? 'Best'
        : loss < 50
          ? 'Good'
          : loss < 100
            ? 'Inaccuracy'
            : loss < 200
              ? 'Mistake'
              : 'Blunder';
      if (isBest) parts.push(`${played.san} matches Stockfish’s first choice.`);
      else if (loss < 20)
        parts.push(
          `${played.san} is close to Stockfish’s first choice${bestSan ? `, ${bestSan}` : ''}.`,
        );
      else
        parts.push(
          `${played.san} gives up about ${(loss / 100).toFixed(1)} pawns of evaluation compared with ${bestSan}. This measures the position’s quality, not necessarily lost material.`,
        );
      parts.push(`After this move, ${scoreText(afterScore)}.`);
    } else {
      const moverSign = color === 'w' ? 1 : -1;
      const winningMateBefore =
        beforeScore.type === 'mate' &&
        Math.sign(beforeScore.value) === moverSign;
      const winningMateAfter =
        afterScore.type === 'mate' && Math.sign(afterScore.value) === moverSign;
      const losingMateBefore =
        beforeScore.type === 'mate' &&
        Math.sign(beforeScore.value) === -moverSign;
      const losingMateAfter =
        afterScore.type === 'mate' &&
        Math.sign(afterScore.value) === -moverSign;
      label = isBest
        ? 'Best'
        : (losingMateAfter && !losingMateBefore) ||
            (winningMateBefore && !winningMateAfter)
          ? 'Blunder'
          : 'Good';
      if (board.isCheckmate()) parts.push(`${played.san} delivers checkmate.`);
      else if (winningMateBefore && !winningMateAfter)
        parts.push(
          `${played.san} misses a forced mate. ${bestSan} keeps the mating continuation.`,
        );
      else if (losingMateAfter && !losingMateBefore)
        parts.push(
          `${played.san} allows a forced mate for ${color === 'w' ? 'Black' : 'White'}.`,
        );
      else
        parts.push(
          `${played.san}${isBest ? ' matches Stockfish’s first choice' : ' keeps the same mating outcome at this search depth'}.`,
        );
      if (!board.isCheckmate())
        parts.push(`After this move, ${scoreText(afterScore)}.`);
    }
  } else {
    parts.push(
      'Analyze the previous position and this position to compare this move with Stockfish’s recommendation.',
    );
  }
  if (board.isDraw()) parts.push('The game is drawn in this position.');

  const punishment = afterLines[0]?.moves || [];
  const materialBefore = material(board, color);
  const next = punishment[0] && uciMove(board, punishment[0]);
  if (next) {
    if (board.isCheckmate()) parts.push(`The reply ${next.san} is checkmate.`);
    else {
      const details = [];
      if (next.captured) details.push(`captures your ${names[next.captured]}`);
      if (board.isCheck()) details.push('gives check');
      parts.push(
        `Stockfish’s reply is ${next.san}${details.length ? `: it ${details.join(' and ')}` : ''}.`,
      );
    }
    // shortcut: explain only concrete events in the first six plies, not speculative positional motifs.
    for (const uci of punishment.slice(1, 6)) if (!uciMove(board, uci)) break;
    const materialLoss = materialBefore - material(board, color);
    if (materialLoss >= 1)
      parts.push(
        `In the first ${Math.min(punishment.length, 6)} moves shown (counting each side’s turn), your material balance falls by ${materialLoss} pawn${materialLoss === 1 ? '' : 's'}.`,
      );
  }
  return {
    label,
    loss,
    text: parts.join(' '),
    bestSan,
    playedSan: played.san,
    punishment,
  };
}
