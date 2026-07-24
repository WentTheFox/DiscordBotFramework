import { applicationCommandLeafOptionSchema } from './application-command-leaf-option.schema.js';
import { applicationCommandSubcommandGroupSchema } from './application-command-subcommand-group.schema.js';
import { applicationCommandSubcommandSchema } from './application-command-subcommand.schema.js';

/** A top-level command option: any leaf option, a Subcommand, or a SubcommandGroup. */
export const applicationCommandOptionSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/application-command-option.json',
  oneOf: [
    { $ref: applicationCommandLeafOptionSchema.$id },
    { $ref: applicationCommandSubcommandSchema.$id },
    { $ref: applicationCommandSubcommandGroupSchema.$id },
  ],
} as const;
