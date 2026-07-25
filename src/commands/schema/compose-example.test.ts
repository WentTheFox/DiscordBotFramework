import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { registerFrameworkSchemas, resolveCommandsSchemaRefs } from './index.js';

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

/**
 * A bot's commands.schema.json is authored as plain JSON (so external tools
 * can consume it too), not through this package's TS fragment-composition
 * helpers - so combining name-narrowing with the object-wrapped `{ $schema?,
 * commands }` root shape (see commands-file.schema.ts) uses a local `$defs`
 * entry referenced from both root-shape branches, not a framework-provided
 * composition function. Proves that recipe (documented in the README) really
 * validates both root shapes against the same narrowed entry.
 */
describe('bot-side schema composition with the object-wrapped root shape', () => {
  const botCommandsSchema = {
    $id: 'https://schema.example-bot.test/commands-file-with-schema-key.json',
    $defs: {
      entry: {
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
    },
    oneOf: [
      { type: 'array', items: { $ref: '#/$defs/entry' } },
      {
        type: 'object',
        properties: {
          $schema: { type: 'string' },
          commands: { type: 'array', items: { $ref: '#/$defs/entry' } },
        },
        required: ['commands'],
        additionalProperties: false,
      },
    ],
  } as const;

  function compileBotSchema() {
    const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
    registerFrameworkSchemas(ajv);
    return ajv.compile(botCommandsSchema);
  }

  it('accepts the bare array form, still enforcing the narrowed name enum', () => {
    const validate = compileBotSchema();
    expect(validate([{ type: 1, name: 'ping', description: 'Replies with pong' }])).toBe(true);
    expect(validate([{ type: 1, name: 'not-a-real-command', description: 'x' }])).toBe(false);
  });

  it('accepts the object-wrapped form with $schema, enforcing the same narrowed name enum', () => {
    const validate = compileBotSchema();
    const valid = { $schema: './commands.schema.json', commands: [{ type: 1, name: 'search', description: 'Search for something' }] };
    const invalid = { $schema: './commands.schema.json', commands: [{ type: 1, name: 'not-a-real-command', description: 'x' }] };
    expect(validate(valid)).toBe(true);
    expect(validate(invalid)).toBe(false);
  });
});

/**
 * Proves bots can `$ref` fragments by a real, locally-resolvable relative
 * filesystem path (the form an editor can actually follow for autocomplete)
 * and still have it validate correctly at runtime, via
 * `resolveCommandsSchemaRefs()` rewriting those paths to each fragment's
 * canonical `$id` by filename before `ajv.compile()`. This is deliberately
 * NOT implemented via ajv's own relative-`$ref` URI resolution (an earlier
 * version tried that, registering fragments under their real `file://`
 * location computed from `import.meta.url`) - confirmed broken for every
 * pnpm install, not just local dev: pnpm always symlinks packages from its
 * `.pnpm` virtual store into `node_modules`, and Node's ESM loader resolves
 * `import.meta.url` through that symlink to the real store path, which a
 * bot's own relative `$ref` (correctly resolved against its own real,
 * unrelated location) can never independently compute to match.
 */
describe('bot-side schema composition using a real relative-path $ref', () => {
  it('resolveCommandsSchemaRefs rewrites relative-path refs to their canonical $id, regardless of the exact relative prefix used', () => {
    const botCommandsSchema = {
      type: 'array',
      items: {
        oneOf: [
          {
            allOf: [
              { $ref: '../node_modules/@went.tf/discord-bot-framework/build/commands/schema/chat-input-command.json' },
              { properties: { name: { enum: ['ping'] } } },
            ],
          },
          { $ref: '../../some/other/nesting/node_modules/@went.tf/discord-bot-framework/build/commands/schema/context-menu-command.json' },
        ],
      },
    };

    const resolved = resolveCommandsSchemaRefs(botCommandsSchema);

    const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
    registerFrameworkSchemas(ajv);
    const validate = ajv.compile(resolved);

    expect(validate([{ type: 1, name: 'ping', description: 'Replies with pong' }])).toBe(true);
    expect(validate([{ type: 1, name: 'not-ping', description: 'x' }])).toBe(false);
    expect(validate([{ type: 3, name: 'Inspect' }])).toBe(true);
  });

  it('leaves local $refs (e.g. #/$defs/...) untouched', () => {
    const botCommandsSchema = {
      $defs: { entry: { $ref: '../node_modules/@went.tf/discord-bot-framework/build/commands/schema/chat-input-command.json' } },
      type: 'array',
      items: { $ref: '#/$defs/entry' },
    };

    const resolved = resolveCommandsSchemaRefs(botCommandsSchema);

    const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
    registerFrameworkSchemas(ajv);
    const validate = ajv.compile(resolved);

    expect(validate([{ type: 1, name: 'anything', description: 'ok' }])).toBe(true);
  });
});
