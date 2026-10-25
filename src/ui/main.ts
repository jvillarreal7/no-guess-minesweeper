import './style.css';
import { createBoard } from '../core/board';
import {
  DIFFICULTIES,
  validateCustom,
  type Difficulty,
  type DifficultyName,
} from '../core/difficulty';
import { Game } from '../core/game';
import { recordPlayed, recordWin, statsFor, statsKey } from '../core/stats';
import { boardQuery, parseBoardQuery, specFor } from '../generator/share';
import type { SolveResult } from '../solver/types';
import { CatMode, onDoubleTap, onPressAndHold } from './cat-mode';
import { EngineClient } from './engine-client';
import { Hud } from './hud';
import { attachInput } from './input';
import { BoardView } from './render';
import {
  loadCatMode,
  loadDifficultyChoice,
  loadStats,
  saveCatMode,
  saveDifficultyChoice,
  saveStats,
} from './storage';

/** Show the "generating" overlay only if generation takes longer than this. */
const SPINNER_DELAY_MS = 150;
const TIMER_TICK_MS = 250;

/** What the hardest step of a board's solve needed, from its first click. */
const TIER_LABELS: Record<SolveResult['maxTier'], string> = {
  0: 'nothing beyond the opening',
  1: 'basic counting',
  2: 'pattern reasoning (subsets and overlaps)',
  3: 'advanced reasoning (enumeration and the mine count)',
};

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

const els = {
  difficulty: byId<HTMLSelectElement>('difficulty'),
  custom: byId<HTMLFormElement>('custom'),
  customWidth: byId<HTMLInputElement>('custom-width'),
  customHeight: byId<HTMLInputElement>('custom-height'),
  customMines: byId<HTMLInputElement>('custom-mines'),
  customStart: byId<HTMLButtonElement>('custom-start'),
  customMessage: byId<HTMLElement>('custom-message'),
  board: byId<HTMLElement>('board'),
  busy: byId<HTMLElement>('busy'),
  hint: byId<HTMLButtonElement>('hint'),
  hints: byId<HTMLElement>('hints'),
  share: byId<HTMLButtonElement>('share'),
  stats: byId<HTMLElement>('stats'),
};

const board = new BoardView(els.board);
const hud = new Hud({
  mines: byId<HTMLOutputElement>('mines'),
  timer: byId<HTMLOutputElement>('timer'),
  face: byId<HTMLButtonElement>('restart'),
  status: byId<HTMLElement>('status'),
});
const engine = new EngineClient();
// If a cat fails to load, leave cat mode (and save that, so a reload doesn't retry and fail).
const catMode = new CatMode(byId<HTMLElement>('board-frame'), () => {
  catMode.set(false);
  saveCatMode(false);
  hud.setStatus("The cat couldn't make it this time.");
  render();
});

let difficulty: Difficulty = DIFFICULTIES.beginner;
let seed = '';
/** Known once the board exists; with the seed it identifies the board in the URL. */
let firstClick: number | null = null;
let game: Game | null = null;
let maxTier: SolveResult['maxTier'] = 0;
let hintsUsed = 0;
/** Whether this game has been counted as played yet (on the player's first move). */
let playedRecorded = false;
let busy = false;
/** Bumped on every new game, so a worker reply for an abandoned game is ignored. */
let generation = 0;
let timerHandle: number | undefined;
let stats = loadStats();

/** A fresh random seed. UI-side randomness only; the engine uses the seeded RNG. */
function newSeed(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(2)), (n) => n.toString(36)).join('');
}

/** Keeps the address bar pointing at the current board, so copying it shares the board. */
function syncUrl(): void {
  const query = boardQuery({ ...difficulty, seed, firstClick });
  history.replaceState(null, '', `${location.pathname}?${query}`);
}

function newGame(next: Difficulty = difficulty, fixedSeed?: string): void {
  difficulty = next;
  seed = fixedSeed ?? newSeed();
  firstClick = null;
  game = null;
  maxTier = 0;
  hintsUsed = 0;
  playedRecorded = false;
  busy = false;
  generation++;
  els.busy.hidden = true;
  board.setSize(next.width, next.height);
  board.setHint(null);
  catMode.setReveal(false);
  syncUrl();
  hud.setStatus('Click any cell to start. The first click is always an opening.');
  render();
}

