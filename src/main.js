import './style.css';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { Engine } from './engine.js';
import { uciMove, lineToSan, explainMove } from './analysis.js';

const $ = (id) => document.getElementById(id);
const engine = new Engine({
  onStatus: (status) => ($('engine-status').textContent = status),
});
let rootFen = DEFAULT_POSITION;
let moves = [];
let positions = [rootFen];
let headers = {};
let ply = 0;
let flipped = false;
let selected = null;
let preview = null;
let request = 0;
let reviewing = false;
let liveTime = 0;
const cache = new Map();
const grades = new Map();
const pieceNames = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
const demo =
  '[Event "A lesson in king safety"]\n[White "White"]\n[Black "Black"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';

function notify(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => ($('toast').hidden = true), 4500);
}

function boardNow() {
  if (!preview) return new Chess(positions[ply]);
  const b = new Chess(preview.fen);
  for (const m of preview.moves.slice(0, preview.step)) uciMove(b, m);
  return b;
}

function scoreText(score) {
  if (!score) return '—';
  if (score.type === 'mate')
    return `${score.value < 0 ? '−' : ''}M${Math.abs(score.value)}`;
  return `${score.value > 0 ? '+' : ''}${(score.value / 100).toFixed(2)}`;
}

function drawBoard() {
  const b = boardNow(),
    legal = selected ? b.moves({ square: selected, verbose: true }) : [];
  const files = [...'abcdefgh'];
  if (flipped) files.reverse();
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const last =
    preview && preview.step
      ? preview.moves[preview.step - 1]
      : moves[ply - 1]?.uci;
  const hint = preview ? null : cache.get(positions[ply])?.[0]?.moves[0];
  $('board').replaceChildren();
  for (const rank of ranks)
    for (const file of files) {
      const square = file + rank,
        piece = b.get(square),
        el = document.createElement('button');
      el.className =
        'square' +
        ((file.charCodeAt(0) + rank) % 2 === 0 ? ' dark' : '') +
        (selected === square ? ' selected' : '') +
        (last && (last.slice(0, 2) === square || last.slice(2, 4) === square)
          ? ' last'
          : '') +
        (legal.some((m) => m.to === square) ? ' legal' : '');
      el.dataset.square = square;
      el.setAttribute(
        'aria-label',
        `${square}${piece ? ` ${piece.color === 'w' ? 'White' : 'Black'} ${pieceNames[piece.type]}` : ''}`,
      );
      if (file === files[0]) {
        const c = document.createElement('span');
        c.className = 'coord rank';
        c.textContent = rank;
        el.append(c);
      }
      if (rank === ranks[7]) {
        const c = document.createElement('span');
        c.className = 'coord file';
        c.textContent = file;
        el.append(c);
      }
      if (piece) {
        const img = document.createElement('img');
        img.src = `/pieces/${piece.color}${piece.type.toUpperCase()}.svg`;
        img.alt = '';
        img.draggable = !preview;
        img.addEventListener('dragstart', (e) => {
          selected = square;
          e.dataTransfer.setData('text/plain', square);
        });
        el.append(img);
      }
      el.onclick = () => squareClick(square);
      el.ondragover = (e) => e.preventDefault();
      el.ondrop = (e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData('text/plain');
        if (from) attemptMove(from, square);
      };
      if (hint?.slice(0, 2) === square) el.classList.add('best-from');
      if (hint?.slice(2, 4) === square) el.classList.add('best-to');
      $('board').append(el);
    }
  $('top-player').textContent =
    headers[flipped ? 'White' : 'Black'] ||
    (flipped ? 'White pieces' : 'Black pieces');
  $('bottom-player').textContent =
    headers[flipped ? 'Black' : 'White'] ||
    (flipped ? 'Black pieces' : 'White pieces');
  $('position-status').textContent = b.isCheckmate()
    ? 'Checkmate'
    : b.isDraw()
      ? 'Draw'
      : `${b.turn() === 'w' ? 'White' : 'Black'} to move${b.isCheck() ? ' · Check' : ''}`;
  $('top-sub').textContent = headers.Event || '';
  $('top-sub').hidden = !headers.Event;
  $('move-counter').textContent = ply
    ? `${moves[ply - 1].number}${moves[ply - 1].color === 'w' ? '.' : '…'} ${moves[ply - 1].san}`
    : 'Starting position';
  $('start').disabled = $('previous').disabled = ply === 0;
  $('next').disabled = $('end').disabled = ply === moves.length;
  $('preview-bar').hidden = !preview;
  if (preview) {
    $('preview-step').textContent = `${preview.step} / ${preview.moves.length}`;
    $('preview-back').disabled = preview.step === 0;
    $('preview-next').disabled = preview.step === preview.moves.length;
  }
}

