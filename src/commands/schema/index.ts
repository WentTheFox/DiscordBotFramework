import type { Ajv } from 'ajv';
import type { FromSchema } from 'json-schema-to-ts';
import { applicationCommandLeafOptionSchema } from './application-command-leaf-option.schema.js';
import { applicationCommandOptionChoiceSchema } from './application-command-option-choice.schema.js';
import { applicationCommandOptionSchema } from './application-command-option.schema.js';
import { applicationCommandSubcommandGroupSchema } from './application-command-subcommand-group.schema.js';
import { applicationCommandSubcommandSchema } from './application-command-subcommand.schema.js';
import { applicationCommandTypeSchema } from './application-command-type.schema.js';
import { applicationIntegrationTypeSchema } from './application-integration-type.schema.js';
import { channelTypeSchema } from './channel-type.schema.js';
import { chatInputCommandSchema } from './chat-input-command.schema.js';
import { commandFileEntrySchema } from './command-file-entry.schema.js';
import { commandsFileSchema } from './commands-file.schema.js';
import { contextMenuCommandSchema } from './context-menu-command.schema.js';
import { contextMenuNameSchema } from './context-menu-name.schema.js';
import { defaultMemberPermissionsSchema } from './default-member-permissions.schema.js';
import { interactionContextTypeSchema } from './interaction-context-type.schema.js';
import { optionNameSchema } from './option-name.schema.js';

export { parseCommandsFile } from './parse-commands-file.js';
export type { ParseCommandsFileOptions } from './parse-commands-file.js';

export {
  APPLICATION_COMMAND_TYPE_MAP,
  APPLICATION_COMMAND_OPTION_TYPE_MAP,
  INTERACTION_CONTEXT_TYPE_MAP,
  APPLICATION_INTEGRATION_TYPE_MAP,
  CHANNEL_TYPE_MAP,
  resolveEnumValue,
} from './enum-maps.js';

export {
  applicationCommandTypeSchema,
  interactionContextTypeSchema,
  applicationIntegrationTypeSchema,
  channelTypeSchema,
  optionNameSchema,
  contextMenuNameSchema,
  applicationCommandOptionChoiceSchema,
  defaultMemberPermissionsSchema,
  applicationCommandLeafOptionSchema,
  applicationCommandSubcommandSchema,
  applicationCommandSubcommandGroupSchema,
  applicationCommandOptionSchema,
  chatInputCommandSchema,
  contextMenuCommandSchema,
  commandFileEntrySchema,
  commandsFileSchema,
};

/** Every fragment this package ships, in an order safe to `ajv.addSchema()` sequentially. */
const frameworkSchemas = [
  applicationCommandTypeSchema,
  interactionContextTypeSchema,
  applicationIntegrationTypeSchema,
  channelTypeSchema,
  optionNameSchema,
  contextMenuNameSchema,
  applicationCommandOptionChoiceSchema,
  defaultMemberPermissionsSchema,
  applicationCommandLeafOptionSchema,
  applicationCommandSubcommandSchema,
  applicationCommandSubcommandGroupSchema,
  applicationCommandOptionSchema,
  chatInputCommandSchema,
  contextMenuCommandSchema,
  commandFileEntrySchema,
  commandsFileSchema,
] as const;

const fragmentIdByFileName = new Map(frameworkSchemas.map((s) => [s.$id.split('/').pop() as string, s.$id]));

/**
 * Rewrites a bot's own composed commands.schema.json, replacing any `$ref`
 * that points at one of this package's fragments by a relative filesystem
 * path (e.g. `"../node_modules/@went.tf/discord-bot-framework/build/commands/schema/chat-input-command.json"` -
 * the form an editor can resolve for autocomplete) with that fragment's
 * canonical `$id` (the form `registerFrameworkSchemas` registers, which ajv
 * can actually resolve). Matched by filename alone, so it works regardless
 * of how deep your own commands.schema.json sits relative to `node_modules`
 * - you never need to get the exact `../` count "right" for ajv's sake, only
 * for the editor's. `$ref`s that don't match a known fragment filename (e.g.
 * your own `#/$defs/...` refs) are left untouched.
 *
 * Call this on the raw parsed schema before `ajv.compile()`, after
 * `registerFrameworkSchemas(ajv)`:
 *
 * ```ts
 * import myCommandsSchemaRaw from './commands.schema.json' with { type: 'json' };
 * const myCommandsSchema = resolveCommandsSchemaRefs(myCommandsSchemaRaw);
 * registerFrameworkSchemas(ajv);
 * const validate = ajv.compile(myCommandsSchema);
 * ```
 */
export function resolveCommandsSchemaRefs<T>(schema: T): T {
  return rewriteRefs(schema) as T;
}

function rewriteRefs(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(rewriteRefs);
  }
  if (node !== null && typeof node === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') {
        const fileName = value.split('/').pop() as string;
        result[key] = fragmentIdByFileName.get(fileName) ?? value;
      } else {
        result[key] = rewriteRefs(value);
      }
    }
    return result;
  }
  return node;
}