function render(): void {
  const current = game;
  board.render(current ? (i) => current.cellView(i) : () => 'hidden');
  hud.setMines(current ? current.minesRemaining : difficulty.mineCount);
  hud.setTime(current ? current.elapsedMs() : 0);
  hud.setFace(busy ? 'busy' : (current?.status ?? 'ready'), catMode.enabled);
  const playable = !busy && current !== null && !current.isOver;
  els.hint.disabled = !playable;
  els.hint.title = current ? '' : 'Your first click is always safe.';
  els.share.disabled = firstClick === null;
  els.share.title = firstClick === null ? 'Make your first click to get a shareable board.' : '';
  els.hints.textContent = `Hints used: ${hintsUsed}`;
  renderStats();
  syncTimer();
}

function renderStats(): void {
  const key = statsKey(difficulty);
  const s = statsFor(stats, key);
  const name = key in DIFFICULTIES ? key[0].toUpperCase() + key.slice(1) : `Custom ${key}`;
  const best = s.bestMs === null ? '—' : `${(s.bestMs / 1000).toFixed(1)} s`;
  els.stats.textContent = `${name}: won ${s.won} of ${s.played} · best ${best} (no hints)`;
}

function syncTimer(): void {
  const running = game?.status === 'playing';
  if (running && timerHandle === undefined) {
    timerHandle = window.setInterval(() => hud.setTime(game?.elapsedMs() ?? 0), TIMER_TICK_MS);
  } else if (!running && timerHandle !== undefined) {
    window.clearInterval(timerHandle);
    timerHandle = undefined;
  }
}

/** Counts the current game as played, the first time the player changes the board. */
function recordPlayedOnce(): void {
  if (playedRecorded) return;
  playedRecorded = true;
  stats = recordPlayed(stats, statsKey(difficulty));
  saveStats(stats);
}

/** Call after every move: updates the status line and records a finished game once. */
function afterMove(current: Game, wasOver: boolean): void {
  if (!current.isOver) {
    hud.setStatus('');
    return;
  }
  if (wasOver) return;
  const rating = `This board needed ${TIER_LABELS[maxTier]}.`;
  if (current.status === 'won') {
    const ms = current.elapsedMs();
    const key = statsKey(difficulty);
    const previousBest = statsFor(stats, key).bestMs;
    stats = recordWin(stats, key, ms, hintsUsed);
    saveStats(stats);
    const isBest = hintsUsed === 0 && (previousBest === null || ms < previousBest);
    const hints = hintsUsed === 0 ? '' : ` with ${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}`;
    hud.setStatus(
      `Cleared in ${(ms / 1000).toFixed(1)} s${hints}.${isBest ? ' New best!' : ''} ${rating}`,
    );
  } else {
    hud.setStatus(`Boom. There was always a safe move: every board here is solvable. ${rating}`);
  }
}

/**
 * Generates the board around `click` in the worker. A fresh game then makes that click;
 * a board loaded from a link shows it as an opening and waits for the player.
 */
async function loadBoard(click: number, fromLink: boolean): Promise<void> {
  const token = generation;
  busy = true;
  render();
  const spinner = window.setTimeout(() => {
    if (token === generation) els.busy.hidden = false;
  }, SPINNER_DELAY_MS);

  const spec = specFor({ ...difficulty, seed, firstClick: click }, click);
  const response = await engine.generate(spec);
  window.clearTimeout(spinner);
  if (token !== generation) return; // The player started over while this was running.

  busy = false;
  els.busy.hidden = true;
  if (response.kind === 'ok') {
    const built = createBoard(spec.width, spec.height, response.mines);
    game = fromLink ? new Game(built, { opening: click }) : new Game(built);
    if (!fromLink) game.reveal(click);
    firstClick = click;
    maxTier = response.maxTier;
    syncUrl();
    // A fresh game's first click is a move. A board loaded from a link (including a page
    // reload, since the URL holds the board) only counts once the player acts on it.
    if (fromLink) {
      hud.setStatus('Shared board loaded. The timer starts on your first move.');
    } else {
      recordPlayedOnce();
      afterMove(game, false);
    }
  } else if (response.kind === 'exhausted') {
    seed = newSeed(); // This seed has no solvable board for that click; try another.
    syncUrl();
    hud.setStatus(
      `No guess-free board turned up in ${response.attempts} tries. Click to try again, or use fewer mines.`,
    );
  } else {
    hud.setStatus(`Could not generate a board: ${response.message}`);
  }
  render();
}

