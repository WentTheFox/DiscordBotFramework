import { format } from 'node:util';
import pino from 'pino';
import pretty from 'pino-pretty';
import { LogMethod, NestableLogger } from './types.js';
import { PINO_PRETTY_OPTIONS } from './pino-pretty-options.js';

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function toSet(value: LogMethod[] | Set<LogMethod>): Set<LogMethod> {
  return Array.isArray(value) ? new Set(value) : value;
}

function formatPrefixLabel(prefixes: string[]): string {
  return prefixes.length === 0 ? '' : `[${prefixes.join('][')}] `;
}

export class Logger implements NestableLogger {
  protected prefixes: string[];

  protected mutedMethods: Set<LogMethod>;

  protected pino: pino.Logger;

  constructor(prefix: string | string[] = [], mutedMethods: LogMethod[] | Set<LogMethod> = []) {
    this.prefixes = toArray(prefix);
    this.mutedMethods = toSet(mutedMethods);
    // Bare constructor stays worker-thread-free: pino-pretty's stream is built
    // synchronously in-process here, unlike createLogger()'s pino.transport() path.
    const root = pino({ level: 'trace' }, pretty(PINO_PRETTY_OPTIONS));
    this.pino = root.child({ prefixLabel: formatPrefixLabel(this.prefixes) });
  }

  /**
   * Builds a Logger from an existing pino instance via `.child()`, reusing whatever
   * transport (or lack thereof) the parent already has, rather than constructing a
   * new pino root. Used internally by `nest()`, `muteMethods()`, and `createLogger()`
   * so nested loggers never spawn additional `pino.transport()` worker threads.
   */
  static withPino(parentPino: pino.Logger, prefixes: string[], mutedMethods: Set<LogMethod>): Logger {
    const instance = Object.create(Logger.prototype) as Logger;
    instance.prefixes = prefixes;
    instance.mutedMethods = mutedMethods;
    instance.pino = parentPino.child({ prefixLabel: formatPrefixLabel(prefixes) });
    return instance;
  }

  static fromShardInfo(shards: string | string[] = ''): Logger {
    const shardsSuffix = Array.isArray(shards) ? shards.join(',') : shards;
    return new Logger(`Shard#${shardsSuffix}`);
  }

  debug(...params: unknown[]): void {
    if (this.mutedMethods.has('debug')) return;
    this.pino.debug(format(...params));
  }

  info(...params: unknown[]): void {
    if (this.mutedMethods.has('info')) return;
    this.pino.info(format(...params));
  }

  // pino has no 'log' level; map it onto 'info', matching the console-visible
  // severity `log` and `info` shared before this migration.
  log(...params: unknown[]): void {
    if (this.mutedMethods.has('log')) return;
    this.pino.info(format(...params));
  }

  warn(...params: unknown[]): void {
    if (this.mutedMethods.has('warn')) return;
    this.pino.warn(format(...params));
  }

  error(...params: unknown[]): void {
    if (this.mutedMethods.has('error')) return;
    this.pino.error(format(...params));
  }

  /**
   * Returns a new logger with the provided prefix(es) added to the existing prefix list
   */
  nest(nestedPrefix: string | string[]): Logger {
    const nestedPrefixArray = [...this.prefixes, ...toArray(nestedPrefix)];
    return Logger.withPino(this.pino, nestedPrefixArray, this.mutedMethods);
  }

  /**
   * Returns a new logger with only the provided methods muted
   */
  muteMethods(mutedMethods: LogMethod[]): Logger {
    return Logger.withPino(this.pino, this.prefixes, new Set(mutedMethods));
  }
}
