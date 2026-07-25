import { APIApplicationCommandOption, RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v10';
import { NamedChatInputCommand, NamedContextMenuCommand, Registry } from '../interactions/registry.js';
import { BaseInteractionContext } from '../interactions/types.js';
import {
  APPLICATION_COMMAND_OPTION_TYPE_MAP,
  APPLICATION_COMMAND_TYPE_MAP,
  APPLICATION_INTEGRATION_TYPE_MAP,
  CHANNEL_TYPE_MAP,
  INTERACTION_CONTEXT_TYPE_MAP,
  resolveEnumValue,
} from './schema/enum-maps.js';
import { ApplicationCommandOption, ChatInputCommandFileEntry, CommandsFile, getCommandsFileEntries } from './schema/index.js';

export type DescriptionResolver = (path: readonly string[]) => string | undefined;
export type LocalizationResolver = (path: readonly string[]) => Record<string, string> | undefined;

export interface BuildApplicationCommandsBodyOptions {
  /** Merged into every commands.json entry. The entry's own fields win on conflict. */
  sharedMetadata?: Partial<RESTPostAPIApplicationCommandsJSONBody>;
  /**
   * Called with a dot-path-shaped key array (e.g. `['commands', 'search', 'description']`,
   * or `['commands', 'search', 'options', 'query', 'description']`) for every
   * command/option whose commands.json entry has no `description` of its own.
   * Pass a `createCommandLocalizer(...).resolveDescription` here to fill
   * descriptions from i18next at submission time instead of authoring them
   * by hand in commands.json.
   */
  resolveDescription?: DescriptionResolver;
  /** Same path convention as `resolveDescription`, but for `name`/`name_localizations`. */
  localizeNames?: LocalizationResolver;
  /** Same path convention as `resolveDescription`, but for `description_localizations`. */
  localizeDescriptions?: LocalizationResolver;
}

export interface BuildApplicationCommandsBodyRegistries<
  Ctx extends BaseInteractionContext,
  ChatInputName extends string = string,
  ContextMenuName extends string = string,
> {
  chatInput?: Registry<ChatInputName, NamedChatInputCommand<Ctx, ChatInputName>>;
  contextMenu?: Registry<ContextMenuName, NamedContextMenuCommand<Ctx, ContextMenuName>>;
}

/**
 * True for both the numeric (`1`) and UPPER_SNAKE_CASE string (`'CHAT_INPUT'`)
 * form of a commands.json entry's `type` - commands.json accepts either, see
 * `./schema/enum-maps.ts`. The real numeric value is only ever resolved right
 * before a command/option is written into the final REST body below.
 */
function isChatInputType(type: unknown): boolean {
  return type === APPLICATION_COMMAND_TYPE_MAP.CHAT_INPUT || type === 'CHAT_INPUT';
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

interface ResolveOptionsContext {
  resolveDescription: DescriptionResolver | undefined;
  localizeNames: LocalizationResolver | undefined;
  localizeDescriptions: LocalizationResolver | undefined;
  missingDescriptions: string[];
  commandName: string;
}

function resolveOptionsDescriptions(
  optionsList: readonly ApplicationCommandOption[] | undefined,
  basePath: readonly string[],
  ctx: ResolveOptionsContext,
): APIApplicationCommandOption[] | undefined {
  if (!optionsList) return undefined;

  return optionsList.map((option) => {
    const optionPath = [...basePath, 'options', option.name];
    const description = option.description ?? ctx.resolveDescription?.([...optionPath, 'description']);
    if (!description) {
      ctx.missingDescriptions.push(`"${ctx.commandName}" > "${option.name}" (option)`);
    }

    const nameLocalizations = ctx.localizeNames?.([...optionPath, 'name']);
    const descriptionLocalizations = ctx.localizeDescriptions?.([...optionPath, 'description']);

    const nestedOptions = 'options' in option && option.options
      ? resolveOptionsDescriptions(option.options, optionPath, ctx)
      : undefined;

    const resolvedType = resolveEnumValue(APPLICATION_COMMAND_OPTION_TYPE_MAP, option.type);
    const channelTypes = 'channel_types' in option && option.channel_types
      ? option.channel_types.map((ct) => resolveEnumValue(CHANNEL_TYPE_MAP, ct))
      : undefined;

    return {
      ...option,
      type: resolvedType,
      description: description ?? '',
      ...(channelTypes ? { channel_types: channelTypes } : {}),
      ...(nameLocalizations ? { name_localizations: nameLocalizations } : {}),
      ...(descriptionLocalizations ? { description_localizations: descriptionLocalizations } : {}),
      ...(nestedOptions ? { options: nestedOptions } : {}),
    } as APIApplicationCommandOption;
  });
}

function formatValidationErrors(unmatchedFileEntries: string[], unmatchedHandlers: string[], missingDescriptions: string[]): string {
  const sections: string[] = [];
  if (unmatchedFileEntries.length) {
    sections.push(['Commands in commands.json with no matching handler:', ...unmatchedFileEntries.map((n) => `  - "${n}"`)].join('\n'));
  }
  if (unmatchedHandlers.length) {
    sections.push(['Handlers registered with no matching commands.json entry:', ...unmatchedHandlers.map((n) => `  - "${n}"`)].join('\n'));
  }
  if (missingDescriptions.length) {
    sections.push(['Commands/options missing a description (in commands.json and localize hook):', ...missingDescriptions.map((n) => `  - ${n}`)].join('\n'));
  }
  return `Command registration validation failed:\n${sections.join('\n')}`;
}

/**
 * Builds the flat `RESTPostAPIApplicationCommandsJSONBody[]` `createCommandRegistrar`
 * expects from a validated commands.json array plus the bot's handler registries.
 * `commandsFile`'s own order drives the output order (not registry insertion order).
 *
 * Accepts either root shape `commandsFileSchema` allows: a bare array, or that
 * array wrapped as `{ $schema?, commands }` (the form that lets `commands.json`
 * carry a real inline `$schema` property for editor autocomplete, since a bare
 * array can't).
 *
 * `type`/`contexts`/`integration_types`/`channel_types` may be authored in
 * commands.json as either Discord's raw numeric values or the friendlier
 * UPPER_SNAKE_CASE string aliases from `./schema/enum-maps.ts` - both forms
 * are resolved to their real numeric value here, at the point each command/
 * option is written into the final REST body, never earlier.
 *
 * Every commands.json entry must have a matching handler, and every handler must have
 * a matching commands.json entry - both directions throw one combined error listing
 * every offender, same as a command/option left with no resolvable description. This
 * never silently sends an incomplete body to Discord's API.
 */
export function buildApplicationCommandsBody<Ctx extends BaseInteractionContext>(
  commandsFileInput: CommandsFile,
  registries: BuildApplicationCommandsBodyRegistries<Ctx>,
  options: BuildApplicationCommandsBodyOptions = {},
): RESTPostAPIApplicationCommandsJSONBody[] {
  const { sharedMetadata = {}, resolveDescription, localizeNames, localizeDescriptions } = options;
  const commandsFile = getCommandsFileEntries(commandsFileInput);

  const body: RESTPostAPIApplicationCommandsJSONBody[] = [];
  const unmatchedFileEntries: string[] = [];
  const missingDescriptions: string[] = [];

  const chatInputFileNames = new Set<string>();
  const contextMenuFileNames = new Set<string>();

  for (const entry of commandsFile) {
    const isChatInput = isChatInputType(entry.type);
    if (isChatInput) {
      chatInputFileNames.add(entry.name);
    } else {
      contextMenuFileNames.add(entry.name);
    }

    const command = isChatInput ? registries.chatInput?.byName[entry.name] : registries.contextMenu?.byName[entry.name];
    if (!command) {
      unmatchedFileEntries.push(entry.name);
      continue;
    }
    if (command.registerCondition && !command.registerCondition()) continue;

    const nameLocalizations = localizeNames?.(['commands', entry.name, 'name']);
    const resolvedType = isChatInput
      ? APPLICATION_COMMAND_TYPE_MAP.CHAT_INPUT
      : resolveEnumValue(APPLICATION_COMMAND_TYPE_MAP, entry.type as number | 'USER' | 'MESSAGE');
    const contexts = entry.contexts?.map((c) => resolveEnumValue(INTERACTION_CONTEXT_TYPE_MAP, c));
    const integrationTypes = entry.integration_types?.map((i) => resolveEnumValue(APPLICATION_INTEGRATION_TYPE_MAP, i));

    if (isChatInput) {
      const chatEntry = entry as ChatInputCommandFileEntry;
      const description = chatEntry.description ?? resolveDescription?.(['commands', chatEntry.name, 'description']);
      if (!description) {
        missingDescriptions.push(`"${chatEntry.name}" (command)`);
      }

      const resolvedOptions = resolveOptionsDescriptions(chatEntry.options, ['commands', chatEntry.name], {
        resolveDescription,
        localizeNames,
        localizeDescriptions,
        missingDescriptions,
        commandName: chatEntry.name,
      });
      const descriptionLocalizations = localizeDescriptions?.(['commands', chatEntry.name, 'description']);

      body.push({
        ...sharedMetadata,
        ...chatEntry,
        type: resolvedType,
        description: description ?? '',
        options: sortRequiredOptionsFirst(resolvedOptions),
        ...(contexts ? { contexts } : {}),
        ...(integrationTypes ? { integration_types: integrationTypes } : {}),
        ...(nameLocalizations ? { name_localizations: nameLocalizations } : {}),
        ...(descriptionLocalizations ? { description_localizations: descriptionLocalizations } : {}),
      } as RESTPostAPIApplicationCommandsJSONBody);
    } else {
      body.push({
        ...sharedMetadata,
        ...entry,
        type: resolvedType,
        ...(contexts ? { contexts } : {}),
        ...(integrationTypes ? { integration_types: integrationTypes } : {}),
        ...(nameLocalizations ? { name_localizations: nameLocalizations } : {}),
      } as RESTPostAPIApplicationCommandsJSONBody);
    }
  }

  const unmatchedHandlers: string[] = [];
  for (const name of registries.chatInput?.names ?? []) {
    if (!chatInputFileNames.has(name)) unmatchedHandlers.push(name);
  }
  for (const name of registries.contextMenu?.names ?? []) {
    if (!contextMenuFileNames.has(name)) unmatchedHandlers.push(name);
  }

  if (unmatchedFileEntries.length || unmatchedHandlers.length || missingDescriptions.length) {
    throw new Error(formatValidationErrors(unmatchedFileEntries, unmatchedHandlers, missingDescriptions));
  }

  return body;
}
