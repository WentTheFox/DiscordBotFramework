import { commandFileEntrySchema } from './command-file-entry.schema.js';

/**
 * The framework's base whole-file fragment: either a flat array mirroring
 * Discord's bulk-overwrite PUT body shape directly, or that same array
 * wrapped as `{ $schema?, commands }`. The wrapped form exists because a
 * bare JSON array can never carry an inline `$schema` property - `$schema`
 * is only valid on a JSON object - so editors (VS Code, JetBrains, ...) have
 * no way to offer autocomplete/validation while hand-editing a bare-array
 * commands.json. Wrapping it as an object lets `"$schema": "./commands.schema.json"`
 * point straight at a bot's own composed schema file with zero extra editor
 * config. Both forms are permanently supported - the bare array isn't going
 * away, this is additive.
 *
 * Usable directly by bots with no extra constraints, or as the thing a bot's
 * own commands.schema composes over (e.g. narrowing `name` to an enum of its
 * actual command names) via allOf/$ref - see the README's `$defs`-based
 * recipe for composing both the name-narrowing and the dual-root-shape at
 * once, since a bot's own commands.schema.json is authored as plain JSON,
 * not through this package's TS fragment-composition tooling.
 */
export const commandsFileSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/commands-file.json',
  oneOf: [
    { type: 'array', items: { $ref: commandFileEntrySchema.$id } },
    {
      type: 'object',
      properties: {
        $schema: { type: 'string' },
        commands: { type: 'array', items: { $ref: commandFileEntrySchema.$id } },
      },
      required: ['commands'],
      additionalProperties: false,
    },
  ],
} as const;
