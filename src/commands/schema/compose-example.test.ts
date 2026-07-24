import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { registerFrameworkSchemas } from './index.js';

/**
 * Proves the "framework ships generic fragments, bots compose their own
 * whole-file schema on top" promise actually works end to end with a real
 * ajv instance - not just in documentation prose. Mirrors the README's
 * bot-composition example.
 */
describe('bot-side schema composition', () => {
  const botCommandsSchema = {
    $id: 'https://schema.example-bot.test/commands-file.json',
    type: 'array',
    items: {
      oneOf: [
        {
          allOf: [
            { $ref: 'https://schema.went.tf/discord-bot-framework/chat-input-command.json' },
            { properties: { name: { enum: ['ping', 'search'] } } },
          ],
        },
        { $ref: 'https://schema.went.tf/discord-bot-framework/context-menu-command.json' },
      ],
    },
  } as const;

  function compileBotSchema() {
    const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
    registerFrameworkSchemas(ajv);
    return ajv.compile(botCommandsSchema);
  }

  it('accepts a command whose name is in the bot-narrowed enum', () => {
    const validate = compileBotSchema();
    const data = [{ type: 1, name: 'ping', description: 'Replies with pong' }];
    expect(validate(data)).toBe(true);
  });

  it('rejects a command whose name is not in the bot-narrowed enum, even though it is valid per the base fragment', () => {
    const validate = compileBotSchema();
    const data = [{ type: 1, name: 'not-a-real-command', description: 'Valid per the base schema, not per the bot schema' }];
    expect(validate(data)).toBe(false);
  });

  it('still enforces the base fragment structural rules (e.g. additionalProperties)', () => {
    const validate = compileBotSchema();
    const data = [{ type: 1, name: 'ping', description: 'ok', unexpectedField: true }];
    expect(validate(data)).toBe(false);
  });
});
