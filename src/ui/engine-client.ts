import type { BoardSpec } from '../generator/generate';
import type {
  EngineRequest,
  EngineResponse,
  GenerateResponse,
  HintResponse,
} from '../worker/protocol';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Runs generation and hints in a Web Worker so the page stays responsive. */
export class EngineClient {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, (response: EngineResponse) => void>();

  constructor() {
    this.worker = new Worker(new URL('../worker/gen.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (event: MessageEvent<EngineResponse>) => {
      const resolve = this.pending.get(event.data.id);
      this.pending.delete(event.data.id);
      resolve?.(event.data);
    };
    this.worker.onerror = (event) => {
      // A crashed worker answers nothing; fail every outstanding request.
      for (const [id, resolve] of this.pending) {
        resolve({ id, kind: 'error', message: event.message || 'engine worker failed' });
      }
      this.pending.clear();
    };
  }

  generate(spec: BoardSpec): Promise<GenerateResponse> {
    return this.send({ kind: 'generate', spec }) as Promise<GenerateResponse>;
  }

  hint(
    width: number,
    height: number,
    totalMines: number,
    numbers: Int8Array,
  ): Promise<HintResponse> {
    return this.send({ kind: 'hint', width, height, totalMines, numbers }) as Promise<HintResponse>;
  }

  private send(request: DistributiveOmit<EngineRequest, 'id'>): Promise<EngineResponse> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ ...request, id } as EngineRequest);
    });
  }
}
