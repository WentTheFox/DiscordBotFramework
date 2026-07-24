import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ChannelType,
  InteractionContextType,
} from 'discord-api-types/v10';

/**
 * UPPER_SNAKE_CASE string aliases for Discord's numeric command/option enums,
 * so commands.json authors don't have to memorize what `3` means. Sourced
 * from discord-api-types' own enums (not hand-duplicated numbers) so these
 * can never drift from the real values. Both the numeric and string form are
 * always valid in commands.json - see `resolveEnumValue` - this is additive,
 * not a replacement, specifically so it never needs to be a breaking change.
 */
export const APPLICATION_COMMAND_TYPE_MAP = {
  CHAT_INPUT: ApplicationCommandType.ChatInput,
  USER: ApplicationCommandType.User,
  MESSAGE: ApplicationCommandType.Message,
} as const;

export const APPLICATION_COMMAND_OPTION_TYPE_MAP = {
  SUBCOMMAND: ApplicationCommandOptionType.Subcommand,
  SUBCOMMAND_GROUP: ApplicationCommandOptionType.SubcommandGroup,
  STRING: ApplicationCommandOptionType.String,
  INTEGER: ApplicationCommandOptionType.Integer,
  BOOLEAN: ApplicationCommandOptionType.Boolean,
  USER: ApplicationCommandOptionType.User,
  CHANNEL: ApplicationCommandOptionType.Channel,
  ROLE: ApplicationCommandOptionType.Role,
  MENTIONABLE: ApplicationCommandOptionType.Mentionable,
  NUMBER: ApplicationCommandOptionType.Number,
  ATTACHMENT: ApplicationCommandOptionType.Attachment,
} as const;

export const INTERACTION_CONTEXT_TYPE_MAP = {
  GUILD: InteractionContextType.Guild,
  BOT_DM: InteractionContextType.BotDM,
  PRIVATE_CHANNEL: InteractionContextType.PrivateChannel,
} as const;

export const APPLICATION_INTEGRATION_TYPE_MAP = {
  GUILD_INSTALL: ApplicationIntegrationType.GuildInstall,
  USER_INSTALL: ApplicationIntegrationType.UserInstall,
} as const;

/** Only the ChannelType subset Discord accepts in an option's channel_types filter - see channel-type.schema.ts. */
export const CHANNEL_TYPE_MAP = {
  GUILD_TEXT: ChannelType.GuildText,
  GUILD_VOICE: ChannelType.GuildVoice,
  GUILD_CATEGORY: ChannelType.GuildCategory,
  GUILD_ANNOUNCEMENT: ChannelType.GuildAnnouncement,
  ANNOUNCEMENT_THREAD: ChannelType.AnnouncementThread,
  PUBLIC_THREAD: ChannelType.PublicThread,
  PRIVATE_THREAD: ChannelType.PrivateThread,
  GUILD_STAGE_VOICE: ChannelType.GuildStageVoice,
  GUILD_FORUM: ChannelType.GuildForum,
  GUILD_MEDIA: ChannelType.GuildMedia,
} as const;

/** Resolves either form (already-numeric, or an UPPER_SNAKE_CASE string alias) to the real numeric Discord value. */
export function resolveEnumValue<Map extends Record<string, number>>(map: Map, value: number | keyof Map): number {
  return typeof value === 'number' ? value : map[value];
}
