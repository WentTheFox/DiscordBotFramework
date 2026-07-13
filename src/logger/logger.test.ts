import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { Logger } from './logger.js';

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1B\[[0-9;]*m/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

describe('Logger', () => {
  let writeSpy: MockInstance<typeof fs.writeSync>;
  let lines: string[];

  beforeEach(() => {
    lines = [];
    // PINO_PRETTY_OPTIONS sets `sync: true`, so sonic-boom writes via fs.writeSync
    // directly to the fd, bypassing process.stdout.write entirely.
    writeSpy = vi.spyOn(fs, 'writeSync').mockImplementation((_fd, buffer) => {
      lines.push(stripAnsi(buffer.toString()));
      return buffer.length;
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('logs without a prefix when none is set', () => {
    new Logger().log('hello');
    expect(lines[0]).toMatch(/INFO: hello\n$/);
  });

  it('prefixes log messages', () => {
    new Logger('Bot').log('hello');
    expect(lines[0]).toContain('[Bot] hello');
  });

  it('nest() appends to the existing prefix without mutating the parent', () => {
    const parent = new Logger('Bot');
    const child = parent.nest('Interaction#1');
    child.log('hi');
    parent.log('bye');
    expect(lines[0]).toContain('[Bot][Interaction#1] hi');
    expect(lines[1]).toContain('[Bot] bye');
  });

  it('muteMethods() silences only the given methods', () => {
    const logger = new Logger('Bot').muteMethods(['log']);
    logger.log('hidden');
    logger.warn('visible');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[Bot] visible');
  });

  it('fromShardInfo() builds a Shard#N prefix', () => {
    Logger.fromShardInfo('0').log('ready');
    expect(lines[0]).toContain('[Shard#0] ready');
  });
});
