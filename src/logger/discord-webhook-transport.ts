import build from 'pino-abstract-transport';
import { DiscordWebhookBatcher, DiscordWebhookBatcherOptions, PinoLogRecord } from './discord-webhook-batcher.js';

/**
 * pino worker-thread transport entry point, loaded by `createLogger()` via an
 * absolute file path (not a bare module specifier), since nothing outside this
 * module needs to resolve it by name.
 */
export default function discordWebhookTransport(options: DiscordWebhookBatcherOptions) {
  const batcher = new DiscordWebhookBatcher(options);

  return build(
    async (source) => {
      for await (const record of source) {
        batcher.write(record as PinoLogRecord);
      }
    },
    {
      close: async () => {
        await batcher.close();
      },
    },
  );
}
