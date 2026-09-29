import { Client, ClientOptions, REST } from 'discord.js';

const INTERACTION_CALLBACK_ROUTE = /^\/interactions\/\d+\/[^/]+\/callback$/;

export const isInteractionCallbackRoute = (fullRoute: string): boolean => INTERACTION_CALLBACK_ROUTE.test(fullRoute);

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
 *
 * The initial response to an interaction (`Routes.interactionCallback()`) is
 * sent through a separate `REST` instance with `retries: 0`: Discord only
 * accepts it within ~3s of the interaction's creation, and each of
 * `@discordjs/rest`'s retries on a 5xx takes about as long as that on its own,
 * so during an outage they only ever delay the inevitable failure (by up to
 * tens of seconds). Everything else - `editReply()`, `followUp()`, which have
 * 15 minutes - keeps the client's usual retries.
 */
export function createWebhookOnlyClient(options: CreateWebhookOnlyClientOptions): Client<true> {
  const { token, intents = [], ...clientOptions } = options;
  const client = new Client({ intents, ...clientOptions });
  client.token = token;
  client.rest.setToken(token);

  const callbackRest = new REST({ ...client.options.rest, retries: 0 }).setToken(token);
  const post = client.rest.post.bind(client.rest);
  client.rest.post = (fullRoute, options) =>
    isInteractionCallbackRoute(fullRoute) ? callbackRest.post(fullRoute, options) : post(fullRoute, options);

  return client as Client<true>;
}
