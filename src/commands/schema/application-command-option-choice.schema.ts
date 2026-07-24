export const applicationCommandOptionChoiceSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/application-command-option-choice.json',
  description:
    'APIApplicationCommandOptionChoice (discord-api-types), English-authored only - no name_localizations here (localization is layered on separately at submission time, not authored by hand).',
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    value: { type: ['string', 'number'] },
  },
  required: ['name', 'value'],
  additionalProperties: false,
} as const;
