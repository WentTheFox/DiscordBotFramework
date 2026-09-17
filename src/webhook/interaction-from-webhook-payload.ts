import { APIInteraction, ApplicationCommandType, ComponentType, InteractionType } from 'discord-api-types/v10';
import {
  AutocompleteInteraction,
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
  Client,
  Interaction,
  MentionableSelectMenuInteraction,
  MessageContextMenuCommandInteraction,
  ModalSubmitInteraction,
  PrimaryEntryPointCommandInteraction,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction,
  UserContextMenuCommandInteraction,
  UserSelectMenuInteraction,
} from 'discord.js';

/**
 * Constructs a discord.js interaction class directly against its own real
 * `(client, data)` constructor - checked against every class this module
 * uses (discord.js@14.26.x), each one's constructor is either `protected`
 * (blocks external construction, but not a subclass's `super()` - not used
 * here since it'd be a second, inconsistent mechanism just for those) or, for
 * `ButtonInteraction`/`ModalSubmitInteraction`/the 5 select-menu classes,
 * fully `private` (blocks even subclassing) with a narrower `data` parameter
 * type (`APIMessageButtonInteractionData`, `APIModalSubmitInteraction`,
 * `APIMessage*SelectInteractionData`) that isn't part of discord.js's public
 * export surface to reference by name anyway. Both are pure TypeScript
 * access-control keywords, erased in the compiled `.js` - this is exactly
 * what discord.js's own `InteractionCreateAction.handle()` does at runtime
 * (`new InteractionClass(client, data)`), just reached through a type cast
 * instead of module-internal privilege, since there's no way to reference a
 * type discord.js itself doesn't export.
 */
function constructInteraction<T>(InteractionClass: unknown, client: Client<true>, data: APIInteraction): T {
  const Ctor = InteractionClass as new (client: Client<true>, data: APIInteraction) => T;
  return new Ctor(client, data);
}

/**
 * Reconstructs a genuine discord.js `Interaction` instance from a raw
 * webhook-delivered interaction payload, so existing gateway-shaped handler
 * code (`interaction.reply()`, `interaction.options.getString()`, etc.) can
 * run completely unmodified in webhook mode - built on the same `client`
 * this instance's `.reply()`/`.editReply()`/etc. will make real REST calls
 * through (see `createWebhookOnlyClient`). Mirrors discord.js's own
 * `InteractionCreateAction.handle()` class-picking switch (which does the
 * same thing for gateway-delivered payloads) exactly, one discord-api-types
 * version at a time - if discord.js adds a new interaction/component type,
 * this needs a matching new case.
 *
 * **Two real gaps versus a gateway-delivered interaction, both from having
 * no populated gateway cache:**
 * - `.guild` is always `null` (`client.guilds.cache` is permanently empty in
 *   webhook mode, and unlike `.channel`, nothing pre-caches a partial for
 *   it).
 * - `.channel` is `null` unless the caller pre-caches the interaction's
 *   inline partial channel data into `client.channels` first - this
 *   function does not attempt that itself (discord.js's own equivalent step,
 *   `Action#getChannel`, is a private internal not exposed for reuse).
 *
 * `.member` degrades gracefully instead of breaking: it falls back to the
 * raw `APIInteractionGuildMember` POJO instead of a real `GuildMember`
 * class instance when `.guild` is `null`, so plain property reads (`.roles`,
 * `.nick`, ...) keep working - only actual `GuildMember` methods would not.
 */
export function interactionFromWebhookPayload(client: Client<true>, data: APIInteraction): Interaction {
  switch (data.type) {
    case InteractionType.ApplicationCommand:
      switch (data.data.type) {
        case ApplicationCommandType.ChatInput:
          return constructInteraction(ChatInputCommandInteraction, client, data);
        case ApplicationCommandType.User:
          return constructInteraction(UserContextMenuCommandInteraction, client, data);
        case ApplicationCommandType.Message:
          return constructInteraction(MessageContextMenuCommandInteraction, client, data);
        case ApplicationCommandType.PrimaryEntryPoint:
          return constructInteraction(PrimaryEntryPointCommandInteraction, client, data);
        default:
          throw new Error(`Unknown application command interaction type: ${(data.data as { type: unknown }).type}`);
      }
    case InteractionType.MessageComponent:
      switch (data.data.component_type) {
        case ComponentType.Button:
          return constructInteraction(ButtonInteraction, client, data);
        case ComponentType.StringSelect:
          return constructInteraction(StringSelectMenuInteraction, client, data);
        case ComponentType.UserSelect:
          return constructInteraction(UserSelectMenuInteraction, client, data);
        case ComponentType.RoleSelect:
          return constructInteraction(RoleSelectMenuInteraction, client, data);
        case ComponentType.MentionableSelect:
          return constructInteraction(MentionableSelectMenuInteraction, client, data);
        case ComponentType.ChannelSelect:
          return constructInteraction(ChannelSelectMenuInteraction, client, data);
        default:
          throw new Error(`Unknown message component interaction type: ${(data.data as { component_type: unknown }).component_type}`);
      }
    case InteractionType.ApplicationCommandAutocomplete:
      return constructInteraction(AutocompleteInteraction, client, data);
    case InteractionType.ModalSubmit:
      return constructInteraction(ModalSubmitInteraction, client, data);
    default:
      throw new Error(`Unknown interaction type: ${(data as { type: unknown }).type}`);
  }
}
