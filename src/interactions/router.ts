import { Interaction, InteractionType } from 'discord.js';
import {
  dispatchAutocomplete,
  dispatchChatInputCommand,
  dispatchComponent,
  dispatchContextMenu,
  dispatchModal,
  OnDispatchError,
} from './dispatch.js';
import {
  BaseInteractionContext,
  BotChatInputCommand,
  BotContextMenuCommand,
  BotMessageComponent,
  BotModal,
} from './types.js';

export interface InteractionRouterConfig<Ctx extends BaseInteractionContext> {
  commands: Record<string, BotChatInputCommand<Ctx>>;
  components?: Record<string, BotMessageComponent<Ctx>>;
  modals?: Record<string, BotModal<Ctx>>;
  contextMenuCommands?: Record<string, BotContextMenuCommand<Ctx>>;
  customIdSeparator?: string;
  /**
   * Builds (or enriches) the per-interaction context. Runs before dispatch on
   * every interaction type. This is the seam bots use to wire in things the
   * router itself has no opinion about, e.g. a per-locale `t` function or a
   * cached settings lookup.
   */
  buildContext: (interaction: Interaction, baseContext: Ctx) => Ctx | Promise<Ctx>;
  onError: OnDispatchError<Ctx>;
}

/**
 * A convenience dispatcher covering chat-input commands, autocomplete,
 * message components, modal submits, and context-menu commands, wired
 * through a single `Client#interactionCreate` listener. Bots that need
 * finer-grained control (e.g. running telemetry after a command handles
 * successfully) can call the individual `dispatch*` functions directly
 * instead of this convenience wrapper.
 */
export function createInteractionRouter<Ctx extends BaseInteractionContext>(config: InteractionRouterConfig<Ctx>) {
  return async (interaction: Interaction, baseContext: Ctx): Promise<void> => {
    const context = await config.buildContext(interaction, baseContext);

    if (interaction.isChatInputCommand()) {
      await dispatchChatInputCommand(interaction, context, { commands: config.commands, onError: config.onError });
      return;
    }
    if (interaction.isAutocomplete()) {
      await dispatchAutocomplete(interaction, context, { commands: config.commands, onError: config.onError });
      return;
    }
    if (interaction.isMessageComponent()) {
      await dispatchComponent(interaction, context, {
        components: config.components ?? {},
        customIdSeparator: config.customIdSeparator,
        onError: config.onError,
      });
      return;
    }
    if (interaction.isModalSubmit()) {
      await dispatchModal(interaction, context, {
        modals: config.modals ?? {},
        customIdSeparator: config.customIdSeparator,
        onError: config.onError,
      });
      return;
    }
    if (interaction.type === InteractionType.ApplicationCommand && (interaction.isUserContextMenuCommand() || interaction.isMessageContextMenuCommand())) {
      await dispatchContextMenu(interaction, context, {
        contextMenuCommands: config.contextMenuCommands ?? {},
        onError: config.onError,
      });
      return;
    }

    throw new Error(`Unhandled interaction of type ${interaction.type}`);
  };
}
