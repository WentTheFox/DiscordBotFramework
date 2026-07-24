import { chatInputCommandSchema } from './chat-input-command.schema.js';
import { contextMenuCommandSchema } from './context-menu-command.schema.js';

/**
 * The framework's base whole-file fragment: a flat array mirroring Discord's
 * bulk-overwrite PUT body shape. Usable directly by bots with no extra
 * constraints, or as the thing a bot's own commands.schema composes over
 * (e.g. narrowing `name` to an enum of its actual command names) via allOf/$ref.
 */
export const commandsFileSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/commands-file.json',
  type: 'array',
  items: {
    oneOf: [{ $ref: chatInputCommandSchema.$id }, { $ref: contextMenuCommandSchema.$id }],
  },
} as const;
