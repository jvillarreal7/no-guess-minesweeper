import type { BoardSpec } from '../generator/generate';
import type { GenRequest, GenResponse } from '../worker/protocol';

/** Runs board generation in a Web Worker so the page stays responsive. */
export class GeneratorClient {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, (response: GenResponse) => void>();

  constructor() {
    this.worker = new Worker(new URL('../worker/gen.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (event: MessageEvent<GenResponse>) => {
      const resolve = this.pending.get(event.data.id);
      this.pending.delete(event.data.id);
      resolve?.(event.data);
    };
    this.worker.onerror = (event) => {
      // A crashed worker answers nothing; fail every outstanding request.
      for (const [id, resolve] of this.pending) {
        resolve({ id, kind: 'error', message: event.message || 'generator worker failed' });
      }
      this.pending.clear();
    };
  }

  generate(spec: BoardSpec): Promise<GenResponse> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      const request: GenRequest = { id, spec };
      this.worker.postMessage(request);
    });
  }
}
