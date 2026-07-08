import { Client, ClientOptions, Events, Interaction } from 'discord.js';

export interface CreateBotClientOptions extends Omit<ClientOptions, 'intents'> {
  intents: ClientOptions['intents'];
  token: string;
  onReady?: (client: Client<true>) => void | Promise<void>;
  onInteraction: (interaction: Interaction) => void | Promise<void>;
}

/**
 * Creates and logs in a single (unsharded) discord.js Client, wiring the
 * `ready` and `interactionCreate` events. For bots that shard, see
 * `createShardManager` instead.
 */
export async function createBotClient(options: CreateBotClientOptions): Promise<Client<true>> {
  const { token, onReady, onInteraction, ...clientOptions } = options;
  const client = new Client(clientOptions);

  if (onReady) {
    client.on(Events.ClientReady, onReady);
  }
  client.on(Events.InteractionCreate, async (interaction) => {
    await onInteraction(interaction);
  });

  await client.login(token);
  return client as Client<true>;
}
