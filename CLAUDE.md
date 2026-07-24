# DiscordBotFramework

## What this repo is

`@wentthefox-org/discord-bot-framework` — a single publishable npm package
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
  changes for this. `buildApplicationCommandsBody`
  (`src/commands/build-application-commands-body.ts`) is the matching piece
  for command *registration*: it flattens one or more registries into the
  flat JSON body `createCommandRegistrar` expects, always overwrites
  `getDefinition()`'s own `name` with the registry key (registry wins, not
  `getDefinition`), and auto-applies a stable required-options-first sort
  (recursing into subcommand/subcommand-group options) rather than throwing
  if a bot got the ordering wrong — Discord's own rejection in that case is
  ambiguous, so silently fixing it is strictly better than surfacing a
  confusing API error.
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
| `src/commands/build-application-commands-body.ts` | `HammerTimeBot/src/utils/get-application-commands.ts` |
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
