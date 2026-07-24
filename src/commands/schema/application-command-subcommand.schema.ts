import { applicationCommandLeafOptionSchema } from './application-command-leaf-option.schema.js';
import { optionNameSchema } from './option-name.schema.js';

/**
 * A Subcommand option (type 1). Its own options may only be leaf options -
 * Discord allows at most one level of subcommand-group -> subcommand nesting,
 * so a subcommand can never contain another subcommand or subcommand group.
 */
export const applicationCommandSubcommandSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/application-command-subcommand.json',
  type: 'object',
  properties: {
    name: { $ref: optionNameSchema.$id },
    description: { type: 'string' },
    type: { const: 1 },
    options: {
      type: 'array',
      items: { $ref: applicationCommandLeafOptionSchema.$id },
    },
  },
  required: ['name', 'type'],
  additionalProperties: false,
} as const;
