import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { LogMethod, NestableLogger } from './types.js';
import { Logger } from './logger.js';
import { PINO_PRETTY_OPTIONS } from './pino-pretty-options.js';
import { DiscordWebhookBatcherOptions } from './discord-webhook-batcher.js';

export interface CreateLoggerOptions {
  prefix?: string | string[];
  mutedMethods?: LogMethod[] | Set<LogMethod>;
  console?: {
    /** @default true */
    enabled?: boolean;
    /** @default 'trace' */
    level?: pino.Level;
    /** @default true */
    pretty?: boolean;
  };
  discordWebhook?: Omit<DiscordWebhookBatcherOptions, 'fetchImpl'> & {
    /** @default 'warn' */
    level?: pino.Level;
  };
}

const DISCORD_WEBHOOK_TRANSPORT_PATH = fileURLToPath(new URL('./discord-webhook-transport.js', import.meta.url));

/**
 * Builds a `NestableLogger` backed by a single root pino instance, configured with
 * whichever transport targets (console + optional Discord webhook) are requested.
 * `pino.transport()` — which spawns a worker thread — is invoked exactly once here,
 * regardless of how many times the returned Logger is later `nest()`ed.
 */
export function createLogger(options: CreateLoggerOptions = {}): NestableLogger {
  const targets: pino.TransportTargetOptions[] = [];

  if (options.console?.enabled !== false) {
    targets.push(options.console?.pretty === false
      ? { target: 'pino/file', options: {}, level: options.console?.level ?? 'trace' }
      : { target: 'pino-pretty', options: PINO_PRETTY_OPTIONS, level: options.console?.level ?? 'trace' });
  }

  if (options.discordWebhook) {
    const { level, ...discordWebhookOptions } = options.discordWebhook;
    targets.push({
      target: DISCORD_WEBHOOK_TRANSPORT_PATH,
      options: discordWebhookOptions,
      level: level ?? 'warn',
    });
  }

  const root = pino({ level: 'trace' }, pino.transport({ targets }));
  return Logger.withPino(root, toArray(options.prefix ?? []), toSet(options.mutedMethods ?? []));
}

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function toSet(value: LogMethod[] | Set<LogMethod>): Set<LogMethod> {
  return Array.isArray(value) ? new Set(value) : value;
}
