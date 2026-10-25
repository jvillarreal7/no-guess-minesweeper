import './style.css';
import { createBoard } from '../core/board';
import {
  DIFFICULTIES,
  validateCustom,
  type Difficulty,
  type DifficultyName,
} from '../core/difficulty';
import { Game } from '../core/game';
import { GeneratorClient } from './generator-client';
import { Hud } from './hud';
import { attachInput } from './input';
import { BoardView } from './render';

/** Show the "generating" overlay only if generation takes longer than this. */
const SPINNER_DELAY_MS = 150;
const TIMER_TICK_MS = 250;

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
};

const board = new BoardView(els.board);
const hud = new Hud({
  mines: byId<HTMLOutputElement>('mines'),
  timer: byId<HTMLOutputElement>('timer'),
  face: byId<HTMLButtonElement>('restart'),
  status: byId<HTMLElement>('status'),
});
const generator = new GeneratorClient();

let difficulty: Difficulty = DIFFICULTIES.beginner;
let game: Game | null = null;
let busy = false;
/** Bumped on every new game, so a worker reply for an abandoned game is ignored. */
let generation = 0;
let timerHandle: number | undefined;

/** A fresh random seed. UI-side randomness only; the engine uses the seeded RNG. */
function newSeed(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(2)), (n) => n.toString(36)).join('');
}

function newGame(next: Difficulty = difficulty): void {
  difficulty = next;
  game = null;
  busy = false;
  generation++;
  els.busy.hidden = true;
  board.setSize(next.width, next.height);
  hud.setStatus('Click any cell to start. The first click is always an opening.');
  render();
}

function render(): void {
  const current = game;
  board.render(current ? (i) => current.cellView(i) : () => 'hidden');
  hud.setMines(current ? current.minesRemaining : difficulty.mineCount);
  hud.setTime(current ? current.elapsedMs() : 0);
  hud.setFace(busy ? 'busy' : (current?.status ?? 'ready'));
  syncTimer();
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

function announceResult(current: Game): void {
  if (current.status === 'won') {
    const seconds = (current.elapsedMs() / 1000).toFixed(1);
    hud.setStatus(`Cleared in ${seconds} s.`);
  } else if (current.status === 'lost') {
    hud.setStatus('Boom. There was always a safe move: every board here is solvable by logic.');
  } else {
    hud.setStatus('');
  }
}

/** Generates a board around the first click in the worker, then makes that click. */
async function startGame(firstClick: number): Promise<void> {
  const token = generation;
  busy = true;
  render();
  const spinner = window.setTimeout(() => {
    if (token === generation) els.busy.hidden = false;
  }, SPINNER_DELAY_MS);

  const spec = { ...difficulty, seed: newSeed(), firstClick };
  const response = await generator.generate(spec);
  window.clearTimeout(spinner);
  if (token !== generation) return; // The player started over while this was running.

  busy = false;
  els.busy.hidden = true;
  if (response.kind === 'ok') {
    game = new Game(createBoard(spec.width, spec.height, response.mines));
    game.reveal(firstClick);
    announceResult(game);
  } else if (response.kind === 'exhausted') {
    hud.setStatus(
      `No guess-free board turned up in ${response.attempts} tries. Click to try again, or use fewer mines.`,
    );
  } else {
    hud.setStatus(`Could not generate a board: ${response.message}`);
  }
  render();
}

attachInput(els.board, board, {
  primary(i) {
    if (busy) return;
    if (!game) {
      void startGame(i);
      return;
    }
    game.activate(i);
    announceResult(game);
    render();
  },
  secondary(i) {
    if (busy || !game) return;
    game.toggleFlag(i);
    render();
  },
});

byId<HTMLButtonElement>('restart').addEventListener('click', () => newGame());

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

els.difficulty.addEventListener('change', () => {
  const choice = els.difficulty.value;
  els.custom.hidden = choice !== 'custom';
  if (choice === 'custom') {
    checkCustom();
    return;
  }
  newGame(DIFFICULTIES[choice as DifficultyName]);
});

els.custom.addEventListener('input', () => checkCustom());
els.custom.addEventListener('submit', (event) => {
  event.preventDefault();
  const custom = checkCustom();
  if (custom) newGame(custom);
});

newGame(DIFFICULTIES.beginner);
