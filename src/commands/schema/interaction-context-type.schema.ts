export const interactionContextTypeSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/interaction-context-type.json',
  description: 'InteractionContextType (discord-api-types): 0 Guild, 1 BotDM, 2 PrivateChannel.',
  enum: [0, 1, 2],
} as const;
