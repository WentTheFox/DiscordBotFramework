import { chatInputCommandSchema } from './chat-input-command.schema.js';
import { contextMenuCommandSchema } from './context-menu-command.schema.js';

/**
 * One commands.json entry: a chat-input or context-menu command. Its own
 * fragment (rather than staying inlined in commands-file.schema.ts) so both
 * root shapes commands-file.schema.ts accepts (bare array, or `{ commands }`)
 * can `$ref` the same single source of truth for "one entry" instead of
 * duplicating the oneOf.
 */
export const commandFileEntrySchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/command-file-entry.json',
  oneOf: [{ $ref: chatInputCommandSchema.$id }, { $ref: contextMenuCommandSchema.$id }],
} as const;
