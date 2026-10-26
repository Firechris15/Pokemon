import type { FromEngine, ToEngine } from './types';

export type EngineHost = { send: (message: ToEngine) => void; listen: (listener: (message: FromEngine) => void) => () => void };

let worker: Worker | null = null;
const listeners = new Set<(message: FromEngine) => void>();

/** Browser: the engine bundle (public/engine/engine.js) runs in a Web Worker. */
export function getEngineHost(): EngineHost {
  if (!worker) {
    worker = new Worker(`${process.env.EXPO_BASE_URL ?? ''}/engine/engine.js`);
    worker.onmessage = (event: MessageEvent<FromEngine>) => listeners.forEach((l) => l(event.data));
    worker.onerror = (event) => {
      listeners.forEach((l) => l({ t: 'error', message: `Die Regel-Engine konnte nicht geladen werden (${event.message || 'Worker-Fehler'}).` }));
    };
  }
  const target = worker;
  return {
    send: (message) => target.postMessage(message),
    listen: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Only needed on iOS, where the engine lives in a WebView. */
export function EngineHostView(): null {
  return null;
}
