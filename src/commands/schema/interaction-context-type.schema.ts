export const interactionContextTypeSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/interaction-context-type.json',
  description:
    'InteractionContextType (discord-api-types): 0/GUILD, 1/BOT_DM, 2/PRIVATE_CHANNEL. Both the numeric value and its UPPER_SNAKE_CASE string alias (see enum-maps.ts) are always valid.',
  enum: [0, 1, 2, 'GUILD', 'BOT_DM', 'PRIVATE_CHANNEL'],
} as const;
