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

  it('carries embeds past the combined 6000-character limit over to the next tick', async () => {
    batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 1000 });
    batcher.write(record({ prefixLabel: '', msg: 'a'.repeat(2500) }));
    batcher.write(record({ prefixLabel: '', msg: 'b'.repeat(2500) }));
    batcher.write(record({ prefixLabel: '', msg: 'c'.repeat(2500) }));

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    let body = JSON.parse((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.embeds.map((e: { description: string }) => e.description[0])).toEqual(['a', 'b']);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    body = JSON.parse((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(body.embeds.map((e: { description: string }) => e.description[0])).toEqual(['c']);
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

  it('includes the (truncated) response body in the failure log', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchImpl.mockResolvedValue({ ok: false, status: 400, text: async () => '{"embeds":["Embed size exceeds maximum size of 6000"]}' });
    batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 1000 });
    batcher.write(record());

    await vi.advanceTimersByTimeAsync(1000);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds maximum size of 6000'));
    errorSpy.mockRestore();
  });

  describe('dedupe', () => {
    const embedsOf = (call: number) => JSON.parse((fetchImpl.mock.calls[call] as [string, RequestInit])[1].body as string).embeds as { description: string; timestamp: string }[];

    it('collapses the same message into one embed with a count, ignoring UUIDs', async () => {
      batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 1000 });
      const msg = (id: string) => `Connection terminated (Queue: send-it, Worker: ${id})`;
      batcher.write(record({ msg: msg('1e21e58d-92da-4b05-aeff-f1b044c651c8'), time: Date.parse('2026-07-13T00:00:01.000Z') }));
      batcher.write(record({ msg: msg('d497da19-a95f-4366-be71-e99e5cae636d'), time: Date.parse('2026-07-13T00:00:02.000Z') }));
      batcher.write(record({ msg: msg('aaaaaaaa-92da-4b05-aeff-f1b044c651c8'), time: Date.parse('2026-07-13T00:00:09.000Z') }));
      await vi.advanceTimersByTimeAsync(1000);

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const embeds = embedsOf(0);
      expect(embeds).toHaveLength(1);
      // the first record's text and time, plus the count and the time of the last one
      expect(embeds[0].description).toBe('[Bot] Connection terminated (Queue: send-it, Worker: 1e21e58d-92da-4b05-aeff-f1b044c651c8)\n×3 (last at 00:00:09 UTC)');
      expect(embeds[0].timestamp).toBe('2026-07-13T00:00:01.000Z');
    });

    it('masks long hex ids but not plain long words', async () => {
      batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 1000 });
      batcher.write(record({ msg: 'request 4f9c2a7e81b3d5c0 failed' }));
      batcher.write(record({ msg: 'request 0a1b2c3d4e5f6071 failed' }));
      batcher.write(record({ msg: 'deadbeefdeadbeefdead' }));
      batcher.write(record({ msg: 'facefacefaceface' }));
      await vi.advanceTimersByTimeAsync(1000);

      expect(embedsOf(0).map((e) => e.description.split('\n')[0])).toEqual(['[Bot] request 4f9c2a7e81b3d5c0 failed', '[Bot] deadbeefdeadbeefdead', '[Bot] facefacefaceface']);
    });

    it('keeps different messages and different levels apart', async () => {
      batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 1000 });
      batcher.write(record({ msg: 'one' }));
      batcher.write(record({ msg: 'two' }));
      batcher.write(record({ msg: 'one', level: 50 }));
      batcher.write(record({ msg: 'one' }));
      await vi.advanceTimersByTimeAsync(1000);

      expect(embedsOf(0).map((e) => e.description)).toEqual(['[Bot] one\n×2 (last at 00:00:00 UTC)', '[Bot] two', '[Bot] one']);
    });

    it('starts a new entry once the earlier one has been sent', async () => {
      batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 1000 });
      batcher.write(record({ msg: 'again' }));
      await vi.advanceTimersByTimeAsync(1000);
      batcher.write(record({ msg: 'again' }));
      await vi.advanceTimersByTimeAsync(1000);

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(embedsOf(1)[0].description).toBe('[Bot] again');
    });

    it('does not merge anything with dedupe: false', async () => {
      batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 1000, dedupe: false });
      batcher.write(record({ msg: 'same' }));
      batcher.write(record({ msg: 'same' }));
      await vi.advanceTimersByTimeAsync(1000);

      expect(embedsOf(0)).toHaveLength(2);
    });

    it('counts a merged burst as one queue slot, so it cannot push other messages out', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 1000, maxQueueLength: 2 });
      batcher.write(record({ msg: 'rare' }));
      for (let i = 0; i < 100; i += 1) batcher.write(record({ msg: 'storm' }));
      await vi.advanceTimersByTimeAsync(1000);

      expect(errorSpy).not.toHaveBeenCalled();
      expect(embedsOf(0).map((e) => e.description.split('\n')[0])).toEqual(['[Bot] rare', '[Bot] storm']);
      errorSpy.mockRestore();
    });

    it('keeps the count marker within the embed description limit', async () => {
      batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 1000 });
      batcher.write(record({ prefixLabel: '', msg: 'x'.repeat(5000) }));
      batcher.write(record({ prefixLabel: '', msg: 'x'.repeat(5000) }));
      await vi.advanceTimersByTimeAsync(1000);

      const [embed] = embedsOf(0);
      expect(embed.description).toHaveLength(4096);
      expect(embed.description.endsWith('×2 (last at 00:00:00 UTC)')).toBe(true);
    });
  });

  it('close() flushes whatever is still buffered', async () => {
    batcher = new DiscordWebhookBatcher({ url: 'https://discord.test/webhook', fetchImpl, batchIntervalMs: 60_000 });
    batcher.write(record());
    await batcher.close();
    batcher = undefined;

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
