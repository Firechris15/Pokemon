import { useRef, type ComponentType, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';
import { create } from 'zustand';

import engineSource from './generated/engineSource';
import type { FromEngine, ToEngine } from './types';

export type EngineHost = { send: (message: ToEngine) => void; listen: (listener: (message: FromEngine) => void) => () => void };

/**
 * iOS/Android: Hermes has no WebAssembly, so the engine bundle runs inside a
 * hidden WebView (WKWebView has WebAssembly and runs in its own process).
 * Messages travel as JSON strings.
 */
type WebViewHandle = { injectJavaScript: (script: string) => void };
// The package's prop types intersect the iOS/Android/Windows props, which collapses to `never` here.
const WebView = RNWebView as unknown as ComponentType<{
  ref?: Ref<WebViewHandle>;
  originWhitelist: string[];
  source: { html: string; baseUrl: string };
  javaScriptEnabled: boolean;
  onLoadEnd: () => void;
  onMessage: (event: WebViewMessageEvent) => void;
  onContentProcessDidTerminate: () => void;
}>;

const useHostState = create<{ active: boolean }>(() => ({ active: false }));
const listeners = new Set<(message: FromEngine) => void>();
let pending: string[] = [];
let inject: ((json: string) => void) | null = null;

const deliver = (json: string) => {
  const script = `window.__toEngine && window.__toEngine(${JSON.stringify(json)});true;`;
  if (inject) inject(script);
  else pending.push(script);
};

export function getEngineHost(): EngineHost {
  useHostState.setState({ active: true });
  return {
    send: (message) => deliver(JSON.stringify(message)),
    listen: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>${engineSource.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;

/** Mounted once in the root layout; renders nothing visible. */
export function EngineHostView() {
  const active = useHostState((s) => s.active);
  const ref = useRef<WebViewHandle>(null);
  if (!active) return null;

  const onLoadEnd = () => {
    inject = (script) => ref.current?.injectJavaScript(script);
    const queued = pending;
    pending = [];
    queued.forEach((script) => inject?.(script));
  };
  const onMessage = (event: WebViewMessageEvent) => {
    let message: FromEngine;
    try {
      message = JSON.parse(event.nativeEvent.data) as FromEngine;
    } catch {
      return;
    }
    listeners.forEach((l) => l(message));
  };

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://engine.invalid/' }}
        javaScriptEnabled
        onLoadEnd={onLoadEnd}
        onMessage={onMessage}
        onContentProcessDidTerminate={() => {
          inject = null;
          listeners.forEach((l) => l({ t: 'error', message: 'Die Regel-Engine wurde vom System beendet. Bitte das Duell neu starten.' }));
          useHostState.setState({ active: false });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 } });
