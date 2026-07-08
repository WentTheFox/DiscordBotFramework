import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  UserContextMenuCommandInteraction,
  MessageContextMenuCommandInteraction,
} from 'discord.js';
import { parseCustomIdSegments } from './custom-id.js';
import {
  BaseInteractionContext,
  BotChatInputCommand,
  BotContextMenuCommand,
  BotMessageComponent,
  BotModal,
} from './types.js';

export type OnDispatchError<Ctx> = (interaction: unknown, context: Ctx, error: unknown) => void | Promise<void>;

export interface DispatchChatInputCommandOptions<Ctx extends BaseInteractionContext> {
  commands: Record<string, BotChatInputCommand<Ctx>>;
  onUnknownCommand?: (interaction: ChatInputCommandInteraction, context: Ctx) => void | Promise<void>;
  onError: OnDispatchError<Ctx>;
}

export async function dispatchChatInputCommand<Ctx extends BaseInteractionContext>(
  interaction: ChatInputCommandInteraction,
  context: Ctx,
  options: DispatchChatInputCommandOptions<Ctx>,
): Promise<void> {
  const command = options.commands[interaction.commandName];
  if (!command) {
    if (options.onUnknownCommand) {
      await options.onUnknownCommand(interaction, context);
      return;
    }
    throw new Error(`Unknown command ${interaction.commandName}`);
  }

  try {
    await command.handle(interaction, context);
  } catch (e) {
    context.logger.error(`Error while responding to command interaction (commandName=${interaction.commandName})`, e);
    await options.onError(interaction, context, e);
  }
}

export interface DispatchAutocompleteOptions<Ctx extends BaseInteractionContext> {
  commands: Record<string, BotChatInputCommand<Ctx>>;
  onError: OnDispatchError<Ctx>;
}

export async function dispatchAutocomplete<Ctx extends BaseInteractionContext>(
  interaction: AutocompleteInteraction,
  context: Ctx,
  options: DispatchAutocompleteOptions<Ctx>,
): Promise<void> {
  const command = options.commands[interaction.commandName];
  try {
    const focusedOption = interaction.options.getFocused(true);
    const handler = command?.autocomplete?.[focusedOption.name];
    if (!handler) {
      throw new Error(`Unknown autocomplete option ${focusedOption.name} for command ${interaction.commandName}`);
    }
    await handler(interaction, context, focusedOption.name);
  } catch (e) {
    context.logger.error(`Error while responding to command autocomplete (commandName=${interaction.commandName})`, e);
    await options.onError(interaction, context, e);
  }
}

export interface DispatchComponentOptions<Ctx extends BaseInteractionContext> {
  components: Record<string, BotMessageComponent<Ctx>>;
  customIdSeparator?: string;
  onUnknownComponent?: (interaction: MessageComponentInteraction, context: Ctx) => void | Promise<void>;
  onError: OnDispatchError<Ctx>;
}

export async function dispatchComponent<Ctx extends BaseInteractionContext>(
  interaction: MessageComponentInteraction,
  context: Ctx,
  options: DispatchComponentOptions<Ctx>,
): Promise<void> {
  const { id, resourceId } = parseCustomIdSegments(interaction.customId, options.customIdSeparator);
  const component = options.components[id];
  if (!component) {
    if (options.onUnknownComponent) {
      await options.onUnknownComponent(interaction, context);
      return;
    }
    throw new Error(`Unknown component customId ${id}`);
  }

  try {
    await component.handle(interaction, context, resourceId);
  } catch (e) {
    context.logger.error(`Error while responding to component interaction (customId=${id},resourceId=${resourceId})`, e);
    await options.onError(interaction, context, e);
  }
}

export interface DispatchModalOptions<Ctx extends BaseInteractionContext> {
  modals: Record<string, BotModal<Ctx>>;
  customIdSeparator?: string;
  onUnknownModal?: (interaction: ModalSubmitInteraction, context: Ctx) => void | Promise<void>;
  onError: OnDispatchError<Ctx>;
}

export async function dispatchModal<Ctx extends BaseInteractionContext>(
  interaction: ModalSubmitInteraction,
  context: Ctx,
  options: DispatchModalOptions<Ctx>,
): Promise<void> {
  const { id, resourceId } = parseCustomIdSegments(interaction.customId, options.customIdSeparator);
  const modal = options.modals[id];
  if (!modal) {
    if (options.onUnknownModal) {
      await options.onUnknownModal(interaction, context);
      return;
    }
    throw new Error(`Unknown modal customId ${id}`);
  }

  try {
    await modal.handle(interaction, context, resourceId);
  } catch (e) {
    context.logger.error(`Error while responding to modal submit interaction (customId=${id},resourceId=${resourceId})`, e);
    await options.onError(interaction, context, e);
  }
}

export interface DispatchContextMenuOptions<Ctx extends BaseInteractionContext> {
  contextMenuCommands: Record<string, BotContextMenuCommand<Ctx>>;
  onUnknownCommand?: (interaction: UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction, context: Ctx) => void | Promise<void>;
  onError: OnDispatchError<Ctx>;
}

export async function dispatchContextMenu<Ctx extends BaseInteractionContext>(
  interaction: UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction,
  context: Ctx,
  options: DispatchContextMenuOptions<Ctx>,
): Promise<void> {
  const command = options.contextMenuCommands[interaction.commandName];
  if (!command) {
    if (options.onUnknownCommand) {
      await options.onUnknownCommand(interaction, context);
      return;
    }
    throw new Error(`Unknown context menu command ${interaction.commandName}`);
  }

  try {
    await command.handle(interaction, context);
  } catch (e) {
    context.logger.error(`Error while responding to context menu interaction (commandName=${interaction.commandName})`, e);
    await options.onError(interaction, context, e);
  }
}
