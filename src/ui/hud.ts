import type { GameStatus } from '../core/game';

export type FaceState = GameStatus | 'busy';

const FACES: Record<FaceState, string> = {
  ready: '🙂',
  playing: '🙂',
  busy: '🤔',
  won: '😎',
  lost: '😵',
};

const CAT_FACES: Record<FaceState, string> = {
  ready: '😺',
  playing: '😺',
  busy: '😼',
  won: '😻',
  lost: '🙀',
};

/** Three-digit counter display: 007, 120, -05. Clamped to what fits. */
export function formatCounter(n: number): string {
  if (n < 0) return '-' + String(Math.min(99, -n)).padStart(2, '0');
  return String(Math.min(999, n)).padStart(3, '0');
}

/** Mine counter, timer, face button and status line. */
export class Hud {
  constructor(
    private readonly els: {
      mines: HTMLOutputElement;
      timer: HTMLOutputElement;
      face: HTMLButtonElement;
      status: HTMLElement;
    },
  ) {}

  setMines(remaining: number): void {
    this.els.mines.value = formatCounter(remaining);
  }

  setTime(ms: number): void {
    this.els.timer.value = formatCounter(Math.floor(ms / 1000));
  }

  setFace(state: FaceState, cat = false): void {
    this.els.face.textContent = (cat ? CAT_FACES : FACES)[state];
  }

  setStatus(text: string): void {
    this.els.status.textContent = text;
  }
}
