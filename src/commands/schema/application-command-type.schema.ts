export const applicationCommandTypeSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/application-command-type.json',
  description: 'ApplicationCommandType (discord-api-types). PrimaryEntryPoint (4) is intentionally excluded - no supported bot uses Activities.',
  enum: [1, 2, 3],
} as const;