function squareClick(square) {
  if (preview) {
    notify('Return to your game before making a move.');
    return;
  }
  const b = boardNow();
  if (selected && selected !== square) {
    const from = selected;
    selected = null;
    attemptMove(from, square);
    return;
  }
  selected = b.get(square)?.color === b.turn() ? square : null;
  drawBoard();
}

async function attemptMove(from, to) {
  if (preview) return;
  const b = new Chess(positions[ply]);
  const possible = b
    .moves({ square: from, verbose: true })
    .filter((m) => m.to === to);
  if (!possible.length) {
    selected = b.get(to)?.color === b.turn() ? to : null;
    drawBoard();
    return;
  }
  if (
    ply < moves.length &&
    !confirm(
      'Replace the later moves with a new variation? Export your game first if you want to keep the original.',
    )
  )
    return;
  let promotion;
  if (possible.some((m) => m.promotion))
    promotion = await choosePromotion(b.turn());
  if (promotion === null) return;
  try {
    const number = Number(b.fen().split(' ')[5]);
    const m = b.move({ from, to, promotion });
    if (ply < moves.length)
      notify(
        'You started a variation. Use Import to reload the original game.',
      );
    moves = moves.slice(0, ply);
    positions = positions.slice(0, ply + 1);
    moves.push({ ...m, uci: from + to + (promotion || ''), number });
    positions.push(b.fen());
    ply++;
    selected = null;
    grades.clear();
    save();
    render();
    analyze();
  } catch {
    selected = null;
    drawBoard();
  }
}

function choosePromotion(color) {
  return new Promise((resolve) => {
    $('promotion-choices').replaceChildren();
    for (const p of ['q', 'r', 'b', 'n']) {
      const el = document.createElement('button');
      el.innerHTML = `<img src="/pieces/${color}${p.toUpperCase()}.svg" alt="${pieceNames[p]}">`;
      el.onclick = () => {
        $('promotion-dialog').close();
        resolve(p);
      };
      $('promotion-choices').append(el);
    }
    $('promotion-dialog').oncancel = () => resolve(null);
    $('promotion-dialog').showModal();
  });
}

function renderHistory() {
  $('game-title').textContent =
    headers.White || headers.Black
      ? `${headers.White || 'White'} vs ${headers.Black || 'Black'}${headers.Result ? ' · ' + headers.Result : ''}`
      : '';
  $('history').replaceChildren();
  if (!moves.length) {
    $('history').innerHTML = '<div class="empty-state">No moves yet.</div>';
    return;
  }
  let row;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!row || m.color === 'w') {
      row = document.createElement('div');
      row.className = 'history-row';
      const num = document.createElement('span');
      num.textContent = `${m.number}.`;
      row.append(num);
      if (m.color === 'b') row.append(document.createElement('span'));
      $('history').append(row);
    }
    const btn = document.createElement('button');
    btn.className = i + 1 === ply ? 'current' : '';
    btn.textContent = m.san;
    btn.onclick = () => navigate(i + 1);
    const grade = grades.get(i + 1);
    if (grade) {
      const dot = document.createElement('span');
      dot.className = `quality ${grade.label.toLowerCase()}`;
      dot.title = grade.label;
      btn.append(dot);
    }
    row.append(btn);
  }
  const active = $('history').querySelector('.current');
  if (active) {
    const list = $('history');
    list.scrollTop +=
      active.getBoundingClientRect().top -
      list.getBoundingClientRect().top -
      list.clientHeight / 2;
  }
}

function render() {
  drawBoard();
  renderHistory();
}

