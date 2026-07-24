export const optionNameSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/option-name.json',
  description:
    "Discord's name pattern for CHAT_INPUT commands, subcommands, subcommand groups, and every option name - always lowercase regardless of the parent command's own type. Discord's real rule permits non-Latin scripts (Devanagari, Thai, any lowercase/caseless Unicode letter) via \\p{} regex classes, but JSON Schema's `pattern` keyword has no way to request the `u` RegExp flag those classes require, and ajv compiles patterns without it by default - so this is deliberately narrowed to ASCII lowercase/digits/hyphen/underscore. Bots needing non-Latin command/option names can loosen this in their own composed schema.",
  type: 'string',
  pattern: '^[-_a-z0-9]{1,32}$',
} as const;
