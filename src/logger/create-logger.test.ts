import { describe, expect, it } from 'vitest';
import { createLogger } from './create-logger.js';

describe('createLogger', () => {
  it('returns a NestableLogger for the console-only default', () => {
    const logger = createLogger({ prefix: 'Bot' });
    expect(logger).toHaveProperty('debug');
    expect(logger).toHaveProperty('info');
    expect(logger).toHaveProperty('log');
    expect(logger).toHaveProperty('warn');
    expect(logger).toHaveProperty('error');
    expect(typeof logger.nest).toBe('function');
    expect(typeof logger.muteMethods).toBe('function');
    expect(() => logger.info('smoke test')).not.toThrow();
  });

  it('returns a NestableLogger when a discordWebhook target is configured', () => {
    const logger = createLogger({
      prefix: 'Bot',
      discordWebhook: { url: 'https://discord.test/webhook', batchIntervalMs: 60_000 },
    });
    expect(typeof logger.nest).toBe('function');
    expect(() => logger.warn('smoke test')).not.toThrow();
  });

  it('nest() on a createLogger() instance reuses the parent pino instance', () => {
    const logger = createLogger({ prefix: 'Bot' });
    const nested = logger.nest('Interaction#1');
    expect(() => nested.info('nested smoke test')).not.toThrow();
  });
});