function save() {
  try {
    localStorage.setItem(
      'chess-coach',
      JSON.stringify({
        rootFen,
        moves: moves.map((m) => m.uci),
        headers,
        ply,
        flipped,
      }),
    );
  } catch {
    notify('Browser storage is full. Export your game to keep a copy.');
  }
}

function loadGame(text, { atEnd = false } = {}) {
  const b = new Chess();
  let parsed;
  try {
    parsed = new Chess(text.trim());
  } catch {
    b.loadPgn(text.trim());
    parsed = b;
  }
  const hist = parsed.history({ verbose: true });
  rootFen = hist.length ? hist[0].before : parsed.fen();
  headers = Object.fromEntries(
    Object.entries(parsed.getHeaders()).filter(([, value]) => value !== '?'),
  );
  moves = hist.map((m) => ({
    ...m,
    uci: m.from + m.to + (m.promotion || ''),
    number: Number(m.before.split(' ')[5]),
  }));
  positions = [rootFen, ...hist.map((m) => m.after)];
  ply = atEnd ? moves.length : 0;
  selected = null;
  preview = null;
  grades.clear();
  save();
  render();
  analyze();
}

function navigate(index) {
  if (reviewing) {
    notify('Stop the game review before changing position.');
    return;
  }
  ply = Math.max(0, Math.min(index, moves.length));
  preview = null;
  selected = null;
  save();
  render();
  analyze();
}

async function getLines(
  fen,
  multiPv = 5,
  time = Number($('think-time').value),
) {
  const saved = cache.get(fen);
  if (saved && saved.length >= Math.min(multiPv, new Chess(fen).moves().length))
    return saved;
  const lines = await engine.analyze(fen, { time, multiPv });
  cache.set(fen, lines);
  return lines;
}

function renderLines(lines) {
  $('top-moves').replaceChildren();
  if (!lines.length) {
    const b = new Chess(positions[ply]);
    $('top-moves').innerHTML =
      '<div class="empty-state">' +
      (b.isCheckmate() ? 'Checkmate.' : 'This position is drawn.') +
      '</div>';
    $('analysis-status').textContent = 'Game over';
    $('eval-number').textContent = b.isCheckmate() ? 'M' : '0.0';
    $('eval-white').style.height = b.isCheckmate()
      ? b.turn() === 'w'
        ? '0%'
        : '100%'
      : '50%';
    return;
  }
  for (const line of lines.slice(0, 5)) {
    const san = lineToSan(positions[ply], line.moves);
    const el = document.createElement('button');
    el.className = 'move-line';
    const rank = document.createElement('span');
    rank.className = 'move-rank';
    rank.textContent = String(line.rank).padStart(2, '0');
    const body = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = san[0] || '—';
    el.title = san.slice(0, 7).join('  ');
    body.append(strong);
    const score = document.createElement('span');
    score.className = 'move-score';
    score.textContent = scoreText(line.score);
    el.append(rank, body, score);
    el.onclick = () => startPreview(positions[ply], line.moves);
    $('top-moves').append(el);
  }
  const score = lines[0].score;
  const cp =
    score.type === 'mate' ? (score.value >= 0 ? 1500 : -1500) : score.value;
  $('eval-white').style.height =
    `${Math.max(5, Math.min(95, 50 + 45 * Math.tanh(cp / 500)))}%`;
  $('eval-number').textContent = scoreText(score);
  $('analysis-status').textContent = `Stockfish 19 · depth ${lines[0].depth}`;
  drawBoard();
}

function startPreview(fen, line) {
  if (!line?.length) return;
  preview = { fen, moves: line, step: 1 };
  selected = null;
  drawBoard();
}

