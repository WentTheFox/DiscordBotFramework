# DiscordBotFramework

## What this repo is

`@went.tf/discord-bot-framework` — a single publishable npm package
extracting the shared architecture of three discord.js bots that had each
independently reimplemented the same skeleton:

- **HammerTimeBot** (`../HammerTimeBot`, org WentTheFox) — sharded, zero DB,
  all persistence via an external HTTP backend, i18next-heavy, typia for API
  response validation.
- **Fantastick** (`../Fantastick`, org WentTheFox) — sharded, Prisma 7 +
  `@prisma/adapter-pg` Postgres access, a standalone pg-boss queue-worker
  process, modal + autocomplete interactions, the most generic `ApiClient`
  of the three.
- **PennyCurve** (different org: MLP-VectorClub) — legacy, unsharded,
  single-guild, zero DB, no logger (raw `console.*`), older tooling
  generation (ESLint 8, Jest, npm).

Only **HammerTimeBot** has been migrated onto this framework so far.
Fantastick and PennyCurve migrations are future work in their own repos —
but every design decision here was made to accommodate their shapes too
(Prisma DB, queue-worker context fields, unsharded client, modal/autocomplete
dispatch, no-logger legacy bot), not just HammerTimeBot's.

## Non-obvious design decisions (don't relitigate these without asking)

- **One package, not a package-per-module monorepo.** Optional pieces (DB,
  i18n) are `./db` and `./i18n` **subpath exports** of the same package, not
  separate npm packages. The user explicitly chose this over a pnpm
  multi-package workspace.
- **No Changesets / multi-package versioning tooling.** Single package means
  a single version — just `npm version` + `pnpm publish --access public`.
- **typia is never a dependency of this package**, even though HammerTimeBot
  and Fantastick both use it. `ApiClient.request<T>()`'s `validator` param is
  optional and structurally typed (`ValidationResult<T>`, compatible with
  typia's `IValidation<T>` shape) so bots that use typia can pass
  `typia.createValidate<T>()` directly without this package depending on it.
- **DB support is Postgres-only and optional.** `./db` wraps Prisma's
  `@prisma/adapter-pg` driver-adapter pattern (`createPostgresPrismaDb`).
  It takes the bot's *generated* `PrismaClient` constructor as a parameter —
  the framework can never import a concrete Prisma client type, since every
  bot generates its own. `prisma`/`@prisma/client`/`@prisma/adapter-pg` are
  `peerDependencies` with `peerDependenciesMeta.optional: true`, kept out of
  the package's own `dependencies` entirely so bots with no DB (HammerTimeBot,
  PennyCurve) never see them. **This subpath is unexercised by the
  HammerTimeBot migration** — its design is unvalidated against real usage
  until Fantastick migrates. Keep its surface to one factory function.
- **`ApiAuthMethod` auth fields are getter functions (`getValue: () => string`),
  not `keyof typeof env`.** Fantastick's original `ApiClient` typed auth
  config fields as `keyof typeof env`, which is direct compile-time coupling
  to the *consuming bot's* env object shape and cannot survive extraction.
  When Fantastick migrates, its `ApiClient` construction call sites will need
  this (small, deliberate) breaking change applied.
- **`createShardManager` is intentionally minimal** — pure `ShardingManager`
  event-forwarding plus one `beforeSpawn` hook. Resist adding bot-specific
  orchestration logic to it (e.g. HammerTimeBot's specific
  `startupCommandsUpdate` steps stay bot-side, passed in as the hook).
- **Sharding is fully optional, by design, not an oversight.** `createBotClient`
  (unsharded) and `createShardManager` (sharded) are two independent functions
  in `src/client/` — neither depends on the other, and `createBotClient` has
  zero sharding-related config surface. A single-guild bot like PennyCurve
  should call `createBotClient` only and never import or reference
  `createShardManager` at all. Don't unify them behind a single
  `createBot({ sharding? })`-style entry point unless asked — the two setups
  (single `Client` login vs. spawning a separate `bot.js` process per shard
  via `ShardingManager`) are structurally different enough that a shared
  entry point would just be an `if` branch hiding two unrelated code paths.
- **The interaction router is split into two layers on purpose:**
  `dispatch*` functions (`dispatchChatInputCommand`, `dispatchAutocomplete`,
  `dispatchComponent`, `dispatchModal`, `dispatchContextMenu` in
  `src/interactions/dispatch.ts`) do "find handler, invoke it, catch errors,
  call `onError`" for one interaction type each. `createInteractionRouter`
  (`src/interactions/router.ts`) is a convenience wrapper combining all of
  them behind one `Client#interactionCreate`-shaped function, for bots that
  don't need anything extra. Bots that need to do work between a handler
  running and error handling (e.g. HammerTimeBot's post-command telemetry)
  should call the `dispatch*` functions directly instead of the combined
  router — don't try to force telemetry hooks into the router itself.
- **`handleInteractionError` takes a `reply` override and an
  `onUnexpectedError` hook, not baked-in i18n or an owner-mention.**
  HammerTimeBot/Fantastick's `interactionReply` wrapper (ComponentsV2
  upgrades, translation completion footers, command-mention rewriting) is
  extremely bot-specific and stays bot-side — pass it as the `reply` option.
  PennyCurve's "@mention BOT_OWNER_ID on unexpected error" becomes the
  `onUnexpectedError` hook, unused by HammerTimeBot today.
- **`env/define-env.ts` uses zod**, replacing every bot's hand-rolled
  `dotenv + Object.keys(values).forEach(assert-defined)` pattern. Required vs.
  optional vs. defaulted env vars are expressed directly in the zod shape
  passed to `defineEnv()` — there is no separate "required keys" list.
  `boolFromString()` exists specifically to reproduce the `VAR === 'true'`
  convention (not real boolean coercion) that all three bots already rely on;
  don't "fix" it to accept `"1"`/`"yes"`/etc. without checking bot call sites.
