import { OcgCoreInternal } from 'ocgcore-wasm';

/** The Emscripten module behind ocgcore-wasm; its HEAPU8 view follows memory growth. */
export function heapOf(lib: object): (() => Uint8Array) | undefined {
  const module = (lib as Record<symbol, { module?: { HEAPU8?: Uint8Array } } | undefined>)[OcgCoreInternal as unknown as symbol]?.module;
  return module?.HEAPU8 ? () => module.HEAPU8! : undefined;
}
