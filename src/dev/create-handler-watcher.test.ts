import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DevNullLogger } from '../logger/dev-null-logger.js';
import { createHandlerWatcher, HandlerWatcher } from './create-handler-watcher.js';

// fs.watch's recursive mode relies on real OS file-watching (inotify/FSEvents/
// ReadDirectoryChangesW), so these tests use a real temp directory and real
// timers rather than mocks/fake timers, at the cost of small real waits.
const DEBOUNCE_MS = 50;
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

let dir: string;
let watcher: HandlerWatcher | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'handler-watcher-'));
});

afterEach(async () => {
  watcher?.close();
  watcher = undefined;
  await rm(dir, { recursive: true, force: true });
});

describe('createHandlerWatcher', () => {
  it('invokes onChange for a new matching file after the debounce window', async () => {
    const onChange = vi.fn();
    watcher = createHandlerWatcher({ paths: [dir], onChange, debounceMs: DEBOUNCE_MS });

    const filePath = join(dir, 'ping.js');
    await writeFile(filePath, 'export default {}');
    await settle(DEBOUNCE_MS * 4);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(filePath);
  });

  it('coalesces rapid writes to the same file into a single call', async () => {
    const onChange = vi.fn();
    watcher = createHandlerWatcher({ paths: [dir], onChange, debounceMs: DEBOUNCE_MS });

    const filePath = join(dir, 'ping.js');
    await writeFile(filePath, 'export default {} // 1');
    await settle(DEBOUNCE_MS / 3);
    await writeFile(filePath, 'export default {} // 2');
    await settle(DEBOUNCE_MS / 3);
    await writeFile(filePath, 'export default {} // 3');
    await settle(DEBOUNCE_MS * 4);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(filePath);
  });

  it('fires independently for distinct files', async () => {
    const onChange = vi.fn();
    watcher = createHandlerWatcher({ paths: [dir], onChange, debounceMs: DEBOUNCE_MS });

    await writeFile(join(dir, 'ping.js'), 'export default {}');
    await writeFile(join(dir, 'pong.js'), 'export default {}');
    await settle(DEBOUNCE_MS * 4);

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith(join(dir, 'ping.js'));
    expect(onChange).toHaveBeenCalledWith(join(dir, 'pong.js'));
  });

  it('only fires for files matching the default filter', async () => {
    const onChange = vi.fn();
    watcher = createHandlerWatcher({ paths: [dir], onChange, debounceMs: DEBOUNCE_MS });

    await writeFile(join(dir, 'notes.txt'), 'not a handler');
    await writeFile(join(dir, 'ping.js'), 'export default {}');
    await settle(DEBOUNCE_MS * 4);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(join(dir, 'ping.js'));
  });

  it('respects a custom filter override', async () => {
    const onChange = vi.fn();
    watcher = createHandlerWatcher({
      paths: [dir],
      onChange,
      debounceMs: DEBOUNCE_MS,
      filter: (filePath) => filePath.endsWith('.txt'),
    });

    await writeFile(join(dir, 'ping.js'), 'export default {}');
    await writeFile(join(dir, 'notes.txt'), 'not a handler');
    await settle(DEBOUNCE_MS * 4);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(join(dir, 'notes.txt'));
  });

  it('catches a synchronous throw from onChange and logs it instead of crashing', async () => {
    const logger = new DevNullLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const onChange = vi.fn(() => {
      throw new Error('boom');
    });
    watcher = createHandlerWatcher({ paths: [dir], onChange, debounceMs: DEBOUNCE_MS, logger });

    const filePath = join(dir, 'ping.js');
    await writeFile(filePath, 'export default {}');
    await settle(DEBOUNCE_MS * 4);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(filePath), expect.any(Error));
  });

  it('catches a rejected promise from onChange and logs it instead of crashing', async () => {
    const logger = new DevNullLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const onChange = vi.fn(() => Promise.reject(new Error('nope')));
    watcher = createHandlerWatcher({ paths: [dir], onChange, debounceMs: DEBOUNCE_MS, logger });

    await writeFile(join(dir, 'ping.js'), 'export default {}');
    await settle(DEBOUNCE_MS * 4);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ping.js'), expect.any(Error));
  });

  it('stops invoking onChange after close(), including already-pending debounces', async () => {
    const onChange = vi.fn();
    watcher = createHandlerWatcher({ paths: [dir], onChange, debounceMs: DEBOUNCE_MS });

    await writeFile(join(dir, 'ping.js'), 'export default {} // pending');
    watcher.close();
    await settle(DEBOUNCE_MS * 4);
    await writeFile(join(dir, 'pong.js'), 'export default {}');
    await settle(DEBOUNCE_MS * 4);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('detects changes in nested subdirectories', async () => {
    const onChange = vi.fn();
    watcher = createHandlerWatcher({ paths: [dir], onChange, debounceMs: DEBOUNCE_MS });

    const nestedDir = join(dir, 'components');
    await mkdir(nestedDir);
    const filePath = join(nestedDir, 'confirm.js');
    await writeFile(filePath, 'export default {}');
    await settle(DEBOUNCE_MS * 4);

    expect(onChange).toHaveBeenCalledWith(filePath);
  });
});