- **`src/utils/filesystem` (Fantastick's sharded local sticker-file storage)
  was deliberately NOT extracted.** It's currently sticker-specific
  (hardcoded extensions, `fs://` prefix) and there's only one real consumer
  (Fantastick, unmigrated). Extract it when Fantastick actually migrates, not
  before — don't guess at the generalized shape with zero validation.
- **Explicitly dropped, do not port forward:** PennyCurve's unused
  `BotCommandPermission` type (dead code, never implemented anywhere) and its
  unread `SUSPICIOUS_NAMES` env var.
- **`src/utils/messaging.ts`'s `getUserIdentifier` must handle Discord's
  username-migration accounts (`discriminator === '0'` → `@username`, not
  `username#0`).** The original extraction missed this — HammerTimeBot and
  Fantastick had each already independently patched their *local* copies of
  this function for it (via a `getUserFriendCode` helper) before either
  migrated onto this package, so the plain `username#discriminator` version
  that shipped here was a regression versus both source bots, not a
  simplification. `stringifyOptionsData`'s `User`-option branch depends on
  this being correct.
- **Commands/components/modals carry their own `name`/`id` field; the
  registry key is always the single source of truth for it.** Before the
  registry mechanism (`src/interactions/registry.ts`), every bot hand-wrote
  a `const enum` of names/ids plus a manually-synced `Record<Enum, T>`
  aggregator map — pure duplicated boilerplate the framework can own instead.
  `createChatInputCommandRegistry`/`createContextMenuCommandRegistry`/
  `createComponentRegistry`/`createModalRegistry` take a plain array of
  self-describing objects (`{ name, ... }` or `{ id, ... }`) and derive the
  literal name/id union straight from the array via TS 5 `const` type
  parameters — no hand-written enum needed, full typo/exhaustiveness safety
  preserved. `Registry.byName` is exactly the `Record<string, T>` shape
  `dispatch.ts`/`router.ts` already accepted, so those files needed **zero**
  changes for this or for the `commands.json` redesign below.
- **`getDefinition()` was removed entirely (semver-major) in favor of one
  `commands.json` file per bot as the single source of truth for a command's
  wire definition** (name, description, options, permissions) — no dual-path
  with the old per-command `getDefinition(t?)` function. `BotChatInputCommand`/
  `BotContextMenuCommand` (`src/interactions/types.ts`) are now pure handler
  shapes (`{ registerCondition?, handle, autocomplete?, modal? }`), with no
  `T`/definition-arg generic at all. The old design let a command's
  registered definition and its handler drift apart silently — nothing
  linked "the JSON Discord sees" to "the handler that runs" except both
  living in the same TS object; a bot could hand-edit one and forget the
  other. The `commands.json` file plus `buildApplicationCommandsBody`'s
  two-directional cross-check (below) makes that link a hard runtime check
  instead, at the cost of the old single-function convenience.
- **`commands.json` is a flat array mirroring Discord's bulk-overwrite PUT
  body exactly** (covering CHAT_INPUT/USER/MESSAGE in one array, matching how
  `createCommandRegistrar`'s `updateGlobalCommands`/`updateGuildCommands`
  already accept one flat array), validated by a JSON Schema **before** ever
  calling Discord's API. This package ships only the generic, reusable
  fragments (`src/commands/schema/*.schema.ts`, mirroring
  `discord-api-types`' command/option shapes) — it does not dictate one
  rigid schema for a bot's whole file. Each bot composes its own full
  `commands.schema.json` on top via `$ref`/`allOf` (e.g. narrowing `name` to
  an enum of its actual commands), calling `registerFrameworkSchemas(ajv)`
  first so those `$ref`s resolve. Base fragments use
  `additionalProperties: false` for strictness (matches every real bot's
  current usage — no source bot needs extra top-level per-command fields
  today); a bot needing a genuinely new top-level field per entry will need
  `unevaluatedProperties`-based composition instead of `allOf`, since
  `additionalProperties: false` only evaluates a schema's own declared
  properties, not fields declared on sibling `allOf` members — not built
  preemptively.
- **Discord's option nesting is modeled as three separate, non-recursive
  fragments (leaf option / subcommand / subcommand-group), not one
  self-referential schema.** Discord's real nesting is a fixed depth (at
  most subcommand-group → subcommand → leaf option), so this was never
  actually "recursive" — but a naive `application-command-option.schema.ts`
  that `$ref`'d itself hit `json-schema-to-ts`'s `FromSchema` circularly
  referencing itself (`TS2615`), confirmed via a throwaway spike before
  committing to the real schema shape. Unrolling the fixed depth into three
  flat fragments (`application-command-leaf-option`/`-subcommand`/
  `-subcommand-group`) sidesteps this entirely, since none of them actually
  self-reference. Each leaf-option branch is **flat** (no `allOf`-composed
  shared base with `name`/`description`) for a related reason: the same
  spike found that `additionalProperties: false` inside an `allOf` branch
  only evaluates *that branch's own* declared properties, so a `name` field
  declared on a sibling `allOf` member gets rejected as "additional" and the
  derived type collapses to `never` — every branch inlines its own
  `name`/`description`/`type`/`required` instead of sharing them via `allOf`.
- **JSON Schema fragments are authored as `.ts` modules (`as const`), not
  raw `.json` files, even though real `.json` mirrors are shipped and are
  what "generic schema, other tools can consume it" actually refers to.**
  Verified across every `module`/`moduleResolution` combination that
  TypeScript's `resolveJsonModule` always widens imported JSON string values
  to `string` (never to a literal like `"object"`) — this isn't a config bug,
  `json-schema-to-ts`'s `FromSchema` fundamentally cannot consume a real
  `.json` import for that reason. `scripts/generate-schema-json.mjs` runs
  after `tsc` in the `build` script, importing each compiled
  `*.schema.js` and writing a matching `*.schema.json` next to it — those
  generated files are the ones that ship in the npm package and that
  external non-TS tools reference by `$id`; the `.ts` files are the only
  hand-edited source, used for both ajv validation and `FromSchema` type
  derivation.
- **`CommandsFile` (the whole-file array type) is composed from the already-
  derived per-entry types (`readonly CommandFileEntry[]`) rather than a
  second `FromSchema<typeof commandsFileSchema, ...>` call.** Deriving the
  whole-array type by re-walking the same deeply-nested option `oneOf`
  structure one level up hit TS's type-instantiation depth limit (`TS2589:
  excessively deep`), even after trimming each `FromSchema` call's
  `references` array to the minimal transitive set each schema actually
  needs (which was still necessary and kept for the per-entry types).
  `commandsFileSchema` remains the runtime source of truth for ajv
  validation regardless — only its *type* derivation takes this shortcut.
- **`description` (command- and option-level) is optional in
  `commands.json`; `name` is not.** A description may be authored directly
  in the file, or resolved at submission time via
  `buildApplicationCommandsBody`'s `resolveDescription` hook (typically
  `createCommandLocalizer(...).resolveDescription`, keyed by i18next path).
  If a command/option still has no description after both are tried,
  `buildApplicationCommandsBody` throws — collecting every offender into one
  error, never sending an incomplete body to Discord's API. This is a
  two-pass validation split: `parseCommandsFile`'s ajv pass runs immediately
  after parsing and only checks structure (it can't know about descriptions
  that are legitimately pending i18n resolution); the description-
  completeness check runs later, inside `buildApplicationCommandsBody`,
  after the localize hook has had a chance to fill things in.
  `*_localizations` are never hand-authored in `commands.json` at all — only
  `resolveDescription` (a single fallback string) plus the separate
  `localizeNames`/`localizeDescriptions` hooks (dictionary-producing, one
  Discord field each) exist, deliberately three hooks rather than one
  combined object, since `description` and `*_localizations` are genuinely
  different Discord fields. **All three hooks apply at both the command
  level and, recursively, at every option level** (`localizeNames`/
  `localizeDescriptions` are called per-option too, not just once per
  command) — an initial implementation only called them at the command
  level, which a real full migration of Fantastick (see below) caught
  immediately: Fantastick's original `getCommonOptionMeta` localized every
  option's `name`/`description` individually, and losing that during the
  migration would have been a silent regression (options falling back to
  their raw English name/description in every non-default locale).
- **`buildApplicationCommandsBody`'s two-directional cross-check (a
  `commands.json` entry with no matching handler, or a handler with no
  matching `commands.json` entry) both throw, collected into the same
  combined error as the missing-description check.** Both are almost always
  authoring mistakes — a file entry with no handler means Discord would
  accept interactions for a command the bot can't actually handle
  (`dispatch.ts`'s "Unknown command" error, for real users, at runtime); a
  handler with no file entry can never be registered or reached at all.
  Deliberately strict, matching this repo's existing preference (see the
  required-options-first sort below) for catching bugs before Discord's API
  ever sees them, rather than surfacing a confusing rejection later.
  `buildApplicationCommandsBody` now iterates `commandsFile` to drive output
  order (not registry insertion order), since the file — not import order of
  handler modules — is the thing a bot author actually controls the
  ordering of.
- **`createCommandLocalizer` (`src/i18n/create-command-localizer.ts`)
  generalizes Fantastick's bespoke `getLocalizedObject`/`getCommonOptionMeta`
  helpers into a framework-owned utility**, replacing the need for every bot
  to hand-roll its own i18next-to-Discord-localization glue. Its three
  methods (`resolveDescription`/`localizeName`/`localizeDescription`) take
  the exact same dot-path-shaped key array
  `buildApplicationCommandsBody` builds internally, so they can be passed
  straight through as its three hook options with zero glue code.
  Missing-key detection relies on i18next echoing the lookup key back
  unchanged when no translation exists (no `returnNull`/
  `parseMissingKeyHandler` configured) — the only signal available with a
  plain `TFunction`. Each lookup explicitly passes `fallbackLng: false`;
  without it, a bot's own configured i18next fallback chain would silently
  fill in every locale from the fallback language, and
  `localizeName`/`localizeDescription` could never produce a genuinely
  sparse per-locale dictionary (fallback-filled text isn't wrong to send,
  but it defeats "only emit a locale entry when that locale has its own
  translation").
  Nested-option localization key path convention (one level, for options
  nested under a subcommand:
  `commands.<name>.options.<subcommandName>.options.<optionName>.description`)
  has no real-world precedent — Fantastick has no subcommands today — so
  treat it as provisional until validated against a bot that actually uses
  subcommands.
- **Always `import { Ajv } from 'ajv'` (named import), never `import Ajv from
  'ajv'` (default import), anywhere in this package or its docs.** Ajv's
  `.d.ts` declares a genuine ESM `export default Ajv`, but under this
  package's `moduleResolution: NodeNext` + `esModuleInterop: true`, a
  default-import value use of a CJS package (ajv ships as CJS at runtime
  despite its ESM-shaped types) type-checks as `typeof import(...)` — the
  whole module namespace, not the class — and fails with `TS2351: This
  expression is not constructable.` `Ajv` is also exported as a **named**
  export (`export declare class Ajv extends AjvCore`), which sidesteps the
  interop ambiguity entirely and is what actually compiles. This was missed
  initially because `tsconfig.json` excludes `*.test.ts` from `tsc`, so the
  bug sat undetected in `parse-commands-file.test.ts`/`compose-example.test.ts`
  (only ever run through Vitest's more lenient transform) until real usage
  in a full Fantastick migration (a plain production `.ts` file, not a test)
  hit it under actual `tsc --noEmit`.
- **The `commands.json` redesign was validated with a full, real migration
  of Fantastick** (not just this package's own unit tests) before being
  committed here — every one of Fantastick's 16 chat-input + 2 context-menu
  commands was converted to `commands.json` + a composed schema, wired
  through `createCommandLocalizer` against Fantastick's real i18next locale
  files, and proven end-to-end with a runtime test asserting the exact
  resolved English/Hungarian text and localizations dictionaries — not just
  that it type-checks. This is what caught both the ajv named-import bug and
  the missing option-level localization bug above; both were fixed here
  before Fantastick's migration branch was finalized. Fantastick's original
  code aliased `nsfw-sticker`/`nsfw-pack`'s option translations onto
  `sticker`/`pack`'s i18next keys (via a hardcoded command-name argument to
  `getCommonOptionMeta`, regardless of which command was actually being
  built) — the new per-entry path convention has no equivalent aliasing
  mechanism, so the migration added `nsfw-sticker`/`nsfw-pack` their own
  `options` keys (copied from `sticker`/`pack`) to Fantastick's locale files
  rather than the framework growing an aliasing feature for what was, on
  inspection, an isolated case of two commands sharing an identical options
  shape.
- **`commands.json`'s numeric `type`/`contexts`/`integration_types`/
  `channel_types` values also accept UPPER_SNAKE_CASE string aliases (e.g.
  `"STRING"` instead of `3`), added as a semver-**minor** (`feat:`), not a
  breaking change.** This was deliberately additive rather than a
  replacement, specifically so the already-shipped `2.0.0` `commands.json`
  format (and Fantastick's in-flight migration PR, all numeric) stays valid
  forever — both forms, and any mix of the two within the same file, are
  permanently supported. `src/commands/schema/enum-maps.ts` holds the five
  string->number maps (`APPLICATION_COMMAND_TYPE_MAP`,
  `APPLICATION_COMMAND_OPTION_TYPE_MAP`, `INTERACTION_CONTEXT_TYPE_MAP`,
  `APPLICATION_INTEGRATION_TYPE_MAP`, `CHANNEL_TYPE_MAP`) plus a
  `resolveEnumValue(map, value)` helper; every map's numeric values are
  sourced by importing the real `discord-api-types` enums (`ApplicationCommandType.ChatInput`
  etc.), never hand-typed numbers, so they can't drift from the real
  values. **The transform happens in exactly one place: inside
  `buildApplicationCommandsBody`, right before each command/option is
  written into the final `RESTPostAPIApplicationCommandsJSONBody`** — not in
  `parseCommandsFile`, not in the schema/type layer. Everything upstream of
  that point (the JSON Schema fragments' `enum`s, the `FromSchema`-derived
  types, `buildApplicationCommandsBody`'s own cross-check/discrimination
  logic) has to treat `type` as the union of both forms throughout — see
  `isChatInputType()` — precisely so the string form is a real first-class
  citizen of the format, not a superficial JSON-authoring convenience
  papered over a numeric-only internal model. Every schema `const: N` for a
  type field became `enum: [N, 'NAME']` (not `oneOf`/`anyOf` — a flat mixed
  `enum` is simpler and `json-schema-to-ts` resolves it to the same
  `N | 'NAME'` union either way).
- **`commandsFileSchema` accepts a second root shape, `{ $schema?, commands
  }`, alongside the original bare array — also additive, semver-minor.** A
  bare JSON array can never carry an inline `$schema` property (`$schema` is
  only ever valid on a JSON *object*), so a bot hand-editing a bare-array
  `commands.json` gets zero editor autocomplete/validation — there's no way
  to point an editor (VS Code, JetBrains, ...) at the right schema from
  inside the file itself. Wrapping the array as `{ "$schema":
  "./commands.schema.json", "commands": [...] }` fixes this with no editor
  config needed, since `$schema` accepts a relative file path, not just a
  resolvable URL. `command-file-entry.schema.ts` (new) promotes "one
  chat-input-or-context-menu entry" — previously inlined directly inside
  `commandsFileSchema`'s `items` — to its own named fragment with its own
  `$id`, specifically so both root-shape branches (and a bot's own composed
  schema) can `$ref` one single source of truth for "what is one entry"
  instead of duplicating it. `getCommandsFileEntries()` (new,
  `src/commands/schema/index.ts`) normalizes either root shape down to the
  flat entries array; `buildApplicationCommandsBody` calls it as its very
  first step so every downstream line of that function is unchanged and
  unaware which shape was used. **A bot's own `commands.schema.json` cannot
  reuse a framework-provided TS composition helper for this** — it's
  authored as plain JSON specifically so external tools can consume it too,
  not routed through this package's `.ts` fragment-composition machinery —
  so combining bot-specific narrowing (e.g. a `name` enum) with support for
  both root shapes uses a local `$defs` entry referenced from both branches
  (see the README's recipe and `compose-example.test.ts`'s second
  `describe` block), not a function call. The bare-array form isn't
  deprecated and never will be; this is a second supported shape, not a
  replacement.
- **A bot's own `commands.schema.json` `$ref`s this package's fragments by a
  real relative filesystem path into `node_modules`
  (`"../node_modules/@went.tf/discord-bot-framework/build/commands/schema/chat-input-command.json"`),
  not the fragments' own `$id` (an opaque `https://schema.went.tf/...`
  string, never meant to be fetched) — but ajv never sees that relative path
  directly.** Only a real path is something an editor (VS Code, JetBrains,
  ...) can actually follow to offer autocomplete/validation while
  hand-editing `commands.schema.json` — the `$id` form either fails silently
  or makes an unwanted network request to a domain serving nothing at that
  path. **Two solid implementation attempts at making ajv resolve that same
  relative path directly both failed, for real, non-dev-environment
  reasons — this is why `resolveCommandsSchemaRefs()` exists instead:**
  1. Registering fragments under a bare relative-path *string* alias (no
     URI resolution) doesn't work: confirmed via a throwaway test that ajv
     resolves relative `$ref`s through real RFC3986 URI resolution against
     the referencing schema's own `$id`/base (like a browser resolving a
     relative link against the current page's URL), never by matching the
     literal `$ref` string against a registry key.
  2. Registering fragments under their real `file://` location (computed
     from `import.meta.url`) and requiring the bot's own schema to set its
     `$id` to *its own* real `file://` location doesn't work either, and
     this one isn't a dev-environment quirk: **pnpm always symlinks
     packages from its `.pnpm` virtual store into `node_modules`**, and
     Node's ESM loader resolves `import.meta.url` through that symlink to
     the real store path (e.g. `.pnpm/@went.tf+discord-bot-framework@x.y.z/node_modules/...`) —
     a path a bot's own relative `$ref`, correctly resolved against its own
     unrelated real location, can never independently compute to match.
     Confirmed by literally running the resulting code in a real (non-Vitest)
     Node process against a `pnpm link`-installed copy and observing the
     exact mismatched paths in ajv's `MissingRefError`.

  **The actual fix: `resolveCommandsSchemaRefs(schema)` deep-walks a bot's
  raw parsed schema and rewrites any `$ref` whose *filename* (last path
  segment) matches a shipped fragment to that fragment's canonical `$id`,
  regardless of what relative-path prefix was used to reach it.** This
  sidesteps ajv's own filesystem/URI resolution for the framework's
  fragments entirely — no `$id`-setting requirement on the bot's own schema,
  no dependency on pnpm's node_modules layout being resolvable at all — while
  the raw JSON file itself stays untouched (still real relative paths, for
  the editor). Local refs (`#/$defs/...`) aren't fragment filenames, so
  they're left alone. Call it on the raw parsed schema before
  `ajv.compile()`, after `registerFrameworkSchemas(ajv)` (which now only
  registers the canonical `$id`, unchanged from before either of the two
  broken attempts above). Regression-tested in `compose-example.test.ts`'s
  third `describe` block, including two different relative-path prefixes
  resolving to the same fragment and a local `$defs` ref staying untouched.
