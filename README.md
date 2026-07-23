# @wentthefox-org/discord-bot-framework

[![npm version](https://img.shields.io/npm/v/@wentthefox-org/discord-bot-framework.svg)](https://www.npmjs.com/package/@wentthefox-org/discord-bot-framework)

Shared building blocks for discord.js-based Discord bots: a nestable console
logger, zod-based env validation, a generic HTTP API client, a slash-command
interaction dispatcher, command registration helpers, and thin client/shard
bootstrap wrappers — plus optional Postgres (Prisma) and i18next helpers for
bots that want them.

Extracted from [HammerTimeBot](https://github.com/WentTheFox/HammerTimeBot),
[Fantastick](https://github.com/WentTheFox/Fantastick), and
[PennyCurve](https://github.com/MLP-VectorClub/PennyCurve), which had each
independently reimplemented the same architecture. See `CLAUDE.md` for the
design rationale and module-to-source mapping.

## Install

```sh
pnpm add @wentthefox-org/discord-bot-framework zod discord.js @discordjs/rest discord-api-types
```

`zod` is a real dependency of this package but must also be listed by
consumers directly (peer resolution quirk of subpath-only usage) if you use
`defineEnv` at your own top level. `prisma`/`@prisma/client`/`@prisma/adapter-pg`
and `i18next`/`i18next-fs-backend` are **optional** peers — only install them
if you import `@wentthefox-org/discord-bot-framework/db` or `/i18n`.

## Subpaths

Everything is available from the package root **except** `./db`, `./i18n`, and
`./dev`. `./db`/`./i18n` are kept as separate subpaths so bots that don't use
Postgres/Prisma or i18next never need to install those peer dependencies.
`./dev` is excluded for a different reason — it has no extra peer
dependencies, but it's dev-only tooling that shouldn't leak into every
consumer's root import surface.

### `@wentthefox-org/discord-bot-framework/logger`

Backed by [pino](https://getpino.io). Plain `new Logger(prefix)` /
`Logger.fromShardInfo(...)` stay simple, console-only, worker-thread-free
constructors:

```ts
import { Logger, NestableLogger, DevNullLogger } from '@wentthefox-org/discord-bot-framework/logger';

const logger = new Logger('Bot');
const interactionLogger = logger.nest(`Interaction#${interaction.id}`);
const shardLogger = Logger.fromShardInfo(process.env.SHARDS);
```

To additionally fan logs out to a Discord webhook (in batches, respecting
Discord's per-webhook rate limits), use `createLogger` instead — it builds one
pino instance with the requested transport targets (console + optional
webhook), and `nest()` on the result shares that same instance rather than
spawning a new worker thread per call:

```ts
import { createLogger } from '@wentthefox-org/discord-bot-framework/logger';

const logger = createLogger({
  prefix: 'Bot',
  discordWebhook: {
    url: env.LOG_WEBHOOK_URL,
    level: 'warn', // only warn/error/fatal are sent to Discord; default 'warn'
  },
});
```

### `@wentthefox-org/discord-bot-framework/env`

```ts
import { defineEnv, boolFromString } from '@wentthefox-org/discord-bot-framework/env';
import { z } from 'zod';

export const env = defineEnv({
  DISCORD_BOT_TOKEN: z.string().min(1),
  API_URL: z.string().url(),
  LOCAL: boolFromString().default(false),
  SUPPORT_SERVER_ID: z.string().optional().default(''),
});
```

Throws one formatted `Error` listing every failing key. Pass `{ dotenv: false }`
to skip loading a `.env` file, or `{ source }` to validate a fixture object
(useful in tests).

### `@wentthefox-org/discord-bot-framework/api-client`

```ts
import { ApiClient, ApiAuthType } from '@wentthefox-org/discord-bot-framework/api-client';

const apiClient = new ApiClient(logger, {
  baseUrl: `${env.API_URL}/api`,
  authentication: { type: ApiAuthType.AUTHORIZATION_HEADER, getValue: () => env.API_TOKEN },
  userAgent: env.UA_STRING,
});

const { response } = await apiClient.request({
  path: '/things',
  validator: typia.createValidate<Thing[]>(), // optional; omit for `response: unknown`
});
```

### `@wentthefox-org/discord-bot-framework/interactions`

Commands/components/modals are self-describing — put the name/id directly on
the object (as `name` or `id`) and pass an array to a `createXRegistry()`
helper instead of hand-writing a `Record<Enum, Handler>` map. The registry
derives the literal name/id union from the array itself (TS 5 `const` type
params), so there's no separate enum to keep in sync, and `registry.byName`
is a drop-in `commands`/`components`/`modals` value for
`createInteractionRouter`/the `dispatch*` functions below.

```ts
import { createChatInputCommandRegistry, createComponentRegistry, createInteractionRouter, handleInteractionError } from '@wentthefox-org/discord-bot-framework/interactions';

const pingCommand = { name: 'ping', getDefinition: () => ({ name: 'ping', description: 'Replies with pong' }), handle: (interaction) => interaction.reply('pong') };

const chatInputCommandRegistry = createChatInputCommandRegistry([pingCommand /* , ... */]);
const componentRegistry = createComponentRegistry([/* ... */]);

const router = createInteractionRouter({
  commands: chatInputCommandRegistry.byName,
  components: componentRegistry.byName,
  buildContext: async (interaction, baseContext) => ({ ...baseContext, t: await buildT(interaction) }),
  onError: (interaction, context, error) =>
    handleInteractionError(interaction, context, { buildMessage: () => context.t('errors.unexpected') }),
});

client.on(Events.InteractionCreate, (interaction) => router(interaction, baseContext));
```

Bots that need to run logic between a command handler and error handling
(e.g. telemetry) can call `dispatchChatInputCommand`/`dispatchAutocomplete`/
`dispatchComponent`/`dispatchModal`/`dispatchContextMenu` directly instead of
the combined router — both take the same `registry.byName` maps.

There's also `createContextMenuCommandRegistry`/`createModalRegistry` for the
other two interaction kinds, and `flattenCommandModals(chatInputRegistry)`
for bots that nest a `.modal` map directly on the owning chat-input command
(rather than registering modals as a standalone top-level registry) — it
synthesizes a flat `Registry<string, BotModal<Ctx>>` view so `dispatchModal`
can consume it unchanged.

### `@wentthefox-org/discord-bot-framework/commands`

```ts
import { buildApplicationCommandsBody, createCommandRegistrar, fixedReplyCommandFactory } from '@wentthefox-org/discord-bot-framework/commands';

const registrar = createCommandRegistrar({ rest, applicationId: env.DISCORD_CLIENT_ID, logger });

const commandBodies = buildApplicationCommandsBody(
  { chatInput: chatInputCommandRegistry, contextMenu: contextMenuCommandRegistry },
  { sharedMetadata: { integration_types: [...], contexts: [...] }, definitionArg: t },
);
await registrar.updateGlobalCommands(commandBodies);

const pingCommand = fixedReplyCommandFactory('ping', 'Replies with pong', 'pong');
```

`buildApplicationCommandsBody` flattens one or more command registries into
the flat JSON body `createCommandRegistrar` expects: it applies each
command's `registerCondition` filter, merges `sharedMetadata` into every
`getDefinition()` result (the command's own fields win, except `name`, which
always comes from the registry key — command authors never need to repeat
`name` inside `getDefinition`'s return), and stably sorts every options array
(including nested subcommand/subcommand-group options) so required options
precede optional ones, matching Discord's API requirement automatically.

### `@wentthefox-org/discord-bot-framework/client`

Sharding is entirely opt-in. Most bots — anything single-guild or otherwise
small enough not to need multiple discord.js shards — should just use
`createBotClient` and never touch `createShardManager` or anything
shard-related at all:

```ts
import { createBotClient } from '@wentthefox-org/discord-bot-framework/client';

const client = await createBotClient({ intents: [GatewayIntentBits.Guilds], token, onInteraction });
```

Only reach for `createShardManager` if your bot actually runs across
multiple discord.js shards (large multi-guild bots). It's a separate,
independent function — pulling it in doesn't require any sharding-specific
config elsewhere in the framework:

```ts
import { createShardManager } from '@wentthefox-org/discord-bot-framework/client';

const manager = await createShardManager({
  token, botScriptPath, logger,
  beforeSpawn: () => startupCommandsUpdate(logger),
});
```

### `@wentthefox-org/discord-bot-framework/dev`

Live-reloads compiled command/interaction handler *implementations* during
local development, without restarting the process or re-registering commands
with Discord for every code change. `createHandlerWatcher` is a small,
dependency-free primitive built on native `fs.watch` — it only watches paths,
debounces/coalesces filesystem events per file, and invokes your `onChange`
callback (catching and logging anything it throws so a bad reload never
crashes the bot). It deliberately does not know how to re-import a module or
merge it into a registry, since that depends on each bot's own file layout:

```ts
import { createHandlerWatcher } from '@wentthefox-org/discord-bot-framework/dev';
import { pathToFileURL } from 'node:url';
import { basename, extname } from 'node:path';

if (env.DEV_WATCH) {
  const watcher = createHandlerWatcher({
    paths: ['./build/commands'],
    logger,
    onChange: async (filePath) => {
      const commandName = basename(filePath, extname(filePath));
      if (!chatInputCommandRegistry.isKnown(commandName)) return;
      // The `?t=` query busts Node's ESM module cache, which keys on the
      // resolved URL — deriving the registry key and writing it back into
      // `byName` is bot-side glue, not something this package standardizes.
      const fresh = await import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);
      chatInputCommandRegistry.byName[commandName] = fresh.default;
      logger.log(`Reloaded command handler: ${commandName}`);
    },
  });

  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });
}
```

This works because `dispatch*`/`createInteractionRouter` always read
`registry.byName[key]` live on every interaction — mutating an entry in place
is picked up on the very next interaction with no other wiring.

**Limitations:** this only reloads handler implementations already sitting in
a registry's `byName`. It does **not** re-run command registration — changing
a command's `getDefinition()` (name, description, options schema) still
requires `createCommandRegistrar` and a full process restart, and a brand-new
command file that wasn't in the registry at startup isn't picked up without
one either. It also assumes a parallel `tsc --watch` (or equivalent) process
is running, since this package has no bundler and watches compiled `build/`
output, not `src/`. Gate it behind your own dev-only flag (e.g. a `DEV_WATCH`
env var via `boolFromString()`) — this package intentionally has no built-in
concept of a dev/prod mode.

### `@wentthefox-org/discord-bot-framework/utils`

`runAttempts`, `getGitData`, `queueLazyPromises`, `condenseStringArray`,
`sendMessageSlices`, `loadAllMessages`, `getUserIdentifier`,
`stringifyChannelName`, `stringifyOptionsData`, and generic guild/member/role/
channel lookups (`getServer`, `findServerTextChannelByName`,
`findServerRoleByName`, `findServerMember`, `getServerMemberRole`,
`serverMemberHasRole`, `isSameObject`).

### `@wentthefox-org/discord-bot-framework/db` (optional)

Requires `@prisma/client` and `@prisma/adapter-pg` (Postgres only).

```ts
import { createPostgresPrismaDb } from '@wentthefox-org/discord-bot-framework/db';
import { PrismaClient } from './generated/prisma/client.js';

export const db = createPostgresPrismaDb(PrismaClient, { connectionString: env.DATABASE_URL });
```

Bots that only talk to an externally-managed database (or no database at
all) never need to import this subpath or install its peer dependencies.

### `@wentthefox-org/discord-bot-framework/i18n` (optional)

Requires `i18next` and `i18next-fs-backend`.

```ts
import { createI18nInitializer } from '@wentthefox-org/discord-bot-framework/i18n';

const initI18next = createI18nInitializer({
  localesDir: './src/locales',
  supportedLngs: SUPPORTED_LANGUAGES,
  fallbackLng: DEFAULT_LANGUAGE,
  debug: env.DEBUG_I18N,
});

const i18nextInstance = await initI18next(logger);
```

Locale file content, translation-credit generation, and any custom eslint
i18n-key-validation rules stay entirely bot-side.

## Development

```sh
pnpm install
pnpm test
pnpm run lint
pnpm run build
```
