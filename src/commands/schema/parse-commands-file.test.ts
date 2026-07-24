import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { commandsFileSchema } from './commands-file.schema.js';
import { parseCommandsFile } from './parse-commands-file.js';
import { registerFrameworkSchemas } from './index.js';

function compile() {
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  registerFrameworkSchemas(ajv);
  return ajv.compile(commandsFileSchema);
}

describe('parseCommandsFile', () => {
  it('accepts a valid commands file covering every option type plus a context-menu command', () => {
    const data = [
      {
        type: 1,
        name: 'search',
        description: 'Search for something',
        options: [
          { type: 3, name: 'query', description: 'Query string', required: true, min_length: 1, max_length: 100, autocomplete: true },
          { type: 3, name: 'mode', description: 'Search mode', choices: [{ name: 'Fast', value: 'fast' }] },
          { type: 4, name: 'limit', description: 'Result limit', min_value: 1, max_value: 50 },
          { type: 10, name: 'threshold', description: 'Score threshold', min_value: 0, max_value: 1 },
          { type: 5, name: 'verbose', description: 'Verbose output' },
          { type: 6, name: 'user', description: 'Target user' },
          { type: 7, name: 'channel', description: 'Target channel', channel_types: [0, 5] },
          { type: 8, name: 'role', description: 'Target role' },
          { type: 9, name: 'mentionable', description: 'Target mentionable' },
          { type: 11, name: 'attachment', description: 'File attachment' },
        ],
      },
      {
        type: 1,
        name: 'admin',
        description: 'Admin commands',
        options: [
          {
            type: 2,
            name: 'users',
            description: 'User management',
            options: [
              {
                type: 1,
                name: 'ban',
                description: 'Ban a user',
                options: [{ type: 6, name: 'target', description: 'User to ban', required: true }],
              },
            ],
          },
        ],
      },
      { type: 2, name: 'Update Message' },
      { type: 3, name: 'Sticker Details' },
    ];

    const validate = compile();
    expect(() => parseCommandsFile(data, { validate })).not.toThrow();
  });

  it('throws listing every failing path, not just the first', () => {
    const data = [
      { type: 1 }, // missing name
      { type: 1, name: 'BadName' }, // uppercase not allowed
      { type: 1, name: 'extra', unexpectedField: true }, // additionalProperties: false
    ];

    const validate = compile();
    expect(() => parseCommandsFile(data, { validate })).toThrow(/commands\.json validation failed/);

    try {
      parseCommandsFile(data, { validate });
    } catch (error) {
      const message = (error as Error).message;
      // ajv reports oneOf mismatches per-branch, so at minimum every failing
      // top-level index should surface at least one line.
      expect(message).toMatch(/\/0/);
      expect(message).toMatch(/\/1/);
      expect(message).toMatch(/\/2/);
    }
  });

  it('rejects choices on a Boolean option', () => {
    const data = [{ type: 1, name: 'cmd', options: [{ type: 5, name: 'flag', choices: [{ name: 'a', value: 'b' }] }] }];
    const validate = compile();
    expect(() => parseCommandsFile(data, { validate })).toThrow();
  });

  it('rejects min_length on an Integer option', () => {
    const data = [{ type: 1, name: 'cmd', options: [{ type: 4, name: 'n', min_length: 1 }] }];
    const validate = compile();
    expect(() => parseCommandsFile(data, { validate })).toThrow();
  });

  it('accepts one level of subcommand-group nesting and rejects two', () => {
    const validate = compile();

    const oneLevel = [
      {
        type: 1,
        name: 'cmd',
        options: [{ type: 2, name: 'group', options: [{ type: 1, name: 'sub', options: [{ type: 6, name: 'u' }] }] }],
      },
    ];
    expect(() => parseCommandsFile(oneLevel, { validate })).not.toThrow();

    const twoLevels = [
      {
        type: 1,
        name: 'cmd',
        // a subcommand's own options may only be leaf options - nesting
        // another subcommand-group/subcommand here is invalid.
        options: [{ type: 2, name: 'group', options: [{ type: 1, name: 'sub', options: [{ type: 1, name: 'nested' }] }] }],
      },
    ];
    expect(() => parseCommandsFile(twoLevels, { validate })).toThrow();
  });

  it('rejects a description on a context-menu command', () => {
    const data = [{ type: 2, name: 'Inspect', description: 'not allowed' }];
    const validate = compile();
    expect(() => parseCommandsFile(data, { validate })).toThrow();
  });

  it('accepts UPPER_SNAKE_CASE string enum aliases everywhere the numeric form is valid', () => {
    const data = [
      {
        type: 'CHAT_INPUT',
        name: 'search',
        description: 'Search for something',
        contexts: ['GUILD', 'BOT_DM', 'PRIVATE_CHANNEL'],
        integration_types: ['GUILD_INSTALL', 'USER_INSTALL'],
        options: [
          { type: 'STRING', name: 'query', description: 'Query string', required: true },
          { type: 'CHANNEL', name: 'channel', description: 'Target channel', channel_types: ['GUILD_TEXT', 'GUILD_VOICE'] },
          {
            type: 'SUBCOMMAND_GROUP',
            name: 'group',
            description: 'Group',
            options: [{ type: 'SUBCOMMAND', name: 'sub', description: 'Sub', options: [{ type: 'BOOLEAN', name: 'flag', description: 'Flag' }] }],
          },
        ],
      },
      { type: 'MESSAGE', name: 'Inspect' },
    ];
    const validate = compile();
    expect(() => parseCommandsFile(data, { validate })).not.toThrow();
  });

  it('rejects an unknown string enum value', () => {
    const data = [{ type: 'CHAT_INPUT', name: 'search', description: 'x', options: [{ type: 'NOT_A_REAL_TYPE', name: 'query', description: 'Query' }] }];
    const validate = compile();
    expect(() => parseCommandsFile(data, { validate })).toThrow();
  });
});
