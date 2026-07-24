export const applicationIntegrationTypeSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/application-integration-type.json',
  description:
    'ApplicationIntegrationType (discord-api-types): 0/GUILD_INSTALL, 1/USER_INSTALL. Both the numeric value and its UPPER_SNAKE_CASE string alias (see enum-maps.ts) are always valid.',
  enum: [0, 1, 'GUILD_INSTALL', 'USER_INSTALL'],
} as const;
