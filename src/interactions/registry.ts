import {
  BaseInteractionContext,
  BotChatInputCommand,
  BotContextMenuCommand,
  BotMessageComponent,
  BotModal,
} from './types.js';

export type NamedChatInputCommand<Ctx extends BaseInteractionContext, Name extends string = string> =
  BotChatInputCommand<Ctx> & { name: Name };

export type NamedContextMenuCommand<Ctx extends BaseInteractionContext, Name extends string = string> =
  BotContextMenuCommand<Ctx> & { name: Name };

export type NamedComponent<Ctx extends BaseInteractionContext, Id extends string = string> =
  BotMessageComponent<Ctx> & { id: Id };

export type NamedModal<Ctx extends BaseInteractionContext, Id extends string = string> =
  BotModal<Ctx> & { id: Id };

export interface Registry<Name extends string, T> {
  readonly byName: Record<Name, T>;
  readonly names: readonly Name[];
  isKnown(name: string): name is Name;
}

/**
 * Extracts the literal name union a `create*Registry` call already inferred
 * from its input array, so a bot can derive e.g. `type ChatInputCommandName =
 * RegistryName<typeof chatInputCommandRegistry>` instead of hand-maintaining
 * a parallel enum of the same names.
 */
export type RegistryName<R extends Registry<string, unknown>> = R extends Registry<infer Name, unknown> ? Name : never;

function buildRegistry<Name extends string, T>(items: readonly T[], keyOf: (item: T) => Name): Registry<Name, T> {
  const byName = {} as Record<Name, T>;
  for (const item of items) {
    const key = keyOf(item);
    if (key in byName) {
      throw new Error(`Duplicate registry key "${key}"`);
    }
    byName[key] = item;
  }
  const names = Object.keys(byName) as Name[];
  return {
    byName,
    names,
    isKnown: (name: string): name is Name => name in byName,
  };
}

export function createChatInputCommandRegistry<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Ctx is only used to validate array element shape; TS can't back-infer it from a `const`-inferred array constraint, so pinning it narrows the constraint instead of widening it. Commands[number] (used below) is still the precise element type.
  const Commands extends readonly NamedChatInputCommand<any, string>[],
>(commands: Commands): Registry<Commands[number]['name'], Commands[number]> {
  return buildRegistry(commands, (c) => c.name) as Registry<Commands[number]['name'], Commands[number]>;
}

export function createContextMenuCommandRegistry<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see createChatInputCommandRegistry above
  const Commands extends readonly NamedContextMenuCommand<any, string>[],
>(commands: Commands): Registry<Commands[number]['name'], Commands[number]> {
  return buildRegistry(commands, (c) => c.name) as Registry<Commands[number]['name'], Commands[number]>;
}

export function createComponentRegistry<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see createChatInputCommandRegistry above
  const Components extends readonly NamedComponent<any, string>[],
>(components: Components): Registry<Components[number]['id'], Components[number]> {
  return buildRegistry(components, (c) => c.id) as Registry<Components[number]['id'], Components[number]>;
}

export function createModalRegistry<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see createChatInputCommandRegistry above
  const Modals extends readonly NamedModal<any, string>[],
>(modals: Modals): Registry<Modals[number]['id'], Modals[number]> {
  return buildRegistry(modals, (m) => m.id) as Registry<Modals[number]['id'], Modals[number]>;
}

/**
 * Flattens every chat-input command's nested `.modal` map into a flat
 * modal-id -> owning-command lookup (mirroring what a bot with Fantastick's
 * shape hand-builds today), presented as a synthesized `Registry` so the
 * existing `dispatchModal` can consume it directly via `.byName` without any
 * changes to `dispatch.ts`. Each synthesized entry's `handle` closes over the
 * owning command's `modal[modalId]`.
 */
export function flattenCommandModals<Ctx extends BaseInteractionContext>(
  chatInputRegistry: Registry<string, NamedChatInputCommand<Ctx, string>>,
): Registry<string, BotModal<Ctx>> {
  const modals: NamedModal<Ctx>[] = [];
  for (const command of chatInputRegistry.names.map((name) => chatInputRegistry.byName[name])) {
    if (!command.modal) continue;
    for (const modalId of Object.keys(command.modal)) {
      const handle = command.modal[modalId];
      modals.push({ id: modalId, handle });
    }
  }
  return buildRegistry(modals, (m) => m.id);
}
