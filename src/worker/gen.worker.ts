import { getGeometry } from '../core/board';
import { generate } from '../generator/generate';
import { findHint, viewFromNumbers } from '../solver/hint';
import type { EngineRequest, EngineResponse } from './protocol';

// Typed view of the dedicated-worker global. The project compiles against the DOM lib,
// whose `self.postMessage` has the Window signature, so describe just what we use.
interface WorkerScope {
  onmessage: ((event: MessageEvent<EngineRequest>) => void) | null;
  postMessage(message: EngineResponse, transfer: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = ({ data: request }) => {
  const { id } = request;
  try {
    if (request.kind === 'hint') {
      const view = viewFromNumbers(
        getGeometry(request.width, request.height),
        request.totalMines,
        request.numbers,
      );
      scope.postMessage({ id, kind: 'hint', cell: findHint(view) }, []);
      return;
    }
    const result = generate(request.spec);
    if (result.ok) {
      const { mines } = result.board;
      scope.postMessage(
        { id, kind: 'ok', mines, attempts: result.attempts, maxTier: result.maxTier },
        [mines.buffer],
      );
    } else {
      scope.postMessage({ id, kind: 'exhausted', attempts: result.attempts }, []);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scope.postMessage({ id, kind: 'error', message }, []);
  }
};
