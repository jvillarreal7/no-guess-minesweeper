import type { BoardSpec } from '../generator/generate';
import type { SolveResult } from '../solver/types';

/** Main thread -> worker. */
export type EngineRequest =
  | { id: number; kind: 'generate'; spec: BoardSpec }
  | {
      id: number;
      kind: 'hint';
      width: number;
      height: number;
      totalMines: number;
      /** Game.visibleNumbers(): the revealed numbers, -1 elsewhere. */
      numbers: Int8Array;
    };

/**
 * Worker -> main thread. Only the mine layout crosses the boundary; the main thread
 * rebuilds the Board (numbers, neighbors) with createBoard.
 */
export type GenerateResponse =
  | {
      id: number;
      kind: 'ok';
      mines: Uint8Array;
      attempts: number;
      /** Hardest solver tier the board needed from its first click. */
      maxTier: SolveResult['maxTier'];
    }
  | { id: number; kind: 'exhausted'; attempts: number }
  | { id: number; kind: 'error'; message: string };

export type HintResponse =
  | { id: number; kind: 'hint'; cell: number | null }
  | { id: number; kind: 'error'; message: string };

export type EngineResponse = GenerateResponse | HintResponse;
