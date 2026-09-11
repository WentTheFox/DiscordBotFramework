import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShardManager } from './create-shard-manager.js';
import { NestableLogger } from '../logger/types.js';

const respawnAll = vi.fn().mockResolvedValue(undefined);

vi.mock('discord.js', () => ({
  ShardingManager: vi.fn().mockImplementation(function FakeShardingManager() {
    return {
      on: vi.fn(),
      spawn: vi.fn().mockResolvedValue([]),
      respawnAll,
    };
  }),
}));

const createLogger = (): NestableLogger => {
  const logger: NestableLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    nest: () => logger,
    muteMethods: () => logger,
  };
  return logger;
};

const baseOptions = {
  token: 'token',
  botScriptPath: '/bot.js',
};

afterEach(() => {
  respawnAll.mockClear();
  process.removeAllListeners('SIGUSR2');
});

describe('createShardManager', () => {
  it('does not register a signal listener when gracefulRespawnSignal is omitted', async () => {
    await createShardManager({ ...baseOptions, logger: createLogger() });

    expect(process.listenerCount('SIGUSR2')).toBe(0);
  });

  it('calls manager.respawnAll() when the configured signal is received', async () => {
    const logger = createLogger();
    await createShardManager({ ...baseOptions, logger, gracefulRespawnSignal: 'SIGUSR2' });

    expect(process.listenerCount('SIGUSR2')).toBe(1);
    process.emit('SIGUSR2');
    await vi.waitFor(() => expect(respawnAll).toHaveBeenCalledTimes(1));
  });

  it('ignores a signal received while a respawn is already in progress', async () => {
    const logger = createLogger();
    let resolveRespawn: () => void = () => {};
    respawnAll.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveRespawn = resolve;
    }));

    await createShardManager({ ...baseOptions, logger, gracefulRespawnSignal: 'SIGUSR2' });

    process.emit('SIGUSR2');
    process.emit('SIGUSR2');
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalled());
    expect(respawnAll).toHaveBeenCalledTimes(1);

    resolveRespawn();
    await vi.waitFor(() => expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('respawned in')));
  });
});
