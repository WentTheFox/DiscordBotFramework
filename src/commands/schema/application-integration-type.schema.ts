export const applicationIntegrationTypeSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/application-integration-type.json',
  description: 'ApplicationIntegrationType (discord-api-types): 0 GuildInstall, 1 UserInstall.',
  enum: [0, 1],
} as const;
