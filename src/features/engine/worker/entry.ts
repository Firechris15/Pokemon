/**
 * Entry point of the engine bundle (built with esbuild, see
 * scripts/build-engine.mjs). The same bundle runs as a Web Worker in the
 * browser and inside a hidden WebView on iOS, where Hermes has no
 * WebAssembly.
 */
import createCore, { cardMatchesOpcode, OcgDuelMode } from 'ocgcore-wasm';

import type { FromEngine, ToEngine } from '../types';
import { EngineController } from './controller';

type WebViewBridge = { postMessage: (message: string) => void };
declare const self: {
  postMessage?: (message: unknown) => void;
  onmessage?: ((event: { data: ToEngine }) => void) | null;
  ReactNativeWebView?: WebViewBridge;
  __toEngine?: (json: string) => void;
};

const bridge = self.ReactNativeWebView;
const post = (message: FromEngine) => {
  if (bridge) bridge.postMessage(JSON.stringify(message));
  else self.postMessage?.(message);
};

const controller = createCore({ sync: true })
  .then(
    (lib) =>
      new EngineController(
        {
          lib,
          flags: { mr5: OcgDuelMode.MODE_MR5, attackFirstTurn: OcgDuelMode.ATTACK_FIRST_TURN },
          matchesOpcode: (card, opcodes) => cardMatchesOpcode(card, opcodes as never),
          now: () => performance.now(),
        },
        post,
        { aiDelayMs: 450 }
      )
  )
  .catch((error) => {
    post({ t: 'error', message: `Regel-Engine konnte nicht starten: ${error instanceof Error ? error.message : String(error)}` });
    throw error;
  });

const receive = (message: ToEngine) => {
  controller.then((c) => c.handle(message)).catch(() => undefined);
};

if (bridge) self.__toEngine = (json) => receive(JSON.parse(json) as ToEngine);
else self.onmessage = (event) => receive(event.data);
