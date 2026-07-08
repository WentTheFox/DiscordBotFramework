import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  RESTPostAPIContextMenuApplicationCommandsJSONBody,
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

export interface BotChatInputCommand<Ctx, T = unknown> {
  /** When present, the command is only included in registration output if this returns true. */
  registerCondition?: () => boolean;
  getDefinition: (t?: T) => RESTPostAPIChatInputApplicationCommandsJSONBody;
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

export interface BotContextMenuCommand<Ctx, T = unknown> {
  /** When present, the command is only included in registration output if this returns true. */
  registerCondition?: () => boolean;
  getDefinition: (t?: T) => RESTPostAPIContextMenuApplicationCommandsJSONBody;
  handle: ContextMenuHandler<Ctx>;
}
