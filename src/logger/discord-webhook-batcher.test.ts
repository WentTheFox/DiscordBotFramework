import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordWebhookBatcher, PinoLogRecord } from './discord-webhook-batcher.js';

function record(overrides: Partial<PinoLogRecord> = {}): PinoLogRecord {
  return {
    level: 40,
    time: Date.parse('2026-07-13T00:00:00.000Z'),
    msg: 'something happened',
    prefixLabel: '[Bot] ',
    ...overrides,
  };
}

describe('DiscordWebhookBatcher', () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  let batcher: DiscordWebhookBatcher | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 });
  });

  afterEach(async () => {
    await batcher?.close();
    batcher = undefined;
    vi.useRealTimers();
  });

  it('does not POST when there is nothing queued', async () => {
    batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('flushes one POST per interval tick with a matching embed', async () => {
    batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 1000 });
    batcher.write(record());
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.test/webhook');
    const body = JSON.parse(init.body as string);
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].description).toBe('[Bot] something happened');
    expect(body.embeds[0].color).toBe(0xf1c40f);
    expect(body.embeds[0].timestamp).toBe('2026-07-13T00:00:00.000Z');
  });

  it('caps a single batch at maxBatchSize and carries the rest to the next tick', async () => {
    batcher = new DiscordWebhookBatcher({
      url: 'https://discord.test/webhook',
      fetchImpl,
      batchIntervalMs: 1000,
      maxBatchSize: 2,
    });
    batcher.write(record({ msg: 'one' }));
    batcher.write(record({ msg: 'two' }));
    batcher.write(record({ msg: 'three' }));

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    let body = JSON.parse((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.embeds).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    body = JSON.parse((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].description).toBe('[Bot] three');
  });

  it('truncates descriptions past the embed limit', async () => {
    batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 1000 });
    batcher.write(record({ prefixLabel: '', msg: 'x'.repeat(5000) }));
    await vi.advanceTimersByTimeAsync(1000);

    const body = JSON.parse((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.embeds[0].description).toHaveLength(4096);
  });

  it('drops oldest entries once maxQueueLength is exceeded, without POSTing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    batcher = new DiscordWebhookBatcher({
      url: 'https://discord.test/webhook',
      fetchImpl,
      batchIntervalMs: 1000,
      maxQueueLength: 2,
    });
    batcher.write(record({ msg: 'one' }));
    batcher.write(record({ msg: 'two' }));
    batcher.write(record({ msg: 'three' }));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('logs to console.error instead of throwing when the fetch fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchImpl.mockRejectedValue(new Error('network down'));
    batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 1000 });
    batcher.write(record());

    await expect(vi.advanceTimersByTimeAsync(1000)).resolves.not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('logs to console.error instead of throwing on a non-ok response', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchImpl.mockResolvedValue({ ok: false, status: 429 });
    batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 1000 });
    batcher.write(record());

    await vi.advanceTimersByTimeAsync(1000);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('429'));
    errorSpy.mockRestore();
  });

  it('close() flushes whatever is still buffered', async () => {
    batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 60_000 });
    batcher.write(record());
    await batcher.close();
    batcher = undefined;

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
