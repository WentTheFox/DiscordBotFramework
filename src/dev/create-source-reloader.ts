import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { NestableLogger } from '../logger/index.js';

export interface SourceReloaderOptions {
  /**
   * Absolute path to the source root whose modules should be hot-reloaded (e.g. the
   * app's `src/` directory). Anything resolved outside this root — node_modules, this
   * framework, compiled output elsewhere — is left untouched and stays on Node's normal
   * module cache, so singletons living there (a DB pool, the gateway client) are never
   * duplicated or reconnected by a reload.
   */
  rootDir: string;
  logger?: NestableLogger;
}

export interface SourceReloader {
  /**
   * Re-imports `specifier` (an absolute path or `file://` URL under `rootDir`) as a
   * brand new module instance, along with every module under `rootDir` it transitively
   * imports. Intended for a small, side-effect-free aggregator module (e.g. one that
   * only builds command/component registries from plain object exports) — reloading a
   * module with top-level side effects (opening a DB pool, connecting a client) will
   * duplicate those side effects on every call.
   */
  reimport: <T = unknown>(specifier: string | URL) => Promise<T>;
}

/**
 * Sets up cache-busted re-importing of a local module subtree for development hot
 * reload, via a `module.register()` hook that tags every module resolved under
 * `rootDir` with a shared, incrementing epoch — forcing Node to treat it as a new
 * module instance on each `reimport()` call, without needing to restart the process
 * (and, for a Discord bot, without reconnecting the gateway).
 *
 * Pair with `createHandlerWatcher` to trigger `reimport()` on file changes, then merge
 * the returned module's exports into whatever long-lived registries/objects your
 * running process already holds live references to (mutate them in place — replacing
 * the binding itself isn't possible from outside the module that declared it).
 */
export function createSourceReloader({ rootDir, logger }: SourceReloaderOptions): SourceReloader {
  const sab = new SharedArrayBuffer(4);
  const epoch = new Int32Array(sab);
  const rootUrl = pathToFileURL(rootDir.endsWith('/') ? rootDir : `${rootDir}/`).href;
  // Only `build/` (compiled .js) is published; running this package's own tests/dev
  // straight against `src/` (no build step yet) leaves just the .ts sibling on disk —
  // Node 24's native type-stripping loads that directly since it's plain erasable syntax
  const compiledHookUrl = new URL('./reload-loader.js', import.meta.url);
  const hookUrl = existsSync(fileURLToPath(compiledHookUrl))
    ? compiledHookUrl
    : new URL('./reload-loader.ts', import.meta.url);

  register(hookUrl, {
    parentURL: import.meta.url,
    data: { rootUrl, sab },
  });
  logger?.log(`Source reloader active (root=${rootDir})`);

  return {
    reimport: async <T>(specifier: string | URL): Promise<T> => {
      Atomics.add(epoch, 0, 1);
      const url = typeof specifier === 'string' && !specifier.startsWith('file://')
        ? pathToFileURL(specifier).href
        : specifier.toString();
      return import(url) as Promise<T>;
    },
  };
}
