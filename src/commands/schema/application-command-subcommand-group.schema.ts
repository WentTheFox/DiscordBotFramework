import { applicationCommandSubcommandSchema } from './application-command-subcommand.schema.js';
import { optionNameSchema } from './option-name.schema.js';

/**
 * A SubcommandGroup option (type 2). Its own options may only be Subcommands -
 * Discord allows exactly one level of subcommand-group -> subcommand nesting.
 */
export const applicationCommandSubcommandGroupSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/application-command-subcommand-group.json',
  type: 'object',
  properties: {
    name: { $ref: optionNameSchema.$id },
    description: { type: 'string' },
    type: { const: 2 },
    options: {
      type: 'array',
      items: { $ref: applicationCommandSubcommandSchema.$id },
    },
  },
  required: ['name', 'type'],
  additionalProperties: false,
} as const;
