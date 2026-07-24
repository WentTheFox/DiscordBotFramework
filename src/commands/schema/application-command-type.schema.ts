export const applicationCommandTypeSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/application-command-type.json',
  description:
    'ApplicationCommandType (discord-api-types). PrimaryEntryPoint (4) is intentionally excluded - no supported bot uses Activities. Both the numeric value and its UPPER_SNAKE_CASE string alias (see enum-maps.ts) are always valid.',
  enum: [1, 2, 3, 'CHAT_INPUT', 'USER', 'MESSAGE'],
} as const;
