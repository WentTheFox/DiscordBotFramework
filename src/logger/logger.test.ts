import { describe, expect, it, vi } from 'vitest';
import { Logger } from './logger.js';

describe('Logger', () => {
  it('logs without a prefix when none is set', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    new Logger().log('hello');
    expect(spy).toHaveBeenCalledWith('hello');
    spy.mockRestore();
  });

  it('prefixes log messages', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    new Logger('Bot').log('hello');
    expect(spy).toHaveBeenCalledWith('[Bot] hello');
    spy.mockRestore();
  });

  it('nest() appends to the existing prefix without mutating the parent', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const parent = new Logger('Bot');
    const child = parent.nest('Interaction#1');
    child.log('hi');
    parent.log('bye');
    expect(spy).toHaveBeenNthCalledWith(1, '[Bot][Interaction#1] hi');
    expect(spy).toHaveBeenNthCalledWith(2, '[Bot] bye');
    spy.mockRestore();
  });

  it('muteMethods() silences only the given methods', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new Logger('Bot').muteMethods(['log']);
    logger.log('hidden');
    logger.warn('visible');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[Bot] visible');
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('fromShardInfo() builds a Shard#N prefix', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    Logger.fromShardInfo('0').log('ready');
    expect(spy).toHaveBeenCalledWith('[Shard#0] ready');
    spy.mockRestore();
  });
});
