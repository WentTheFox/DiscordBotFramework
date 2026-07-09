import { APIApplicationCommandOption, RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v10';
import { Registry } from '../interactions/registry.js';

export interface BuildApplicationCommandsBodyOptions<T> {
  /**
   * Merged into every command's own `getDefinition()` output. The command's
   * own fields win on conflict, except `name`, which is always injected from
   * the registry key afterwards (see below) so the registry stays the single
   * source of truth for a command's name.
   */
  sharedMetadata?: Partial<RESTPostAPIApplicationCommandsJSONBody>;
  /** Argument forwarded to every `getDefinition(t)` call, e.g. an i18next `TFunction`. */
  definitionArg?: T;
}

export type RegisterableCommand<T, Name extends string = string> = {
  registerCondition?: () => boolean;
  getDefinition: (t?: T) => RESTPostAPIApplicationCommandsJSONBody;
  name: Name;
};

export interface BuildApplicationCommandsBodyRegistries<
  T,
  ChatInputName extends string = string,
  ChatInputCommand extends RegisterableCommand<T, ChatInputName> = RegisterableCommand<T, ChatInputName>,
  ContextMenuName extends string = string,
  ContextMenuCommand extends RegisterableCommand<T, ContextMenuName> = RegisterableCommand<T, ContextMenuName>,
> {
  chatInput?: Registry<ChatInputName, ChatInputCommand>;
  contextMenu?: Registry<ContextMenuName, ContextMenuCommand>;
}

function sortRequiredOptionsFirst(options: APIApplicationCommandOption[] | undefined): APIApplicationCommandOption[] | undefined {
  if (!options) return options;
  return [...options]
    .sort((a, b) => Number('required' in b && b.required === true) - Number('required' in a && a.required === true))
    .map((option) => {
      if ('options' in option && option.options) {
        return { ...option, options: sortRequiredOptionsFirst(option.options) } as APIApplicationCommandOption;
      }
      return option;
    });
}

/**
 * Flattens one or more registries of self-describing commands into the flat
 * `RESTPostAPIApplicationCommandsJSONBody[]` shape `createCommandRegistrar`
 * expects, applying `registerCondition` filtering, merging `sharedMetadata`
 * (caller-supplied, e.g. `integration_types`/`contexts`), and stably sorting
 * each options array (and nested subcommand/subcommand-group options arrays)
 * so required options always precede optional ones, matching Discord's API
 * requirement without every command author having to get the ordering right
 * by hand.
 */
export function buildApplicationCommandsBody<
  T,
  ChatInputName extends string = string,
  ChatInputCommand extends RegisterableCommand<T, ChatInputName> = RegisterableCommand<T, ChatInputName>,
  ContextMenuName extends string = string,
  ContextMenuCommand extends RegisterableCommand<T, ContextMenuName> = RegisterableCommand<T, ContextMenuName>,
>(
  registries: BuildApplicationCommandsBodyRegistries<T, ChatInputName, ChatInputCommand, ContextMenuName, ContextMenuCommand>,
  options: BuildApplicationCommandsBodyOptions<T> = {},
): RESTPostAPIApplicationCommandsJSONBody[] {
  const { sharedMetadata = {}, definitionArg } = options;
  const body: RESTPostAPIApplicationCommandsJSONBody[] = [];

  function appendRegistry<Name extends string, Command extends RegisterableCommand<T, Name>>(registry: Registry<Name, Command> | undefined): void {
    if (!registry) return;
    for (const name of registry.names) {
      const command = registry.byName[name];
      if (command.registerCondition && !command.registerCondition()) continue;
      const definition = {
        ...sharedMetadata,
        ...command.getDefinition(definitionArg),
        name: command.name,
      };
      if ('options' in definition) {
        (definition as { options?: APIApplicationCommandOption[] }).options = sortRequiredOptionsFirst((definition as { options?: APIApplicationCommandOption[] }).options);
      }
      body.push(definition);
    }
  }

  appendRegistry(registries.chatInput);
  appendRegistry(registries.contextMenu);

  return body;
}
