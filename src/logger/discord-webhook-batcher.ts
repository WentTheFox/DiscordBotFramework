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
  /**
   * Collapse queued records that are the same message (same level, prefix and text, ignoring UUIDs and long hex ids) into one
   * embed carrying an occurrence count, instead of one embed per record. Keeps a burst of identical errors (a database outage,
   * a failing dependency) from turning into minutes of channel spam while the fixed batch cadence drains the backlog.
   * @default true
   */
  dedupe?: boolean;
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
// Discord rejects (HTTP 400) a message whose embeds' combined text exceeds this, even when every
// individual embed is within its own limits - a few long stack traces in one batch is enough.
const EMBEDS_TOTAL_TEXT_LIMIT = 6000;

// Ids that differ between otherwise identical messages (worker/request UUIDs, long hex tokens), masked when computing the dedupe key.
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const LONG_HEX_PATTERN = /\b(?=[0-9a-f]*\d)[0-9a-f]{16,}\b/gi; // must contain a digit, so a long run of plain a-f letters is not mistaken for an id

interface QueueEntry {
  /** The first record seen for this message; its text and time are what the embed shows. */
  record: PinoLogRecord;
  count: number;
  lastTime: number;
  key: string | undefined;
}

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
  private queue: QueueEntry[] = [];

  /** Queued (not yet flushed) entries by dedupe key; an entry leaves the map when it leaves the queue. */
  private readonly queuedByKey = new Map<string, QueueEntry>();

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
    const key = this.options.dedupe === false ? undefined : dedupeKey(record);
    const time = typeof record.time === 'number' ? record.time : Date.now();
    const existing = key === undefined ? undefined : this.queuedByKey.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastTime = time;
      return;
    }
    const entry: QueueEntry = { record, count: 1, lastTime: time, key };
    this.queue.push(entry);
    if (key !== undefined) this.queuedByKey.set(key, entry);
    const maxQueueLength = this.options.maxQueueLength ?? DEFAULT_MAX_QUEUE_LENGTH;
    if (this.queue.length > maxQueueLength) {
      const dropped = this.queue.length - maxQueueLength;
      for (const droppedEntry of this.queue.splice(0, dropped)) {
        if (droppedEntry.key !== undefined) this.queuedByKey.delete(droppedEntry.key);
      }
      // Reported directly to console, never re-entering the webhook pipeline, to
      // avoid a feedback loop during a log storm.
      console.error(`[discord-webhook-transport] Queue exceeded ${maxQueueLength} entries; dropped ${dropped} oldest log record(s).`);
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const maxBatchSize = this.options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
    const embeds: ReturnType<typeof buildEmbed>[] = [];
    let totalTextLength = 0;
    while (embeds.length < maxBatchSize && this.queue.length > 0) {
      const embed = buildEmbed(this.queue[0]);
      // The first embed always fits on its own (EMBED_DESCRIPTION_LIMIT < EMBEDS_TOTAL_TEXT_LIMIT),
      // anything past the combined limit is carried over to the next tick.
      if (embeds.length > 0 && totalTextLength + embed.description.length > EMBEDS_TOTAL_TEXT_LIMIT) break;
      const entry = this.queue.shift();
      if (entry?.key !== undefined) this.queuedByKey.delete(entry.key);
      embeds.push(embed);
      totalTextLength += embed.description.length;
    }
    const payload = {
      username: this.options.username,
      avatar_url: this.options.avatarUrl,
      embeds,
    };

    try {
      const response = await this.fetchImpl(this.options.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        // Discord explains a 400 in the body; without it the failure can't be diagnosed.
        const body = await response.text?.().catch(() => '') ?? '';
        console.error(`[discord-webhook-transport] Webhook POST failed with status ${response.status}${body ? `: ${truncate(body, 500)}` : ''}`);
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

function dedupeKey(record: PinoLogRecord): string {
  const prefixLabel = typeof record.prefixLabel === 'string' ? record.prefixLabel : '';
  const msg = typeof record.msg === 'string' ? record.msg : '';
  return `${record.level}|${prefixLabel}|${msg.replace(UUID_PATTERN, '<id>').replace(LONG_HEX_PATTERN, '<hex>')}`;
}

function buildEmbed(entry: QueueEntry) {
  const { record } = entry;
  const prefixLabel = typeof record.prefixLabel === 'string' ? record.prefixLabel : '';
  const msg = typeof record.msg === 'string' ? record.msg : '';
  // "×N" marker, only when several records were merged; the text is shortened so the marker always fits.
  const suffix = entry.count > 1 ? `\n×${entry.count} (last at ${new Date(entry.lastTime).toISOString().slice(11, 19)} UTC)` : '';
  return {
    description: truncate(`${prefixLabel}${msg}`, EMBED_DESCRIPTION_LIMIT - suffix.length) + suffix,
    color: LEVEL_COLORS[record.level] ?? LEVEL_COLORS[30],
    timestamp: new Date(record.time ?? Date.now()).toISOString(),
  };
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
