export const channelTypeSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/channel-type.json',
  description:
    'ApplicationCommandOptionAllowedChannelType (discord-api-types): ChannelType excluding DM (1), GroupDM (3), GuildDirectory (14) - the subset Discord accepts in a Channel option\'s channel_types filter. Both the numeric value and its UPPER_SNAKE_CASE string alias (see enum-maps.ts) are always valid.',
  enum: [
    0, 2, 4, 5, 10, 11, 12, 13, 15, 16,
    'GUILD_TEXT', 'GUILD_VOICE', 'GUILD_CATEGORY', 'GUILD_ANNOUNCEMENT', 'ANNOUNCEMENT_THREAD',
    'PUBLIC_THREAD', 'PRIVATE_THREAD', 'GUILD_STAGE_VOICE', 'GUILD_FORUM', 'GUILD_MEDIA',
  ],
} as const;