function showInsight(data) {
  const badge = $('move-badge');
  badge.textContent = data.label.toUpperCase();
  badge.className = `badge ${data.label.toLowerCase()}`;
  $('insight').replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = `${data.playedSan} · ${data.label.toLowerCase()}`;
  const p = document.createElement('p');
  p.textContent = data.text;
  $('insight').append(heading, p);
  const actions = document.createElement('div');
  actions.className = 'coach-actions';
  if (data.bestSan && ply > 0) {
    const best = cache.get(positions[ply - 1])?.[0];
    if (best) {
      const button = document.createElement('button');
      button.className = 'secondary';
      button.textContent = `Explore ${data.bestSan} →`;
      button.onclick = () => startPreview(positions[ply - 1], best.moves);
      actions.append(button);
    }
  }
  if (data.punishment?.length) {
    const button = document.createElement('button');
    button.className = 'secondary';
    button.textContent = 'See the response →';
    button.onclick = () => startPreview(positions[ply], data.punishment);
    actions.append(button);
  }
  $('insight').append(actions);
}

async function analyze() {
  const token = ++request;
  engine.cancel();
  if (reviewing) return;
  $('top-moves').classList.add('pending');
  $('analysis-status').textContent = 'Analyzing position…';
  if (!ply) {
    $('move-badge').textContent = '—';
    $('move-badge').className = 'badge';
    $('insight').innerHTML = '<p>Play a move to see its explanation.</p>';
  } else {
    $('insight').innerHTML = '<p>Comparing moves…</p>';
  }
  try {
    const lines = await getLines(positions[ply]);
    if (token !== request) return;
    renderLines(lines);
    $('top-moves').classList.remove('pending');
    if (ply) {
      const before = await getLines(positions[ply - 1]);
      if (token !== request) return;
      const explanation = explainMove(
        positions[ply - 1],
        moves[ply - 1].uci,
        before,
        lines,
      );
      grades.set(ply, explanation);
      showInsight(explanation);
      renderHistory();
    }
  } catch (e) {
    if (e.name === 'AbortError' || token !== request) return;
    $('analysis-status').textContent = 'Analysis unavailable';
    notify(e.message);
    $('insight').textContent =
      'The engine could not complete this analysis. Reload the page to retry.';
    $('top-moves').classList.remove('pending');
  }
}

