import { MessageFlags } from 'discord-api-types/v10';
import { BaseInteractionContext, BotChatInputCommand } from '../interactions/types.js';

/**
 * Builds a chat-input command that always replies with the same static
 * content, for trivial "fun" commands with no logic (e.g. `/rekt`, `/yes`).
 */
export function fixedReplyCommandFactory<Ctx extends BaseInteractionContext>(
  name: string,
  description: string,
  content: string,
  ephemeral = false,
): BotChatInputCommand<Ctx> {
  return {
    getDefinition: () => ({ name, description }),
    async handle(interaction) {
      await interaction.reply({
        content,
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    },
  };
}
