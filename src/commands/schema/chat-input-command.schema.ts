import { applicationCommandOptionSchema } from './application-command-option.schema.js';
import { applicationIntegrationTypeSchema } from './application-integration-type.schema.js';
import { defaultMemberPermissionsSchema } from './default-member-permissions.schema.js';
import { interactionContextTypeSchema } from './interaction-context-type.schema.js';
import { optionNameSchema } from './option-name.schema.js';

/** One CHAT_INPUT (slash command) entry. No dm_permission - deprecated by Discord in favor of contexts. */
export const chatInputCommandSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/chat-input-command.json',
  type: 'object',
  properties: {
    type: { const: 1 },
    name: { $ref: optionNameSchema.$id },
    description: { type: 'string' },
    options: {
      type: 'array',
      items: { $ref: applicationCommandOptionSchema.$id },
    },
    default_member_permissions: { $ref: defaultMemberPermissionsSchema.$id },
    contexts: {
      type: 'array',
      items: { $ref: interactionContextTypeSchema.$id },
      uniqueItems: true,
    },
    integration_types: {
      type: 'array',
      items: { $ref: applicationIntegrationTypeSchema.$id },
      uniqueItems: true,
    },
    nsfw: { type: 'boolean' },
  },
  required: ['type', 'name'],
  additionalProperties: false,
} as const;
