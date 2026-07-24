import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  UserContextMenuCommandInteraction,
  MessageContextMenuCommandInteraction,
} from 'discord.js';
import { NestableLogger } from '../logger/types.js';

export type BaseInteractionContext = { logger: NestableLogger };

export type CommandHandler<Ctx> = (interaction: ChatInputCommandInteraction, context: Ctx) => void | Promise<void>;
export type AutocompleteHandler<Ctx> = (interaction: AutocompleteInteraction, context: Ctx, optionName: string) => void | Promise<void>;
export type ComponentHandler<Ctx> = (interaction: MessageComponentInteraction, context: Ctx, resourceId?: string) => void | Promise<void>;
export type ModalHandler<Ctx> = (interaction: ModalSubmitInteraction, context: Ctx, resourceId?: string) => void | Promise<void>;
export type ContextMenuHandler<Ctx> = (interaction: UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction, context: Ctx) => void | Promise<void>;

/**
 * A command's wire definition (name, description, options, permissions) lives
 * in the bot's commands.json file, not here - see `./schema` and
 * `buildApplicationCommandsBody`. This is purely the handler side.
 */
export interface BotChatInputCommand<Ctx> {
  /** When present, the command is only included in registration output if this returns true. */
  registerCondition?: () => boolean;
  handle: CommandHandler<Ctx>;
  /** Keyed by the autocompleted option's name. */
  autocomplete?: Record<string, AutocompleteHandler<Ctx>>;
  /** Keyed by modal ID, for modals shown by this command. */
  modal?: Record<string, ModalHandler<Ctx>>;
}

export interface BotMessageComponent<Ctx> {
  handle: ComponentHandler<Ctx>;
}

export interface BotModal<Ctx> {
  handle: ModalHandler<Ctx>;
}

/** A context-menu command's wire definition lives in the bot's commands.json file - see `./schema`. */
export interface BotContextMenuCommand<Ctx> {
  /** When present, the command is only included in registration output if this returns true. */
  registerCondition?: () => boolean;
  handle: ContextMenuHandler<Ctx>;
}
