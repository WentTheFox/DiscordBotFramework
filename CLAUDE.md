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

## Module → source mapping

| Framework module | Ported from |
|---|---|
| `src/logger/` | `HammerTimeBot/src/classes/logger.ts`, `Fantastick/src/classes/logger.ts` (near-identical) |
| `src/env/` | Pattern generalized from all three bots' `src/env.ts` |
| `src/api-client/` | `Fantastick/src/classes/api-client.ts` (most generic of the three; supersedes HammerTimeBot's `backend-api-request.ts`) |
| `src/interactions/handle-interaction-error.ts` | Near-identical logic in all three bots' `handle-interaction-error.ts` |
| `src/interactions/dispatch.ts`, `router.ts` | Generalized from HammerTimeBot/Fantastick's `interaction-handlers/handle-*.ts` + PennyCurve's `interaction-handlers.ts` |
| `src/commands/registration.ts` | `HammerTimeBot/src/utils/update-guild-commands.ts` |
| `src/commands/fixed-reply-command-factory.ts` | `PennyCurve/src/utils/fixed-reply-command-factory.ts` |
| `src/client/create-bot-client.ts` | `PennyCurve/src/create-client.ts` (unsharded shape) |
| `src/client/create-shard-manager.ts` | `HammerTimeBot/src/index.ts` + `Fantastick/src/index.ts` (near-identical `ShardingManager` setup) |
| `src/utils/run-attempts.ts` | `Fantastick/src/utils/run-attempts.ts` (verbatim) |
| `src/utils/get-git-data.ts` | `Fantastick`/`PennyCurve`'s near-identical git-hash helper |
| `src/utils/discord-lookups.ts`, `messaging.ts`, `promises.ts`, `strings.ts` | `PennyCurve/src/utils/client-utils.ts` + `messaging.ts` + `promises.ts` + `strings.ts` |
| `src/db/create-postgres-prisma-db.ts` | `Fantastick/src/utils/create-db.ts` + `prisma.config.ts` pattern |
| `src/i18n/create-i18n-initializer.ts` | `HammerTimeBot/src/constants/locales.ts` `initI18next` |

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

- **Every commit message must follow Conventional Commits**
  (`feat:`, `fix:`, `feat!:`/`BREAKING CHANGE:`, `chore:`, `docs:`, `refactor:`,
  `test:`, `ci:`, `build:`, `perf:`, `style:`). This is enforced by a husky
  `commit-msg` hook (`commitlint`, config in `commitlint.config.mjs`) and again
  in CI (`.github/workflows/commitlint.yml`) — a commit that doesn't declare a
  type will be rejected locally and fail CI if it somehow lands on a branch.
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
