import { generate } from '../generator/generate';
import type { GenRequest, GenResponse } from './protocol';

// Typed view of the dedicated-worker global. The project compiles against the DOM lib,
// whose `self.postMessage` has the Window signature, so describe just what we use.
interface WorkerScope {
  onmessage: ((event: MessageEvent<GenRequest>) => void) | null;
  postMessage(message: GenResponse, transfer: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = ({ data: { id, spec } }) => {
  try {
    const result = generate(spec);
    if (result.ok) {
      const { mines } = result.board;
      scope.postMessage({ id, kind: 'ok', mines, attempts: result.attempts }, [mines.buffer]);
    } else {
      scope.postMessage({ id, kind: 'exhausted', attempts: result.attempts }, []);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scope.postMessage({ id, kind: 'error', message }, []);
  }
};
