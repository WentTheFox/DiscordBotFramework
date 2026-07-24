import { applicationIntegrationTypeSchema } from './application-integration-type.schema.js';
import { contextMenuNameSchema } from './context-menu-name.schema.js';
import { defaultMemberPermissionsSchema } from './default-member-permissions.schema.js';
import { interactionContextTypeSchema } from './interaction-context-type.schema.js';

/**
 * One USER or MESSAGE context-menu command entry. No description/options -
 * Discord doesn't accept them for context-menu commands, and
 * additionalProperties:false enforces that here (nothing enforced this before).
 */
export const contextMenuCommandSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/context-menu-command.json',
  type: 'object',
  properties: {
    type: { enum: [2, 3, 'USER', 'MESSAGE'] },
    name: { $ref: contextMenuNameSchema.$id },
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