/**
 * Registers every generic fragment this package ships onto a bot's own ajv
 * instance under its canonical `$id`, so the framework's own fragments can
 * `$ref` each other. Call this before `ajv.compile()`-ing the bot's own
 * schema, after passing that schema through `resolveCommandsSchemaRefs()`.
 *
 * A fragment's `$id` (e.g. `https://schema.went.tf/discord-bot-framework/chat-input-command.json`)
 * is an opaque, never-fetched identifier - not a real filesystem location -
 * so it's not something an editor (VS Code, JetBrains, ...) can resolve for
 * autocomplete while you hand-edit commands.schema.json, and not something
 * this package tries to make ajv resolve via real filesystem/URI math either
 * (an earlier version of this function tried registering fragments under
 * their real `file://` location for that purpose; confirmed broken for every
 * pnpm install, not just local dev, because pnpm always symlinks packages
 * from its `.pnpm` virtual store into `node_modules`, and Node's ESM loader
 * resolves `import.meta.url` through that symlink to the real store path -
 * a path a bot's own relative `$ref` can never independently compute).
 * `resolveCommandsSchemaRefs()` is the actual fix: it rewrites a bot's own
 * relative-path `$ref`s to the matching fragment's canonical `$id` by
 * filename, sidestepping filesystem resolution for ajv entirely while
 * leaving the human-facing JSON file itself untouched (still relative paths,
 * for the editor).
 */
export function registerFrameworkSchemas(ajv: Ajv): void {
  for (const schema of frameworkSchemas) {
    if (!ajv.getSchema(schema.$id)) {
      ajv.addSchema(schema);
    }
  }
}

export type ApplicationCommandOptionChoice = FromSchema<typeof applicationCommandOptionChoiceSchema>;

export type ApplicationCommandLeafOption = FromSchema<
  typeof applicationCommandLeafOptionSchema,
  { references: [typeof optionNameSchema, typeof applicationCommandOptionChoiceSchema, typeof channelTypeSchema] }
>;

export type ApplicationCommandSubcommand = FromSchema<
  typeof applicationCommandSubcommandSchema,
  { references: [typeof optionNameSchema, typeof applicationCommandLeafOptionSchema, typeof applicationCommandOptionChoiceSchema, typeof channelTypeSchema] }
>;

export type ApplicationCommandSubcommandGroup = FromSchema<
  typeof applicationCommandSubcommandGroupSchema,
  {
    references: [
      typeof optionNameSchema,
      typeof applicationCommandSubcommandSchema,
      typeof applicationCommandLeafOptionSchema,
      typeof applicationCommandOptionChoiceSchema,
      typeof channelTypeSchema,
    ];
  }
>;

type ApplicationCommandOptionReferences = [
  typeof optionNameSchema,
  typeof applicationCommandLeafOptionSchema,
  typeof applicationCommandSubcommandSchema,
  typeof applicationCommandSubcommandGroupSchema,
  typeof applicationCommandOptionChoiceSchema,
  typeof channelTypeSchema,
];

export type ApplicationCommandOption = FromSchema<typeof applicationCommandOptionSchema, { references: ApplicationCommandOptionReferences }>;

export type ChatInputCommandFileEntry = FromSchema<
  typeof chatInputCommandSchema,
  {
    references: [
      ...ApplicationCommandOptionReferences,
      typeof applicationCommandOptionSchema,
      typeof defaultMemberPermissionsSchema,
      typeof interactionContextTypeSchema,
      typeof applicationIntegrationTypeSchema,
    ];
  }
>;

export type ContextMenuCommandFileEntry = FromSchema<
  typeof contextMenuCommandSchema,
  { references: [typeof contextMenuNameSchema, typeof defaultMemberPermissionsSchema, typeof interactionContextTypeSchema, typeof applicationIntegrationTypeSchema] }
>;

export type CommandFileEntry = ChatInputCommandFileEntry | ContextMenuCommandFileEntry;

/**
 * Composed from the already-derived per-entry types rather than a second
 * `FromSchema<typeof commandsFileSchema, ...>` call - deriving the whole-file
 * array type by re-walking the same deeply-nested option oneOf structure one
 * level up hits TS's type-instantiation depth limit (TS2589), confirmed
 * during implementation. `commandsFileSchema` itself remains the runtime
 * source of truth for ajv validation; only its *type* derivation is composed
 * this way.
 *
 * Either root shape `commandsFileSchema` accepts: a bare array (unchanged
 * since the first release of this format), or that array wrapped as
 * `{ $schema?, commands }` so the file's root is an object and can carry a
 * real inline `$schema` property for editor autocomplete/validation - a bare
 * JSON array can never do that, `$schema` is only ever valid on an object.
 */
export type CommandsFile = readonly CommandFileEntry[] | { $schema?: string; commands: readonly CommandFileEntry[] };

/** Normalizes either `CommandsFile` root shape down to the flat entries array. */
export function getCommandsFileEntries(commandsFile: CommandsFile): readonly CommandFileEntry[] {
  if (Array.isArray(commandsFile)) {
    return commandsFile as readonly CommandFileEntry[];
  }
  return (commandsFile as { commands: readonly CommandFileEntry[] }).commands;
}
