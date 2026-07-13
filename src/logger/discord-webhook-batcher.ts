export interface DiscordWebhookBatcherOptions {
  url: string;
  username?: string;
  avatarUrl?: string;
  /** @default 20000 */
  batchIntervalMs?: number;
  /** @default 10 */
  maxBatchSize?: number;
  /** @default 500 */
  maxQueueLength?: number;
  /** Overridable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface PinoLogRecord {
  level: number;
  time: number;
  msg?: string;
  prefixLabel?: string;
  [key: string]: unknown;
}

const DEFAULT_BATCH_INTERVAL_MS = 20_000;
const DEFAULT_MAX_BATCH_SIZE = 10;
const DEFAULT_MAX_QUEUE_LENGTH = 500;
const EMBED_DESCRIPTION_LIMIT = 4096;

// Discord embed side-bar colors, keyed by pino's numeric levels (trace=10 ... fatal=60).
const LEVEL_COLORS: Record<number, number> = {
  10: 0x95a5a6,
  20: 0x3498db,
  30: 0x2ecc71,
  40: 0xf1c40f,
  50: 0xe74c3c,
  60: 0x992d22,
};

/**
 * Buffers pino log records and flushes them to a Discord webhook at a fixed
 * interval, rather than one POST per log call. A fixed cadence gives a hard,
 * by-construction cap on request volume (600_000 / batchIntervalMs POSTs per
 * 10 minutes), safely under Discord's per-webhook rate limits without needing a
 * separate token-bucket.
 */
export class DiscordWebhookBatcher {
  private queue: PinoLogRecord[] = [];

  private readonly timer: ReturnType<typeof setInterval>;

  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: DiscordWebhookBatcherOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    const intervalMs = options.batchIntervalMs ?? DEFAULT_BATCH_INTERVAL_MS;
    this.timer = setInterval(() => {
      void this.flush();
    }, intervalMs);
    this.timer.unref?.();
  }

  write(record: PinoLogRecord): void {
    this.queue.push(record);
    const maxQueueLength = this.options.maxQueueLength ?? DEFAULT_MAX_QUEUE_LENGTH;
    if (this.queue.length > maxQueueLength) {
      const dropped = this.queue.length - maxQueueLength;
      this.queue.splice(0, dropped);
      // Reported directly to console, never re-entering the webhook pipeline, to
      // avoid a feedback loop during a log storm.
      console.error(`[discord-webhook-transport] Queue exceeded ${maxQueueLength} entries; dropped ${dropped} oldest log record(s).`);
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const maxBatchSize = this.options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
    const batch = this.queue.splice(0, maxBatchSize);
    const payload = {
      username: this.options.username,
      avatar_url: this.options.avatarUrl,
      embeds: batch.map(buildEmbed),
    };

    try {
      const response = await this.fetchImpl(this.options.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        console.error(`[discord-webhook-transport] Webhook POST failed with status ${response.status}`);
      }
    } catch (e) {
      console.error('[discord-webhook-transport] Webhook POST threw', e);
    }
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }
}

function buildEmbed(record: PinoLogRecord) {
  const prefixLabel = typeof record.prefixLabel === 'string' ? record.prefixLabel : '';
  const msg = typeof record.msg === 'string' ? record.msg : '';
  return {
    description: truncate(`${prefixLabel}${msg}`, EMBED_DESCRIPTION_LIMIT),
    color: LEVEL_COLORS[record.level] ?? LEVEL_COLORS[30],
    timestamp: new Date(record.time ?? Date.now()).toISOString(),
  };
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
