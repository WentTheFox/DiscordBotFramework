# @went.tf/discord-bot-framework

[![npm version](https://img.shields.io/npm/v/@went.tf/discord-bot-framework.svg)](https://www.npmjs.com/package/@went.tf/discord-bot-framework)

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
pnpm add @went.tf/discord-bot-framework zod discord.js @discordjs/rest discord-api-types
```

`zod` and `ajv` are real dependencies of this package but must also be
listed by consumers directly (peer resolution quirk of subpath-only usage)
if you use `defineEnv` or compile your own commands schema at your own top
level. `prisma`/`@prisma/client`/`@prisma/adapter-pg` and
`i18next`/`i18next-fs-backend` are **optional** peers — only install them if
you import `@went.tf/discord-bot-framework/db` or `/i18n`.

## Subpaths

Everything is available from the package root **except** `./db`, `./i18n`, and
`./dev`. `./db`/`./i18n` are kept as separate subpaths so bots that don't use
Postgres/Prisma or i18next never need to install those peer dependencies.
`./dev` is excluded for a different reason — it has no extra peer
dependencies, but it's dev-only tooling that shouldn't leak into every
consumer's root import surface.

### `@went.tf/discord-bot-framework/logger`

Backed by [pino](https://getpino.io). Plain `new Logger(prefix)` /
`Logger.fromShardInfo(...)` stay simple, console-only, worker-thread-free
constructors:

```ts
import { Logger, NestableLogger, DevNullLogger } from '@went.tf/discord-bot-framework/logger';

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
import { createLogger } from '@went.tf/discord-bot-framework/logger';

const logger = createLogger({
  prefix: 'Bot',
  discordWebhook: {
    url: env.LOG_WEBHOOK_URL,
    level: 'warn', // only warn/error/fatal are sent to Discord; default 'warn'
  },
});
```

### `@went.tf/discord-bot-framework/env`

```ts
import { defineEnv, boolFromString } from '@went.tf/discord-bot-framework/env';
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

### `@went.tf/discord-bot-framework/api-client`

```ts
import { ApiClient, ApiAuthType } from '@went.tf/discord-bot-framework/api-client';

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

### `@went.tf/discord-bot-framework/interactions`

Commands/components/modals are self-describing — put the name/id directly on
the object (as `name` or `id`) and pass an array to a `createXRegistry()`
helper instead of hand-writing a `Record<Enum, Handler>` map. The registry
derives the literal name/id union from the array itself (TS 5 `const` type
params), so there's no separate enum to keep in sync, and `registry.byName`
is a drop-in `commands`/`components`/`modals` value for
`createInteractionRouter`/the `dispatch*` functions below.

A command's *wire definition* (name, description, options, permissions) no
longer lives on this object — it lives in your `commands.json` file, see
`./commands` below. This object is purely the handler side:

```ts
import { createChatInputCommandRegistry, createComponentRegistry, createInteractionRouter, handleInteractionError } from '@went.tf/discord-bot-framework/interactions';

const pingCommand = { name: 'ping', handle: (interaction) => interaction.reply('pong') };

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

If other code (e.g. a locale-file type, or a helper building a command
mention) needs the literal name/id union as a *type*, derive it from the
registry you already built instead of hand-writing a parallel
`const enum CommandName { ... }` — that enum is exactly the duplication the
registry's `const` type inference exists to avoid:

```ts
import { RegistryName } from '@went.tf/discord-bot-framework/interactions';

const chatInputCommandRegistry = createChatInputCommandRegistry([pingCommand, searchCommand]);
type ChatInputCommandName = RegistryName<typeof chatInputCommandRegistry>; // 'ping' | 'search'
```

A command's name should only ever be written down in two places: its
`commands.json` entry and its own registry object's `name` field — nothing
else should define it again, only reference the same string (or the derived
`RegistryName` type) that those two already agree on.

### `@went.tf/discord-bot-framework/commands`

**Every command's wire definition (name, description, options, permissions)
lives in one `commands.json` file per bot** — a flat array mirroring
Discord's bulk-overwrite PUT body exactly, so it's directly postable to
Discord's API as-is (translations aside, see below). This replaces the old
per-command `getDefinition()` function: handler objects (`{ name, handle,
autocomplete?, modal? }`) no longer describe their own wire shape at all.

1. Author `commands.json`, validated against your own JSON Schema composed
   over this package's generic fragments (see "JSON Schema fragments"
   below):

   ```json
   {
     "$schema": "./commands.schema.json",
     "commands": [
       { "type": "CHAT_INPUT", "name": "ping", "description": "Replies with pong" },
       {
         "type": "CHAT_INPUT",
         "name": "search",
         "description": "Search for something",
         "options": [
           { "type": "STRING", "name": "query", "description": "Query string", "required": true }
         ]
       }
     ]
   }
   ```

   The `{ "$schema", "commands" }` wrapper is what makes `commands.json`
   editable with real autocomplete/validation in VS Code, JetBrains, or any
   other JSON-Schema-aware editor: `$schema` is only ever valid on a JSON
   *object*, and a bare array can never carry one. A **bare array** (just
   the `commands` value on its own, no wrapper) is still fully supported —
   nothing about the wrapper is required — but you lose the inline `$schema`
   editor hookup if you use it. `buildApplicationCommandsBody` accepts
   either shape directly.

   `type` (and `contexts`/`integration_types`/`channel_types`) accept either
   Discord's raw numeric value or the UPPER_SNAKE_CASE string alias shown
   above — nobody should have to remember that `3` means `STRING`. Both
   forms, and any mix of the two, are always valid; `buildApplicationCommandsBody`
   resolves whichever form was used to its real numeric value right before
   writing each command/option into the final REST body, using the mapping
   in `./commands/schema`'s `enum-maps.ts` (sourced from `discord-api-types`'
   own enums, not hand-duplicated numbers, so it can't drift). The numeric
   form still works and always will — this is additive, not a replacement.

2. Parse and validate it before doing anything else with it:

   ```ts
   import { Ajv } from 'ajv';
   import { parseCommandsFile, registerFrameworkSchemas, resolveCommandsSchemaRefs } from '@went.tf/discord-bot-framework/commands/schema';
   import myCommandsSchemaRaw from './commands.schema.json' with { type: 'json' };
   import commandsData from './commands.json' with { type: 'json' };

   // Rewrites your schema's relative-path $refs (into node_modules) to each
   // fragment's real ajv-resolvable identity - see "JSON Schema fragments" below.
   const myCommandsSchema = resolveCommandsSchemaRefs(myCommandsSchemaRaw);

   const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
   registerFrameworkSchemas(ajv);
   const validate = ajv.compile(myCommandsSchema);

   const commandsFile = parseCommandsFile(commandsData, { validate });
   ```

3. Build the Discord-ready body and register it — unchanged from before,
   just fed by `commandsFile` + your handler registries instead of
   `getDefinition()`:

   ```ts
   import { buildApplicationCommandsBody, createCommandRegistrar, fixedReplyCommandFactory } from '@went.tf/discord-bot-framework/commands';

   const registrar = createCommandRegistrar({ rest, applicationId: env.DISCORD_CLIENT_ID, logger });

   const commandBodies = buildApplicationCommandsBody(
     commandsFile,
     { chatInput: chatInputCommandRegistry, contextMenu: contextMenuCommandRegistry },
     { sharedMetadata: { integration_types: [...], contexts: [...] } },
   );
   await registrar.updateGlobalCommands(commandBodies);

   const pingCommand = { name: 'ping', ...fixedReplyCommandFactory('pong') };
   ```

`buildApplicationCommandsBody` walks `commandsFile` (its order drives the
output order, not registry insertion order), matches each entry to a handler
by name, applies `registerCondition` filtering, merges `sharedMetadata`
(the commands.json entry's own fields win on conflict), and stably sorts
every options array (including nested subcommand/subcommand-group options)
so required options precede optional ones, matching Discord's API
requirement automatically. It also enforces two invariants **before ever
calling Discord's API**, each collecting every offender into one thrown
error rather than failing on the first: every `commands.json` entry must
have a matching handler, every handler must have a matching `commands.json`
entry, and every command/option must end up with a non-empty `description`
(from the file directly, or via `resolveDescription` — see "Localizing
command names/descriptions" below).

`fixedReplyCommandFactory(content, ephemeral?)` now only returns `{ handle }`
— pair it with a registry entry that supplies `name`, and a `commands.json`
entry that supplies `name`/`description`.

#### JSON Schema fragments

This package ships only the **generic, reusable JSON Schema building
blocks** mirroring `discord-api-types`' command/option shapes — it does not
dictate one rigid schema for your whole `commands.json` file. Compose your
own schema on top via `$ref`/`allOf`, e.g. to narrow `name` to an enum of
your bot's actual command names. Since a bot's own `commands.schema.json` is
authored as plain JSON (so external tools can consume it too, not just this
package's TS composition helpers), supporting **both** the bare-array and
the `{ $schema, commands }` root shapes over the same narrowed entry uses a
local `$defs` entry referenced from both branches:

```json
{
  "$defs": {
    "entry": {
      "oneOf": [
        {
          "allOf": [
            { "$ref": "../node_modules/@went.tf/discord-bot-framework/build/commands/schema/chat-input-command.json" },
            { "properties": { "name": { "enum": ["ping", "search"] } } }
          ]
        },
        { "$ref": "../node_modules/@went.tf/discord-bot-framework/build/commands/schema/context-menu-command.json" }
      ]
    }
  },
  "oneOf": [
    { "type": "array", "items": { "$ref": "#/$defs/entry" } },
    {
      "type": "object",
      "properties": {
        "$schema": { "type": "string" },
        "commands": { "type": "array", "items": { "$ref": "#/$defs/entry" } }
      },
      "required": ["commands"],
      "additionalProperties": false
    }
  ]
}
```

`$ref` uses a **real relative filesystem path** into `node_modules` (the
exact `../` count doesn't have to be exactly right — see below) rather than
an opaque URL — this is what makes an editor (VS Code, JetBrains, ...)
actually able to follow it and offer real autocomplete/validation while you
hand-edit `commands.schema.json`, since it points at a real file: this
package ships its raw fragment `.json` mirrors precisely so a path like this
resolves to something real on disk, no network access involved.

**ajv** can't follow that same relative path directly — it resolves relative
`$ref`s via real RFC3986 URI resolution against the referencing schema's own
`$id`, and `node_modules` is virtualized under a symlinked store by pnpm (and
similar tools), so there is no `$id` value that makes ajv's own resolution
land on the right file for every install. `resolveCommandsSchemaRefs()`
sidesteps this: it rewrites any `$ref` matching a shipped fragment's
filename to that fragment's canonical `$id` (whatever relative-path prefix
you used), which `registerFrameworkSchemas(ajv)` has already registered.
Your own local refs (e.g. `#/$defs/...`) are left untouched:

```ts
import myCommandsSchemaRaw from './commands.schema.json' with { type: 'json' };
const myCommandsSchema = resolveCommandsSchemaRefs(myCommandsSchemaRaw);
registerFrameworkSchemas(ajv); // before ajv.compile(myCommandsSchema)
```

If you don't need the name-narrowing (or any other bot-specific constraint),
skip authoring your own schema entirely and validate directly against this
package's own `commandsFileSchema` — it already accepts both root shapes.

The fragments this package ships (all under
`@went.tf/discord-bot-framework/commands/schema`, and as real standalone
`.json` files under `build/commands/schema/` for non-TS tooling):
`commands-file`, `command-file-entry`, `chat-input-command`,
`context-menu-command`, `application-command-option` (and its
`application-command-leaf-option`/`application-command-subcommand`/
`application-command-subcommand-group` building blocks),
`application-command-option-choice`, `default-member-permissions`,
`option-name`, `context-menu-name`, `application-command-type`,
`interaction-context-type`, `application-integration-type`, `channel-type`.

`./commands/schema` also exports `enum-maps.ts`'s `APPLICATION_COMMAND_TYPE_MAP`,
`APPLICATION_COMMAND_OPTION_TYPE_MAP`, `INTERACTION_CONTEXT_TYPE_MAP`,
`APPLICATION_INTEGRATION_TYPE_MAP`, `CHANNEL_TYPE_MAP`, and `resolveEnumValue` —
the same lookup tables `buildApplicationCommandsBody` uses internally to
resolve `commands.json`'s UPPER_SNAKE_CASE string aliases, exported in case
other tooling built on top of this package needs the same mapping (e.g. a
linter or a codemod converting old numeric `commands.json` files to the
string form).

Base fragments use `additionalProperties: false` for strictness — if your
bot needs a genuinely new top-level field per command entry, you'll need
`unevaluatedProperties`-based composition instead of `allOf`, since
`additionalProperties: false` only evaluates a schema's own declared
properties, not fields declared on sibling `allOf` members.

Command/option **names are required** in `commands.json`, but
**descriptions are optional** — a description can be authored directly in
the file, or left out and filled in at submission time (see below). Nothing
in `commands.json` is ever localized by hand: no `name_localizations`/
`description_localizations` fields exist in this schema at all.

#### Localizing command names/descriptions

`createCommandLocalizer` (from `@went.tf/discord-bot-framework/i18n`)
generically resolves descriptions and builds `name_localizations`/
`description_localizations` dictionaries from an i18next `TFunction`, keyed
by the same path convention `buildApplicationCommandsBody` uses internally
(`commands.<name>.description`, `commands.<name>.options.<option>.description`,
and one level deeper for subcommand options):

```ts
import { createCommandLocalizer } from '@went.tf/discord-bot-framework/i18n';

const localizer = createCommandLocalizer({ locales: SUPPORTED_LANGUAGES, baseLocale: DEFAULT_LANGUAGE, t: i18nextInstance.t });

const commandBodies = buildApplicationCommandsBody(commandsFile, registries, {
  resolveDescription: localizer.resolveDescription,
  localizeNames: localizer.localizeName,
  localizeDescriptions: localizer.localizeDescription,
});
```

If a command/option has no `description` in `commands.json` **and** no
`resolveDescription` hook is wired in (or the hook can't find a translation
either), `buildApplicationCommandsBody` throws before anything is sent to
Discord — it never silently registers a command with a missing description.

To derive TS types from your own composed schema, install
[`json-schema-to-ts`](https://www.npmjs.com/package/json-schema-to-ts)
yourself (it's a devDependency of this package, type-only, not re-exported)
and use its `FromSchema` the same way this package's own
`commands/schema/index.ts` does — pass every `$ref`-ed fragment (yours and
this package's) in the `references` option.

### `@went.tf/discord-bot-framework/client`

Sharding is entirely opt-in. Most bots — anything single-guild or otherwise
small enough not to need multiple discord.js shards — should just use
`createBotClient` and never touch `createShardManager` or anything
shard-related at all:

```ts
import { createBotClient } from '@went.tf/discord-bot-framework/client';

const client = await createBotClient({ intents: [GatewayIntentBits.Guilds], token, onInteraction });
```

Only reach for `createShardManager` if your bot actually runs across
multiple discord.js shards (large multi-guild bots). It's a separate,
independent function — pulling it in doesn't require any sharding-specific
config elsewhere in the framework:

```ts
import { createShardManager } from '@went.tf/discord-bot-framework/client';

const manager = await createShardManager({
  token, botScriptPath, logger,
  beforeSpawn: () => startupCommandsUpdate(logger),
});
```

### `@went.tf/discord-bot-framework/dev`

Live-reloads compiled command/interaction handler *implementations* during
local development, without restarting the process or re-registering commands
with Discord for every code change. `createHandlerWatcher` is a small,
dependency-free primitive built on native `fs.watch` — it only watches paths,
debounces/coalesces filesystem events per file, and invokes your `onChange`
callback (catching and logging anything it throws so a bad reload never
crashes the bot). It deliberately does not know how to re-import a module or
merge it into a registry, since that depends on each bot's own file layout:

```ts
import { createHandlerWatcher } from '@went.tf/discord-bot-framework/dev';
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
a command's `commands.json` entry (name, description, options schema) still
requires re-running `buildApplicationCommandsBody` + `createCommandRegistrar`
and a full process restart, and a brand-new command file that wasn't in the
registry at startup isn't picked up without one either. It also assumes a parallel `tsc --watch` (or equivalent) process
is running, since this package has no bundler and watches compiled `build/`
output, not `src/`. Gate it behind your own dev-only flag (e.g. a `DEV_WATCH`
env var via `boolFromString()`) — this package intentionally has no built-in
concept of a dev/prod mode.

If your `onChange` callback re-imports only the *one file that changed* (as
in the example above), it correctly picks up edits to a command file itself,
but **not** edits to a shared module that command statically imports — a
modal handler, a util, anything under a second file. Node's ESM cache keys on
resolved URL: giving the changed file a fresh cache-busted URL doesn't affect
how its own `import './some-util.js'` statement resolves, so that nested
import still returns the stale cached instance. Reimporting one small
aggregator module that pulls in your whole command/component tree (its
`registry.byName` values in particular) instead of one file at a time avoids
this — see `createSourceReloader` below.

#### `createSourceReloader`

Re-imports a module — and everything it transitively imports from under a
given root directory — as brand-new instances on every call, without
restarting the process. Unlike the single-file `?t=` trick above, this
correctly picks up changes to *any* file in the reloaded subtree, not just
the one directly re-imported, by tagging every module resolved under
`rootDir` with a shared epoch via a `module.register()` hook, and bumping
that epoch before each `reimport()`:

```ts
import { createHandlerWatcher, createSourceReloader } from '@went.tf/discord-bot-framework/dev';
import { join } from 'node:path';

if (env.DEV_WATCH) {
  const reloader = createSourceReloader({ rootDir: currentFolder, logger });
  const interactionsPath = join(currentFolder, 'utils', 'interactions.ts');

  const watcher = createHandlerWatcher({
    paths: [join(currentFolder, 'commands'), join(currentFolder, 'components'), join(currentFolder, 'utils')],
    filter: filePath => filePath.endsWith('.ts'),
    logger,
    onChange: async () => {
      const fresh = await reloader.reimport(interactionsPath);
      // `registry.byName` is what dispatch reads live — merge into the existing
      // registry object in place; the binding in the module that declared it
      // (and everything that imported it) can't be swapped from out here.
      Object.assign(chatInputCommandRegistry.byName, fresh.chatInputCommandRegistry.byName);
      Object.assign(componentRegistry.byName, fresh.componentRegistry.byName);
    },
  });

  process.on('SIGINT', () => watcher.close());
}
```

Anything resolved **outside** `rootDir` — `node_modules`, this framework,
compiled output elsewhere — is left completely alone, on Node's normal
module cache. That's the property that makes this safe to use for a Discord
bot: as long as your gateway client and DB pool are created (and imported
from) outside `rootDir` — true for the shard-script shape shown under
`createShardManager` below, where the client is built directly in `bot.ts`
and never re-imported by the reloaded `interactions.ts` subtree — a reload
never reconnects the client or reopens the pool. Reloading a module *with*
top-level side effects (one that opens a connection, starts a timer) will
duplicate those side effects on every call; keep whatever you reload
side-effect-free (a thin aggregator of plain object exports, like
`interactions.ts` above).

`reimport()`'s epoch tag lives on a `SharedArrayBuffer`, so it needs
`--allow-worker` under Node's permission model, same as `module.register()`
itself.

**Combining with `createShardManager`:** the example above assumes the
process calling `createHandlerWatcher` is also the one holding the
registries — true for `createBotClient` bots, and true for a
`createShardManager` bot's *shard* process (the file at `botScriptPath`),
**not** the top-level process that calls `createShardManager` itself. Put the
`if (env.DEV_WATCH) { ... }` block in the shard script, after the client is
created, not in the file that spawns the `ShardingManager`.

If you skip `tsc --watch` and instead run the shard script directly from
source (`tsx`/`ts-node`/similar) to avoid a separate compile step, two things
that are easy to get wrong:

- `botScriptPath` must point at the actual file being executed (e.g. `bot.ts`),
  not a `build/`-compiled path that was never written.
- discord.js's `ShardingManager` does **not** inherit the parent process's
  CLI flags for spawned shards — both `'process'` (`child_process.fork`) and
  `'worker'` (`worker_threads.Worker`) modes are given an explicit
  `execArgv: []` unless you pass your own `execArgv` to `createShardManager`.
  If the parent process is only able to run TypeScript because of loader
  flags injected by a tool like `tsx` (visible in `process.execArgv`), those
  flags are silently dropped for every shard unless you forward them
  yourself — the shard process/thread then fails to load a `.ts` entry file
  at all. Forward them explicitly:

  ```ts
  const isTsDevMode = process.env.npm_lifecycle_script?.includes('.ts') ?? false;
  await createShardManager({
    token, logger,
    botScriptPath: `${currentFolder}/bot.${isTsDevMode ? 'ts' : 'js'}`,
    mode: isTsDevMode ? 'worker' : 'process',
    execArgv: isTsDevMode ? process.execArgv : undefined,
    beforeSpawn: () => startupCommandsUpdate(logger),
  });
  ```

  This has no effect on watched paths: `createHandlerWatcher`'s `filter`
  option still needs updating to match `.ts` instead of the default
  `.js`/`.mjs`/`.cjs`, since there's no `build/` output to watch in this mode.

### `@went.tf/discord-bot-framework/utils`

`runAttempts`, `getGitData`, `queueLazyPromises`, `condenseStringArray`,
`sendMessageSlices`, `loadAllMessages`, `getUserIdentifier`,
`stringifyChannelName`, `stringifyOptionsData`, and generic guild/member/role/
channel lookups (`getServer`, `findServerTextChannelByName`,
`findServerRoleByName`, `findServerMember`, `getServerMemberRole`,
`serverMemberHasRole`, `isSameObject`).

### `@went.tf/discord-bot-framework/db` (optional)

Requires `@prisma/client` and `@prisma/adapter-pg` (Postgres only).

```ts
import { createPostgresPrismaDb } from '@went.tf/discord-bot-framework/db';
import { PrismaClient } from './generated/prisma/client.js';

export const db = createPostgresPrismaDb(PrismaClient, { connectionString: env.DATABASE_URL });
```

Bots that only talk to an externally-managed database (or no database at
all) never need to import this subpath or install its peer dependencies.

### `@went.tf/discord-bot-framework/i18n` (optional)

Requires `i18next` and `i18next-fs-backend`.

```ts
import { createI18nInitializer } from '@went.tf/discord-bot-framework/i18n';

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

`createCommandLocalizer` also lives here — see "Localizing command
names/descriptions" under `./commands` above.

## Development

```sh
pnpm install
pnpm test
pnpm run lint
pnpm run build
```