- **Modal dispatch stays a thin adapter, not a first-class registry
  concept**, because Fantastick's real shape nests a `.modal: Record<ModalId,
  ModalHandler<Ctx>>` map on the *owning chat-input command* rather than
  registering modals as a standalone top-level map. `flattenCommandModals`
  synthesizes a flat `Registry<string, BotModal<Ctx>>` view over every
  command's nested `.modal` map so the existing `dispatchModal` (unchanged)
  can consume it directly — don't add modal-specific branching to
  `dispatch.ts` itself.
- **`src/dev/create-handler-watcher.ts` is a thin generic file-watching
  primitive, not a reload-and-merge framework.** `createHandlerWatcher` only
  watches paths, debounces/coalesces fs events per file (default 250ms,
  `Map<string, Timeout>` keyed by resolved path), invokes your `onChange`
  callback, and catches/logs anything it throws so a bad reload can never
  crash the process. It deliberately does *not* know how to re-`import()` a
  module, derive a registry key from a file path, or write into
  `registry.byName` — that stays bot-side (shown only as a README recipe),
  mirroring why `flattenCommandModals`/component registries stay thin
  adapters instead of forcing one shape onto genuinely different bot layouts.
  This is only possible at all because `dispatch.ts`'s `dispatch*` functions
  and `createInteractionRouter` already do a **live** `registry.byName[key]`
  property lookup on every interaction, with no closure-caching — mutating a
  registry's `byName` entry in place is picked up on the very next
  interaction, no additional wiring needed. Built on native
  `fs.watch(dir, { recursive: true })`, not chokidar or any other watcher
  dependency — Node 24 (this package's floor) has had stable cross-platform
  recursive watch support since Node 20.4, and the repo's standing preference
  is to avoid a new dependency when a native API suffices (same reasoning as
  the homegrown Discord-webhook pino transport). **The
  registration/full-restart boundary is permanent and deliberate, not a TODO
  to close later**: conflating hot-reload with Discord command registration
  would mean either polling Discord's API on every file change or maintaining
  a shadow model of "what's currently registered" — both unnecessary
  complexity for a dev-only convenience feature. A command's `getDefinition()`
  (name/description/options schema) changing, or a brand-new command file not
  already present in the registry at process startup, always needs
  `createCommandRegistrar` plus a restart — `createHandlerWatcher` never tries
  to cover either case. **`./dev` is excluded from root `src/index.ts` for a
  different reason than `./db`/`./i18n`**: those two are peer-dependency-gated
  (bots without Postgres/i18next shouldn't need the peer deps installed);
  `./dev` has no peer dependencies at all; it's excluded purely because
  dev-only tooling shouldn't leak into every consumer's root import surface.
  Don't conflate the two exclusions as the same rationale.
- **`src/dev/create-source-reloader.ts` exists because `createHandlerWatcher`'s
  README recipe (cache-bust and re-import *the one changed file*) has a real
  gap: it never picks up changes to a file that changed file merely
  `import`s.** Node's ESM cache keys on resolved URL; giving the changed file
  a fresh `?t=` URL doesn't change how *its own* `import './util.js'`
  resolves, so nested imports keep returning whatever was cached at process
  start. `createSourceReloader` fixes this generally via a
  `module.register()` hook (`src/dev/reload-loader.ts`, loaded by
  file-existence-checked path — `./reload-loader.js` if `build/` exists,
  falling back to the `.ts` sibling so this package's own tests/dev running
  straight against `src/` still work, relying on Node 24's native
  type-stripping since there's no bundler in the loop there) that tags every
  module resolved under a caller-supplied `rootDir` with a shared epoch
  (`SharedArrayBuffer` + `Atomics`, since `module.register()` hooks run in
  Node's own dedicated loader thread/realm — plain module-level state on the
  main thread would not be visible there). Bumping the epoch before each
  `reimport()` forces every module under `rootDir` — not just the one passed
  to `reimport()` — to be treated as new, while anything resolved *outside*
  `rootDir` is left on Node's normal cache untouched. That outside/inside
  split is the entire safety property for a Discord bot: as long as the
  gateway client and DB pool are constructed (and only ever imported) outside
  `rootDir`, a reload can never reconnect or reopen them — verified in
  `create-source-reloader.test.ts` by asserting an outside-root module's
  export identity is unchanged across three reloads while an inside-root
  change *does* propagate. **That test shells out to a real `node` child
  process** rather than calling `createSourceReloader` in-process — Vitest
  runs test files through its own vite-node module transform/cache, which
  does not go through Node's native ESM loader pipeline at all, so
  `module.register()` hooks are silently never invoked for dynamic imports
  triggered from inside a Vitest test. This isn't a workaround to remove
  later; it's the only way to exercise a loader-hook-based mechanism under
  this test runner. `SourceReloaderOptions.logger` is imported as `import
  type` (not a plain value import) specifically so Node's native type
  stripping — used by that same fallback-to-`.ts` path — can erase it without
  needing to resolve `../logger/index.js`, which doesn't exist as `.js` until
  `build/` runs; a plain value import of a type-only binding silently breaks
  that fallback since the stripper only erases syntactically-unambiguous
  erasable syntax (`import type`, type annotations), not value imports it
  can't prove are unused without full type-checking.
- **`src/logger/` is backed by pino, not raw `console.*`**, chosen over winston for
  wider adoption and because pino's `.child()`/transport-worker model maps cleanly
  onto this module's existing `nest()` semantics. Discord-webhook log delivery is a
  **homegrown pino transport** (`src/logger/discord-webhook-transport.ts`, built on
  the official `pino-abstract-transport` primitive + native `fetch`), not a
  third-party `pino-discord-*`/`winston-discord-*` package — the ones that exist were
  checked and are either stale or pull in a full `discord.js`/`discord-api-types`
  dependency just to POST a webhook, not worth it for something this small.
  `src/logger/discord-webhook-batcher.ts` batches log records on a **fixed interval**
  (default 20s) rather than POSTing per log call — this gives a hard, by-construction
  cap on request volume safely under Discord's per-webhook rate limits without a
  separate token-bucket, at the cost of up to `batchIntervalMs` of delivery latency
  (acceptable for a logging sink, not for anything latency-sensitive).
  `pino`/`pino-pretty`/`pino-abstract-transport` are core `dependencies` (not
  peer, unlike `./db`/`./i18n`'s optional pieces) since `./logger` is always
  re-exported from the package root and `pino-pretty` is needed by default just to
  keep the console output close to this module's original bracket-prefixed look.
- **`Logger` (plain `new Logger(prefix)`/`Logger.fromShardInfo`) and `createLogger(options)`
  are two different entry points, mirroring the `createPostgresPrismaDb`/
  `createBotClient` factory pattern.** `new Logger()` builds a bare, synchronous pino
  root (pino-pretty's stream passed directly, no `pino.transport()`) — no worker
  thread, console-only. `createLogger()` is the **only** place `pino.transport()` is
  ever invoked, building one root pino instance with whichever targets (console +
  optional Discord webhook) were requested. **`nest()`/`muteMethods()` always reuse
  the existing instance's `.child()`** (via `Logger.withPino`, internal) rather than
  constructing a new pino root — constructing a new root per `nest()` call would leak
  a new transport worker thread every time a bot nests a logger (e.g. per-interaction
  in `dispatch.ts`), which happens constantly. Each `.child()` call binds a single
  pre-formatted `prefixLabel` string (not a raw prefix array), keeping pino-pretty's
  `messageFormat` a plain, worker-serializable string template
  (`'{prefixLabel}{msg}'`) instead of a function.
- **`LogMethod`'s `'log'` maps onto pino's `info` level** — pino has no native `log`
  level, and `log`/`info` were visually indistinguishable in the pre-pino console
  output anyway. **`muteMethods()` stays a wrapper-side `Set<LogMethod>` check**
  performed before ever touching the underlying pino instance, not implemented via
  pino's own numeric `level` threshold — pino has one threshold, not an arbitrary
  per-method mute set, so this couldn't be expressed as native pino config.
- **Component registries only require `{ id, handle }`** — they deliberately
  do **not** standardize a `getDefinition`/`factory` shape for building the
  component's wire representation, because HammerTimeBot/Fantastick's
  `getDefinition(t, emojiIdMap, idSuffix?)` and PennyCurve's `factory()` are
  genuinely different shapes, and components (unlike commands) are never
  pre-registered with Discord, so there's no shared "flatten to JSON" need
  driving unification. Bots keep whatever extra field they want alongside
  `id`/`handle`.
- **`RegistryName<R>`** (`src/interactions/registry.ts`) extracts the literal
  name/id union a `create*Registry()` call already inferred from its input
  array (`R extends Registry<infer Name, unknown> ? Name : never`), so a bot
  that needs that union elsewhere (a locale-file type, a command-mention
  helper, ...) derives it from the registry instead of hand-writing a
  parallel `const enum CommandName { ... }`. This was added after Fantastick
  did exactly that during its `commands.json` migration — a
  `BotChatInputCommandName`/`BotMessageContextMenuCommandName` const enum,
  hand-mirroring the same name list already present in both `commands.json`
  and each command file's own `name` field, i.e. a third definition site for
  something `createChatInputCommandRegistry`'s `const` type param already
  derives for free. The README's `./interactions` section calls this out
  explicitly (not just documented here) specifically so it doesn't recur:
  a command/component name should only ever be *defined* in `commands.json`
  and its own registry object's `name`/`id` field; everywhere else should
  reference one of those two, or `RegistryName<typeof registry>`'s derived
  type, never re-declare the list.
- **`RegistryName<R>` only actually returns a literal union if every command
  object's `name` is *already* a literal type by the time it reaches
  `create*Registry()` — this is not automatic and caused real confusion
  during Fantastick's migration, worth re-stating so it isn't re-debugged.**
  A plain, unannotated `const pingCommand = { name: 'ping', handle: ... };`
  widens `name` to `string` at that declaration (ordinary TS object-literal-
  property widening — the same reason `const x = { n: 1 }; x.n` is `number`,
  not `1`), *before* the object ever reaches the registry call; wrapping it
  in `satisfies BotChatInputCommand` does not fix this, since `satisfies`
  only checks compatibility against the target type, it doesn't request a
  literal the way a type annotation naming an exact literal does. Confirmed
  via `const x: T = 'not-a-real-value'` compiling with no error when `T` was
  wrongly assumed to be a `RegistryName`-derived literal union but the
  underlying command objects weren't annotated — the only real signal, since
  `const y: T = 0 as never` (the first, wrong instinct) always "passes"
  regardless of what `T` actually is, `never` being assignable to everything.
  The fix, and the pattern this package's own `registry.test.ts` already
  uses, is pinning each command's name as an explicit generic argument at
  its declaration site: `const pingCommand: NamedChatInputCommand<Ctx,
  'ping'> = { name: 'ping', handle: ... };` (or the object literal passed
  directly inline into the `create*Registry()` array argument, which *does*
  infer literally on its own via the `const` type parameter modifier — but
  that's rarely how bots structure things once each command has its own
  file). The README's `RegistryName` example was originally written with the
  unannotated form and was itself silently wrong until this was caught.

## Module → source mapping

| Framework module | Ported from |
|---|---|
| `src/logger/` | `HammerTimeBot/src/classes/logger.ts`, `Fantastick/src/classes/logger.ts` (near-identical); rewritten onto pino, `NestableLogger` contract unchanged |
| `src/env/` | Pattern generalized from all three bots' `src/env.ts` |
| `src/api-client/` | `Fantastick/src/classes/api-client.ts` (most generic of the three; supersedes HammerTimeBot's `backend-api-request.ts`) |
| `src/interactions/handle-interaction-error.ts` | Near-identical logic in all three bots' `handle-interaction-error.ts` |
| `src/interactions/dispatch.ts`, `router.ts` | Generalized from HammerTimeBot/Fantastick's `interaction-handlers/handle-*.ts` + PennyCurve's `interaction-handlers.ts` |
| `src/commands/registration.ts` | `HammerTimeBot/src/utils/update-guild-commands.ts` |
| `src/commands/fixed-reply-command-factory.ts` | `PennyCurve/src/utils/fixed-reply-command-factory.ts` |
| `src/interactions/registry.ts` | Generalized from all three bots' hand-written `const enum` + `Record<Enum, T>` aggregator map pattern |
| `src/commands/build-application-commands-body.ts` | `HammerTimeBot/src/utils/get-application-commands.ts`; reworked to consume a validated `commands.json` array + handler registries instead of each command's own `getDefinition()` |
| `src/commands/schema/` | New for this package, no direct bot precedent (none of the three source bots had a JSON-Schema-validated commands file) |
| `src/i18n/create-command-localizer.ts` | Generalized from `Fantastick/src/utils/get-localized-object.ts` + `get-common-option-meta.ts` |
| `src/client/create-bot-client.ts` | `PennyCurve/src/create-client.ts` (unsharded shape) |
| `src/client/create-shard-manager.ts` | `HammerTimeBot/src/index.ts` + `Fantastick/src/index.ts` (near-identical `ShardingManager` setup) |
| `src/utils/run-attempts.ts` | `Fantastick/src/utils/run-attempts.ts` (verbatim) |
| `src/utils/get-git-data.ts` | `Fantastick`/`PennyCurve`'s near-identical git-hash helper |
| `src/utils/discord-lookups.ts`, `messaging.ts`, `promises.ts`, `strings.ts` | `PennyCurve/src/utils/client-utils.ts` + `messaging.ts` + `promises.ts` + `strings.ts` |
| `src/db/create-postgres-prisma-db.ts` | `Fantastick/src/utils/create-db.ts` + `prisma.config.ts` pattern |
| `src/i18n/create-i18n-initializer.ts` | `HammerTimeBot/src/constants/locales.ts` `initI18next` |
| `src/dev/create-handler-watcher.ts` | New for this package, no direct bot precedent (none of the three source bots had hot-reload) |
| `src/dev/create-source-reloader.ts`, `reload-loader.ts` | New for this package; built for Fantastick's `DEV_WATCH` mode after `createHandlerWatcher`'s single-file reload missed changes to shared modal-handler/util files |

## Conventions

- ESM throughout (`"type": "module"`), `NodeNext` module resolution — every
  relative import needs an explicit `.js` extension, even though the source
  is `.ts` (matches all three source bots).
  Node 24, pnpm (`pnpm-workspace.yaml` mirrors HammerTimeBot's settings).
- Tests are colocated `*.test.ts` files next to source (Vitest), matching
  HammerTimeBot/Fantastick's convention. No jsdom — this package has no
  DOM-touching code.
- `tsconfig.json` has `declaration: true` (unlike the source bots' app-only
  configs) since this is a published library — every module needs to ship
  usable `.d.ts` files.
- No `ts-patch`/typia transform plugin — typia stays fully consumer-side (see
  above).

## Commits & releases

- **Every commit that changes public behavior, adds/removes an export, or
  changes a non-obvious design decision must update `README.md` and/or
  `CLAUDE.md` in the same commit**, whichever is relevant to what changed —
  new subpath usage goes in `README.md`, new "don't relitigate this" design
  rationale goes in `CLAUDE.md`'s design-decisions/module-mapping sections.
  Docs are treated as part of the change, not a follow-up.
- **Every commit message must follow Conventional Commits**
  (`feat:`, `fix:`, `feat!:`/`BREAKING CHANGE:`, `chore:`, `docs:`, `refactor:`,
  `test:`, `ci:`, `build:`, `perf:`, `style:`). This is enforced by a husky
  `commit-msg` hook (`commitlint`, config in `commitlint.config.mjs`) locally,
  by `.github/workflows/commitlint.yml` on pull requests, and by a
  `commitlint` job inside `.github/workflows/release.yml` itself (the
  `release` job has `needs: commitlint`) — so a push to `main` containing a
  non-conforming commit message (e.g. from a hook bypassed with `--no-verify`,
  or a squash-merge with a bad title) fails before `semantic-release` ever
  runs, instead of racing it. Don't drop that `needs:` dependency or split
  commitlint back into a same-triggers-but-unlinked workflow — two workflows
  that both trigger on `push: [main]` run in parallel with no ordering
  guarantee between them.
- **If the correct commit type/bump for a change is ambiguous, ask the user
  before committing** rather than guessing. This repo publishes automatically
  on every push to `main` (see below) — a wrong `feat:`/`fix:` vs `chore:`
  call isn't a cosmetic mistake, it changes what actually gets published to
  npm and how the version number moves.
- **Every push to `main` triggers an automatic release**
  (`.github/workflows/release.yml`, via `semantic-release`, config in
  `.releaserc.json`): the commit types since the last release determine the
  version bump (`fix:` → patch, `feat:` → minor, `feat!:`/`BREAKING CHANGE:`
  → major, other types → no release), `CHANGELOG.md` is generated, the
  package is published to npm, and a GitHub Release is cut. There is no
  manual tag-pushing step anymore — do not hand-edit `package.json`'s
  `version` field, semantic-release owns it.
- **npm auth uses Trusted Publishing (OIDC), not a stored `NPM_TOKEN`
  secret.** npmjs.com is configured to trust the `Release` workflow
  (org/repo/workflow-filename match, no GitHub Actions `environment`
  configured) via the `id-token: write` permission in
  `.github/workflows/release.yml`. Don't add `registry-url` to the
  `actions/setup-node` step in that workflow — it makes `setup-node` write an
  `.npmrc` that conflicts with semantic-release's OIDC auth and breaks
  publishing (`EINVALIDNPMTOKEN`). Provenance attestation is automatic under
  trusted publishing, no `--provenance`/`provenance: true` config needed.

## When migrating Fantastick or PennyCurve onto this framework

Read the migration plan this repo was built from — it's in the git history
of `HammerTimeBot`'s Claude Code plan file, but the short version:

- Fantastick will exercise `./db` for the first time — expect
  `createPostgresPrismaDb`'s single-function surface to need real validation,
  and its `ApiClient` construction call sites need the `keyof typeof env` →
  `getValue: () => string` change described above.
- Fantastick's `src/utils/filesystem.ts` sticker storage should be extracted
  *then*, generalized against Fantastick's real usage, not guessed at now.
- PennyCurve will exercise `createBotClient` (unsharded) for the first time
  in practice (HammerTimeBot/Fantastick both shard) and is the only bot that
  wants `handleInteractionError`'s `onUnexpectedError` hook.
- Both will need their own `env.ts` rewritten onto `defineEnv` — check for
  vestigial/unused env keys while doing so (PennyCurve has at least one:
  `SUSPICIOUS_NAMES`) rather than porting them forward silently.
- Fantastick has already been fully migrated onto the `commands.json`
  redesign, on a `feat/commands-json-migration` branch in its own repo
  (uncommitted to `main` there as of this writing — a validation/prep branch,
  not yet a real PR, since it depends on this package's unreleased major
  version) — this is what the JSON-Schema-fragment composition model,
  `createCommandLocalizer`, and the two-directional cross-check were
  actually validated against, not just this package's own unit tests. What
  it did **not** end up validating: Fantastick's option-metadata fragments
  (`min_length`/`max_length` constants shared between a slash-command option
  and its modal's `TextInput` component) turned out to be a non-issue for
  the JSON-Schema fragment/`$def` composition story specifically, because
  `commands.json` is plain data, not a place any of Fantastick's own code
  needed a `$def`-level share — the existing `src/options/metadata/*.ts` TS
  constants already served double duty (both the raw numbers copied into
  `commands.json` by hand and the modal's `TextInput` min/max) with no
  framework involvement needed. If a future bot's schema *composition*
  itself (not just the underlying numbers) needs to share a fragment across
  multiple option definitions, that's still unvalidated.