async function requestHint(): Promise<void> {
  const current = game;
  if (!current || current.isOver || busy) return;
  const token = generation;
  const { width, height, mineCount } = difficulty;
  const response = await engine.hint(width, height, mineCount, current.visibleNumbers());
  if (token !== generation || game !== current || current.isOver) return;
  if (response.kind === 'error') {
    hud.setStatus(`Could not compute a hint: ${response.message}`);
    return;
  }
  if (response.cell === null) {
    hud.setStatus('No provably safe cell found. That should not happen here; please report it.');
    return;
  }
  hintsUsed++;
  board.setHint(response.cell);
  const where = `Row ${Math.floor(response.cell / width) + 1}, column ${(response.cell % width) + 1}`;
  hud.setStatus(
    current.cellView(response.cell) === 'flag'
      ? `${where} (highlighted) is flagged, but it is provably safe.`
      : `${where} (highlighted) is provably safe.`,
  );
  render();
}

async function copyLink(): Promise<void> {
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    hud.setStatus('Link copied. Anyone who opens it gets this exact board.');
  } catch {
    hud.setStatus(`Copy this link to share the board: ${url}`);
  }
}

attachInput(els.board, board, {
  primary(i) {
    if (busy) return;
    if (!game) {
      void loadBoard(i, false);
      return;
    }
    const wasOver = game.isOver;
    board.setHint(null);
    if (game.activate(i).length > 0) recordPlayedOnce();
    afterMove(game, wasOver);
    render();
  },
  secondary(i) {
    if (busy || !game) return;
    board.setHint(null);
    if (game.toggleFlag(i)) recordPlayedOnce();
    render();
  },
});

// Easter egg: hold the face for cat mode. Registered first so a hold doesn't also restart.
// On a cleared board in cat mode, double-tapping the board hides it to show the whole cat.
onDoubleTap(byId<HTMLElement>('board-frame'), () => {
  if (!catMode.enabled || game?.status !== 'won') return;
  catMode.setReveal(!catMode.revealed);
});

onPressAndHold(byId<HTMLButtonElement>('restart'), () => {
  catMode.set(!catMode.enabled);
  saveCatMode(catMode.enabled);
  navigator.vibrate?.(15);
  hud.setStatus(catMode.enabled ? 'Cat mode on. 🐈' : 'Cat mode off.');
  render();
});
byId<HTMLButtonElement>('restart').addEventListener('click', () => {
  newGame();
  catMode.newCat(); // A fresh cat for every new game.
});
els.hint.addEventListener('click', () => void requestHint());
els.share.addEventListener('click', () => void copyLink());

function readCustom(): Difficulty {
  return {
    width: Number(els.customWidth.value),
    height: Number(els.customHeight.value),
    mineCount: Number(els.customMines.value),
  };
}

/** Shows the custom-size check from core and enables Start only when it passes. */
function checkCustom(): Difficulty | null {
  const candidate = readCustom();
  const check = validateCustom(candidate);
  els.customStart.disabled = !check.ok;
  els.customMessage.dataset.kind = check.ok ? 'info' : 'error';
  els.customMessage.textContent = check.ok ? (check.warning ?? '') : check.error;
  return check.ok ? candidate : null;
}

/** Points the difficulty picker (and custom form) at `d`. */
function showDifficulty(d: Difficulty): void {
  const key = statsKey(d);
  const isPreset = key in DIFFICULTIES;
  els.difficulty.value = isPreset ? key : 'custom';
  els.custom.hidden = isPreset;
  if (!isPreset) {
    els.customWidth.value = String(d.width);
    els.customHeight.value = String(d.height);
    els.customMines.value = String(d.mineCount);
    checkCustom();
  }
}

els.difficulty.addEventListener('change', () => {
  const choice = els.difficulty.value;
  els.custom.hidden = choice !== 'custom';
  if (choice === 'custom') {
    checkCustom();
    return;
  }
  saveDifficultyChoice(choice);
  newGame(DIFFICULTIES[choice as DifficultyName]);
});

els.custom.addEventListener('input', () => checkCustom());
els.custom.addEventListener('submit', (event) => {
  event.preventDefault();
  const custom = checkCustom();
  if (custom) newGame(custom);
});

/** Starts from the board in the URL if there is one, else from the last difficulty. */
function boot(): void {
  const shared = parseBoardQuery(location.search);
  if (shared.kind === 'ok') {
    const { board: link } = shared;
    const linked = { width: link.width, height: link.height, mineCount: link.mineCount };
    showDifficulty(linked);
    newGame(linked, link.seed);
    if (link.firstClick !== null) void loadBoard(link.firstClick, true);
    return;
  }
  const saved = loadDifficultyChoice();
  const start =
    saved !== null && saved in DIFFICULTIES
      ? DIFFICULTIES[saved as DifficultyName]
      : DIFFICULTIES.beginner;
  showDifficulty(start);
  newGame(start);
  if (shared.kind === 'invalid') hud.setStatus(`${shared.reason} Started a new game instead.`);
}

if (loadCatMode()) catMode.set(true);
boot();
