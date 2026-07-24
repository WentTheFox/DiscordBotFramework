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
  commandsFileSchema,
] as const;

/**
 * Registers every generic fragment this package ships onto a bot's own ajv
 * instance, so the bot's own composed commands.schema.json can `$ref` them
 * by `$id`. Call this before `ajv.compile()`-ing the bot's own schema.
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
 */
export type CommandsFile = readonly CommandFileEntry[];
