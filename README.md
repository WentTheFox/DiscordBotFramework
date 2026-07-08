# @wentthefox-org/discord-bot-framework

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

Everything is available from the package root **except** `./db` and `./i18n`,
which are kept as separate subpaths so bots that don't use Postgres/Prisma or
i18next never need to install those peer dependencies.

### `@wentthefox-org/discord-bot-framework/logger`

```ts
import { Logger, NestableLogger, DevNullLogger } from '@wentthefox-org/discord-bot-framework/logger';

const logger = new Logger('Bot');
const interactionLogger = logger.nest(`Interaction#${interaction.id}`);
const shardLogger = Logger.fromShardInfo(process.env.SHARDS);
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

```ts
import { createInteractionRouter, handleInteractionError } from '@wentthefox-org/discord-bot-framework/interactions';

const router = createInteractionRouter({
  commands: chatInputCommandMap,
  components: messageComponentMap,
  buildContext: async (interaction, baseContext) => ({ ...baseContext, t: await buildT(interaction) }),
  onError: (interaction, context, error) =>
    handleInteractionError(interaction, context, { buildMessage: () => context.t('errors.unexpected') }),
});

client.on(Events.InteractionCreate, (interaction) => router(interaction, baseContext));
```

Bots that need to run logic between a command handler and error handling
(e.g. telemetry) can call `dispatchChatInputCommand`/`dispatchAutocomplete`/
`dispatchComponent`/`dispatchModal`/`dispatchContextMenu` directly instead of
the combined router.

### `@wentthefox-org/discord-bot-framework/commands`

```ts
import { createCommandRegistrar, fixedReplyCommandFactory } from '@wentthefox-org/discord-bot-framework/commands';

const registrar = createCommandRegistrar({ rest, applicationId: env.DISCORD_CLIENT_ID, logger });
await registrar.updateGlobalCommands(commandBodies);

const pingCommand = fixedReplyCommandFactory('ping', 'Replies with pong', 'pong');
```

### `@wentthefox-org/discord-bot-framework/client`

```ts
import { createBotClient, createShardManager } from '@wentthefox-org/discord-bot-framework/client';

// Single-guild / unsharded bots:
const client = await createBotClient({ intents: [GatewayIntentBits.Guilds], token, onInteraction });

// Sharded bots:
const manager = await createShardManager({
  token, botScriptPath, logger,
  beforeSpawn: () => startupCommandsUpdate(logger),
});
```

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