async function reviewGame() {
  if (reviewing) {
    reviewing = false;
    request++;
    engine.cancel();
    $('review').textContent = 'Review whole game';
    $('review-status').textContent = 'Review stopped.';
    analyze();
    return;
  }
  if (!moves.length) {
    notify('Import a game or make a few moves first.');
    return;
  }
  reviewing = true;
  const token = ++request;
  engine.cancel();
  $('review').textContent = 'Stop review';
  $('top-moves').classList.add('pending');
  try {
    let before = await getLines(positions[0], 1, 900);
    for (let i = 1; i < positions.length; i++) {
      if (!reviewing || token !== request) return;
      $('review-status').textContent =
        `Reviewing move ${i} of ${moves.length}…`;
      const after = await getLines(positions[i], 1, 900);
      if (!reviewing || token !== request) return;
      grades.set(
        i,
        explainMove(positions[i - 1], moves[i - 1].uci, before, after),
      );
      before = after;
      renderHistory();
    }
    const count = [...grades.values()].filter((g) =>
      ['Mistake', 'Blunder'].includes(g.label),
    ).length;
    $('review-status').textContent =
      `Complete · ${count} costly move${count === 1 ? '' : 's'} to revisit.`;
  } catch (e) {
    if (e.name !== 'AbortError') {
      notify(e.message);
      $('review-status').textContent = 'Review interrupted.';
    }
  } finally {
    if (token === request) {
      reviewing = false;
      $('review').textContent = 'Review whole game';
      analyze();
    }
  }
}
$('start').onclick = () => navigate(0);
$('previous').onclick = () => navigate(ply - 1);
$('next').onclick = () => navigate(ply + 1);
$('end').onclick = () => navigate(moves.length);
$('flip').onclick = () => {
  flipped = !flipped;
  save();
  drawBoard();
};
$('think-time').onchange = () => {
  cache.clear();
  analyze();
};
$('preview-close').onclick = () => {
  preview = null;
  drawBoard();
};
$('preview-back').onclick = () => {
  preview.step--;
  drawBoard();
};
$('preview-next').onclick = () => {
  preview.step++;
  drawBoard();
};
$('review').onclick = reviewGame;
$('import-open').onclick = () => {
  $('import-error').textContent = '';
  $('import-dialog').showModal();
};
$('import-close').onclick = () => $('import-dialog').close();
function stopReview() {
  reviewing = false;
  request++;
  engine.cancel();
  $('review').textContent = 'Review whole game';
  $('review-status').textContent = '';
}
$('import-form').onsubmit = (e) => {
  e.preventDefault();
  try {
    stopReview();
    loadGame($('import-text').value);
    $('import-dialog').close();
  } catch (error) {
    $('import-error').textContent =
      'Could not read that game or position. Paste a complete PGN or valid six-field FEN.';
  }
};
$('demo').onclick = () => {
  stopReview();
  loadGame(demo);
  $('import-dialog').close();
};
$('import-file').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 2000000) {
    $('import-error').textContent = 'Choose a PGN smaller than 2 MB.';
    return;
  }
  $('import-text').value = await file.text();
};
$('reset').onclick = () => {
  if (
    moves.length &&
    !confirm('Start a fresh board? Export first if you want to keep this game.')
  )
    return;
  stopReview();
  loadGame(DEFAULT_POSITION);
};
$('export').onclick = () => {
  const b = new Chess(rootFen);
  for (const m of moves) uciMove(b, m.uci);
  for (const [key, value] of Object.entries(headers)) b.setHeader(key, value);
  const blob = new Blob([b.pgn()], { type: 'application/x-chess-pgn' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chess-coach-game.pgn';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener('keydown', (e) => {
  if (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) ||
    document.querySelector('dialog[open]')
  )
    return;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (preview) {
      preview.step = Math.max(0, preview.step - 1);
      drawBoard();
    } else navigate(ply - 1);
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (preview) {
      preview.step = Math.min(preview.moves.length, preview.step + 1);
      drawBoard();
    } else navigate(ply + 1);
  }
});
$('live-enabled').onchange = () => {
  if ($('live-enabled').checked) {
    stopReview();
    $('live-status').textContent = 'Waiting for extension…';
  } else $('live-status').textContent = 'Paused.';
};
let polling = false;
setInterval(async () => {
  if (!$('live-enabled').checked || polling) return;
  polling = true;
  try {
    const response = await fetch('/api/live');
    if (!response.ok) throw Error('Local sync server unavailable.');
    const live = await response.json();
    if (!live) return;
    if (Date.now() - live.receivedAt > 12000) {
      $('live-status').textContent =
        'No recent update. Keep the Chess.com tab open and check the extension.';
      return;
    }
    if (live.status === 'error') {
      $('live-status').textContent =
        live.error || 'The extension could not read this board.';
      return;
    }
    if (live.status === 'stopped') {
      $('live-status').textContent = 'The extension has stopped syncing.';
      return;
    }
    if (live.receivedAt === liveTime) return;
    liveTime = live.receivedAt;
    const incoming = new Chess(live.fen);
    if (live.fen !== positions[ply]) {
      stopReview();
      if (live.pgn) {
        const check = new Chess();
        check.loadPgn(live.pgn);
        if (check.fen() !== incoming.fen())
          throw Error('Live moves do not match the board.');
        loadGame(live.pgn, { atEnd: true });
      } else loadGame(live.fen, { atEnd: true });
    }
    $('live-status').textContent =
      `Connected · ${new Date(live.receivedAt).toLocaleTimeString()}`;
  } catch (error) {
    $('live-status').textContent = error.message;
  } finally {
    polling = false;
  }
}, 1200);
try {
  const saved = JSON.parse(localStorage.getItem('chess-coach'));
  if (saved) {
    const b = new Chess(saved.rootFen);
    rootFen = b.fen();
    positions = [rootFen];
    moves = [];
    for (const uci of saved.moves) {
      const number = Number(b.fen().split(' ')[5]);
      const m = uciMove(b, uci);
      if (!m) throw Error('Invalid saved move');
      moves.push({ ...m, uci, number });
      positions.push(b.fen());
    }
    headers = saved.headers || {};
    ply = Math.min(saved.ply || 0, moves.length);
    flipped = !!saved.flipped;
  }
} catch {
  notify('The saved game could not be restored. Starting a fresh board.');
  rootFen = DEFAULT_POSITION;
  moves = [];
  positions = [rootFen];
  ply = 0;
}

render();
analyze();
