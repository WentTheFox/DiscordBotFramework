import { FSWatcher, watch } from 'node:fs';
import { resolve } from 'node:path';
import { NestableLogger } from '../logger/index.js';

export interface HandlerWatcherOptions {
  /** One or more root directories to watch recursively (e.g. `build/commands`). */
  paths: string[];
  /** Called once per settled file change, after debouncing. Errors are caught and logged, never thrown. */
  onChange: (filePath: string) => void | Promise<void>;
  /** Debounce window per file path, in ms. Default 250. */
  debounceMs?: number;
  /** Only invoke `onChange` for paths matching this filter. Default: matches `.js`/`.mjs`/`.cjs` (compiled output). */
  filter?: (filePath: string) => boolean;
  logger?: NestableLogger;
}

export interface HandlerWatcher {
  close: () => void;
}

const DEFAULT_DEBOUNCE_MS = 250;
const DEFAULT_FILTER = (filePath: string): boolean => /\.(m|c)?js$/.test(filePath);

/**
 * A generic, dependency-free file watcher for reloading compiled handler
 * implementations in development. It only watches paths, debounces/coalesces
 * fs events per file, and invokes `onChange` — it has no opinion on how to
 * re-import a module or merge it into a registry, since that varies per bot.
 */
export function createHandlerWatcher(options: HandlerWatcherOptions): HandlerWatcher {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const filter = options.filter ?? DEFAULT_FILTER;
  const timers = new Map<string, NodeJS.Timeout>();
  const watchers: FSWatcher[] = [];

  const scheduleChange = (filePath: string): void => {
    if (!filter(filePath)) return;

    const existing = timers.get(filePath);
    if (existing) clearTimeout(existing);

    timers.set(
      filePath,
      setTimeout(() => {
        timers.delete(filePath);
        Promise.resolve()
          .then(() => options.onChange(filePath))
          .catch((error: unknown) => {
            options.logger?.error(`Handler watcher onChange callback threw (file=${filePath})`, error);
          });
      }, debounceMs),
    );
  };

  for (const root of options.paths) {
    const absoluteRoot = resolve(root);
    const watcher = watch(absoluteRoot, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      scheduleChange(resolve(absoluteRoot, filename.toString()));
    });
    watcher.on('error', (error: unknown) => {
      options.logger?.error(`Handler watcher failed for path (path=${absoluteRoot})`, error);
    });
    watchers.push(watcher);
    options.logger?.log(`Watching for handler changes (path=${absoluteRoot})`);
  }

  return {
    close: (): void => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const watcher of watchers) watcher.close();
      options.logger?.log('Handler watcher closed');
    },
  };
}
