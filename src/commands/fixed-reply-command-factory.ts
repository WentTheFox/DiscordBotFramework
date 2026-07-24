import { MessageFlags } from 'discord-api-types/v10';
import { BaseInteractionContext, BotChatInputCommand } from '../interactions/types.js';

/**
 * Builds a chat-input command handler that always replies with the same
 * static content, for trivial "fun" commands with no logic (e.g. `/rekt`,
 * `/yes`). The command's name/description now live in the bot's
 * commands.json file, not here - pair this with a registry entry like
 * `{ name: 'ping', ...fixedReplyCommandFactory('pong') }`.
 */
export function fixedReplyCommandFactory<Ctx extends BaseInteractionContext>(content: string, ephemeral = false): BotChatInputCommand<Ctx> {
  return {
    async handle(interaction) {
      await interaction.reply({
        content,
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    },
  };
}
