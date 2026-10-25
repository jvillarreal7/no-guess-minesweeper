import type { BoardSpec } from '../generator/generate';

/** Main thread -> worker. */
export interface GenRequest {
  id: number;
  spec: BoardSpec;
}

/**
 * Worker -> main thread. Only the mine layout crosses the boundary; the main thread
 * rebuilds the Board (numbers, neighbors) with createBoard.
 */
export type GenResponse =
  | { id: number; kind: 'ok'; mines: Uint8Array; attempts: number }
  | { id: number; kind: 'exhausted'; attempts: number }
  | { id: number; kind: 'error'; message: string };
