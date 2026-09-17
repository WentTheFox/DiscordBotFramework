import { Client, ClientOptions } from 'discord.js';

export interface CreateWebhookOnlyClientOptions extends Omit<ClientOptions, 'intents'> {
  /** No gateway connection is ever opened, so no intents actually apply - defaults to `[]`. */
  intents?: ClientOptions['intents'];
  token: string;
}

/**
 * Builds a discord.js `Client` for webhook (HTTP Interactions Endpoint) mode:
 * fully public API (`new Client()` + `Client#rest.setToken()`, both documented),
 * but deliberately **never calls `Client#login()`**, since `login()`
 * unconditionally opens a gateway WebSocket connection
 * (`this.ws.connect()`, no way to opt out) - the entire reason a bot would
 * reach for `./webhook` in the first place.
 *
 * The resulting client's `rest` is fully authenticated (same
 * `rest.setToken()` call `login()` itself makes), so `Interaction#reply()`/
 * `deferReply()`/`editReply()`/etc. work normally - they only ever call
 * `this.client.rest` against `Routes.interactionCallback()`, with no
 * `client.application`/gateway dependency. `client.guilds`/`client.channels`
 * caches stay permanently empty, though - see `interactionFromWebhookPayload`'s
 * doc comment for what that does and doesn't affect.
 *
 * Typed as `Client<true>` (discord.js's "ready" client) rather than the more
 * literally-accurate `Client<false>`, purely so the result can be passed to
 * `interactionFromWebhookPayload`/`dispatch*`/`createInteractionRouter`
 * without a cast at every call site - every discord.js interaction class's
 * own constructor requires `Client<true>` regardless of whether the client
 * actually went through the gateway ready lifecycle. This client never does
 * (there's no gateway connection to become ready on), so anything gated by
 * `Ready` at the type level but genuinely absent at runtime -
 * `client.user`/`client.application` chief among them - will be `null`
 * despite what its type claims; avoid touching those in webhook mode.
 */
export function createWebhookOnlyClient(options: CreateWebhookOnlyClientOptions): Client<true> {
  const { token, intents = [], ...clientOptions } = options;
  const client = new Client({ intents, ...clientOptions });
  client.token = token;
  client.rest.setToken(token);
  return client as Client<true>;
}
