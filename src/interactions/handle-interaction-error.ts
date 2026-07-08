import { MessageFlags } from 'discord-api-types/v10';
import {
  AutocompleteInteraction,
  ComponentType,
  DiscordjsError,
  DiscordjsErrorCodes,
  InteractionReplyOptions,
  RepliableInteraction,
} from 'discord.js';
import { NestableLogger } from '../logger/types.js';

const ellipsis = '…';
const maximumMessageLength = 2000;

export interface HandleInteractionErrorOptions {
  /** Builds the (already-localized, if applicable) error message text shown to the user. */
  buildMessage: () => string;
  /**
   * Sends the initial ephemeral error reply. Defaults to a plain
   * `interaction.reply(options)`. Override to plug in bot-specific reply
   * wrapping (e.g. ComponentsV2 upgrades, translation footers).
   */
  reply?: (interaction: RepliableInteraction, options: InteractionReplyOptions) => Promise<unknown>;
  /**
   * Called once, only on the "first reply" path (not the edit-existing-reply
   * fallback), when an error is about to be shown to the user for the first
   * time. Useful for e.g. @mentioning a bot owner.
   */
  onUnexpectedError?: () => void | Promise<void>;
}

const defaultReply = (interaction: RepliableInteraction, options: InteractionReplyOptions) => interaction.reply(options);

export const handleInteractionError = async (
  interaction: RepliableInteraction | AutocompleteInteraction,
  context: { logger: NestableLogger },
  options: HandleInteractionErrorOptions,
): Promise<void> => {
  const { buildMessage, reply = defaultReply, onUnexpectedError } = options;

  if (interaction.isAutocomplete()) {
    await interaction.respond([
      {
        value: '',
        name: buildMessage(),
      },
    ]);
    return;
  }

  let alreadyReplied = interaction.replied;
  if (!alreadyReplied) {
    await onUnexpectedError?.();
    try {
      await reply(interaction, {
        content: buildMessage(),
        flags: MessageFlags.Ephemeral,
      });
    } catch (e) {
      if (e instanceof DiscordjsError && e.code === DiscordjsErrorCodes.InteractionAlreadyReplied) {
        alreadyReplied = true;
      } else {
        context.logger.error('Failed to send interaction error reply', e);
        throw e;
      }
    }
  }
  if (!alreadyReplied) {
    return;
  }

  // If we already replied, edit the existing message to include the error
  const oldReply = await interaction.fetchReply();
  const flags = oldReply.flags.bitfield;
  const errorMessage = buildMessage();
  const oldReplyComponents = oldReply.components;
  if (oldReply.flags.has(MessageFlags.IsComponentsV2)) {
    await interaction.editReply({
      flags,
      components: [...oldReplyComponents, {
        type: ComponentType.TextDisplay,
        content: errorMessage,
      }],
    });
    return;
  }
  const oldReplyContent = oldReply.content;
  const messageSuffix = `\n\n${errorMessage}`;
  let newContent = oldReplyContent + messageSuffix;
  if (newContent.length > maximumMessageLength) {
    newContent = oldReplyContent.substring(0, maximumMessageLength - messageSuffix.length - ellipsis.length) + ellipsis + messageSuffix;
  }
  await interaction.editReply({
    flags,
    content: newContent,
  });
};
