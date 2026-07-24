import { describe, expect, it, vi } from 'vitest';
import { createChatInputCommandRegistry, createContextMenuCommandRegistry } from '../interactions/registry.js';
import { buildApplicationCommandsBody } from './build-application-commands-body.js';
import { CommandFileEntry } from './schema/index.js';

describe('buildApplicationCommandsBody', () => {
  it('flattens a matched commands.json entry + handler into a JSON body', () => {
    const commandsFile: CommandFileEntry[] = [{ type: 1, name: 'ping', description: 'ping' }];
    const chatInput = createChatInputCommandRegistry([{ name: 'ping', handle: vi.fn() }]);

    const body = buildApplicationCommandsBody(commandsFile, { chatInput });

    expect(body).toEqual([{ type: 1, name: 'ping', description: 'ping', options: undefined }]);
  });

  it('merges sharedMetadata, letting the commands.json entry win on conflict', () => {
    const commandsFile: CommandFileEntry[] = [{ type: 1, name: 'ping', description: 'ping' }];
    const chatInput = createChatInputCommandRegistry([{ name: 'ping', handle: vi.fn() }]);

    const body = buildApplicationCommandsBody(commandsFile, { chatInput }, { sharedMetadata: { description: 'shared', contexts: [0] } });

    expect(body).toEqual([{ type: 1, name: 'ping', description: 'ping', contexts: [0], options: undefined }]);
  });

  it('filters out commands whose registerCondition returns false', () => {
    const commandsFile: CommandFileEntry[] = [
      { type: 1, name: 'always', description: 'always' },
      { type: 1, name: 'conditional', description: 'conditional' },
    ];
    const chatInput = createChatInputCommandRegistry([
      { name: 'always', handle: vi.fn() },
      { name: 'conditional', handle: vi.fn(), registerCondition: () => false },
    ]);

    const body = buildApplicationCommandsBody(commandsFile, { chatInput });

    expect(body.map((c) => c.name)).toEqual(['always']);
  });

  it('includes context-menu commands and respects their registerCondition', () => {
    const commandsFile: CommandFileEntry[] = [
      { type: 3, name: 'Report' },
      { type: 3, name: 'Hidden' },
    ];
    const contextMenu = createContextMenuCommandRegistry([
      { name: 'Report', handle: vi.fn() },
      { name: 'Hidden', handle: vi.fn(), registerCondition: () => false },
    ]);

    const body = buildApplicationCommandsBody(commandsFile, { contextMenu });

    expect(body.map((c) => c.name)).toEqual(['Report']);
  });

  it('stably sorts options so required options precede optional ones', () => {
    const commandsFile: CommandFileEntry[] = [
      {
        type: 1,
        name: 'search',
        description: 'search',
        options: [
          { name: 'sort', description: 'sort', type: 3, required: false },
          { name: 'filter', description: 'filter', type: 3, required: false },
          { name: 'query', description: 'query', type: 3, required: true },
          { name: 'limit', description: 'limit', type: 4, required: true },
        ],
      },
    ];
    const chatInput = createChatInputCommandRegistry([{ name: 'search', handle: vi.fn() }]);

    const [{ options }] = buildApplicationCommandsBody(commandsFile, { chatInput });

    expect(options?.map((o) => o.name)).toEqual(['query', 'limit', 'sort', 'filter']);
  });

  it('recursively sorts nested subcommand option arrays', () => {
    const commandsFile: CommandFileEntry[] = [
      {
        type: 1,
        name: 'settings',
        description: 'settings',
        options: [
          {
            name: 'set',
            description: 'set',
            type: 1,
            options: [
              { name: 'value', description: 'value', type: 3, required: false },
              { name: 'key', description: 'key', type: 3, required: true },
            ],
          },
        ],
      },
    ];
    const chatInput = createChatInputCommandRegistry([{ name: 'settings', handle: vi.fn() }]);

    const [{ options }] = buildApplicationCommandsBody(commandsFile, { chatInput });
    const [subcommand] = options as unknown as { options: { name: string }[] }[];

    expect(subcommand.options.map((o) => o.name)).toEqual(['key', 'value']);
  });

  it('throws when a commands.json entry has no matching handler', () => {
    const commandsFile: CommandFileEntry[] = [{ type: 1, name: 'obsolete-command', description: 'x' }];
    const chatInput = createChatInputCommandRegistry([]);

    expect(() => buildApplicationCommandsBody(commandsFile, { chatInput })).toThrow(/obsolete-command/);
  });

  it('throws when a handler has no matching commands.json entry', () => {
    const commandsFile: CommandFileEntry[] = [];
    const chatInput = createChatInputCommandRegistry([{ name: 'typo-commnad', handle: vi.fn() }]);

    expect(() => buildApplicationCommandsBody(commandsFile, { chatInput })).toThrow(/typo-commnad/);
  });

  it('throws when a command has no description and no resolveDescription hook', () => {
    const commandsFile: CommandFileEntry[] = [{ type: 1, name: 'search' }];
    const chatInput = createChatInputCommandRegistry([{ name: 'search', handle: vi.fn() }]);

    expect(() => buildApplicationCommandsBody(commandsFile, { chatInput })).toThrow(/"search" \(command\)/);
  });

  it('does not throw when description is absent but resolveDescription supplies one', () => {
    const commandsFile: CommandFileEntry[] = [{ type: 1, name: 'search' }];
    const chatInput = createChatInputCommandRegistry([{ name: 'search', handle: vi.fn() }]);

    const body = buildApplicationCommandsBody(commandsFile, { chatInput }, {
      resolveDescription: (path) => (path.join('.') === 'commands.search.description' ? 'Search for something' : undefined),
    });

    expect(body).toEqual([{ type: 1, name: 'search', description: 'Search for something', options: undefined }]);
  });

  it('throws when an option is missing a description, naming the specific option', () => {
    const commandsFile: CommandFileEntry[] = [
      { type: 1, name: 'search', description: 'search', options: [{ name: 'query', type: 3 }] },
    ];
    const chatInput = createChatInputCommandRegistry([{ name: 'search', handle: vi.fn() }]);

    expect(() => buildApplicationCommandsBody(commandsFile, { chatInput })).toThrow(/"search" > "query" \(option\)/);
  });

  it('populates name_localizations/description_localizations when hooks are supplied, omits them otherwise', () => {
    const commandsFile: CommandFileEntry[] = [{ type: 1, name: 'search', description: 'Search for something' }];
    const chatInput = createChatInputCommandRegistry([{ name: 'search', handle: vi.fn() }]);

    const withHooks = buildApplicationCommandsBody(commandsFile, { chatInput }, {
      localizeNames: () => ({ 'es-ES': 'buscar' }),
      localizeDescriptions: () => ({ 'es-ES': 'Buscar algo' }),
    });
    expect(withHooks[0].name_localizations).toEqual({ 'es-ES': 'buscar' });
    expect(withHooks[0].description_localizations).toEqual({ 'es-ES': 'Buscar algo' });

    const withoutHooks = buildApplicationCommandsBody(commandsFile, { chatInput });
    expect(withoutHooks[0]).not.toHaveProperty('name_localizations');
    expect(withoutHooks[0]).not.toHaveProperty('description_localizations');
  });

  it('omits *_localizations when the hook returns undefined rather than attaching an empty object', () => {
    const commandsFile: CommandFileEntry[] = [{ type: 1, name: 'search', description: 'Search for something' }];
    const chatInput = createChatInputCommandRegistry([{ name: 'search', handle: vi.fn() }]);

    const body = buildApplicationCommandsBody(commandsFile, { chatInput }, {
      localizeNames: () => undefined,
      localizeDescriptions: () => undefined,
    });

    expect(body[0]).not.toHaveProperty('name_localizations');
    expect(body[0]).not.toHaveProperty('description_localizations');
  });

  it('also localizes option name/description, keyed one level under the command path', () => {
    const commandsFile: CommandFileEntry[] = [
      { type: 1, name: 'search', description: 'Search for something', options: [{ name: 'query', type: 3, description: 'Query string' }] },
    ];
    const chatInput = createChatInputCommandRegistry([{ name: 'search', handle: vi.fn() }]);
    const seenPaths: string[] = [];

    const body = buildApplicationCommandsBody(commandsFile, { chatInput }, {
      localizeNames: (path) => { seenPaths.push(path.join('.')); return path.join('.') === 'commands.search.options.query.name' ? { 'es-ES': 'consulta' } : undefined; },
      localizeDescriptions: (path) => (path.join('.') === 'commands.search.options.query.description' ? { 'es-ES': 'Cadena de consulta' } : undefined),
    });

    expect(seenPaths).toContain('commands.search.options.query.name');
    const [option] = body[0].options as unknown as { name_localizations?: Record<string, string>; description_localizations?: Record<string, string> }[];
    expect(option.name_localizations).toEqual({ 'es-ES': 'consulta' });
    expect(option.description_localizations).toEqual({ 'es-ES': 'Cadena de consulta' });
  });

  it('localizes nested subcommand option names/descriptions one level deeper', () => {
    const commandsFile: CommandFileEntry[] = [
      {
        type: 1,
        name: 'settings',
        description: 'settings',
        options: [{ name: 'set', type: 1, description: 'set', options: [{ name: 'key', type: 3, description: 'key' }] }],
      },
    ];
    const chatInput = createChatInputCommandRegistry([{ name: 'settings', handle: vi.fn() }]);

    const body = buildApplicationCommandsBody(commandsFile, { chatInput }, {
      localizeDescriptions: (path) => (path.join('.') === 'commands.settings.options.set.options.key.description' ? { 'es-ES': 'Clave' } : undefined),
    });

    const [subcommand] = body[0].options as unknown as { options: { description_localizations?: Record<string, string> }[] }[];
    expect(subcommand.options[0].description_localizations).toEqual({ 'es-ES': 'Clave' });
  });

  it('accepts UPPER_SNAKE_CASE string enum aliases and resolves them to numeric values in the final body', () => {
    const commandsFile: CommandFileEntry[] = [
      {
        type: 'CHAT_INPUT',
        name: 'search',
        description: 'search',
        contexts: ['GUILD', 'BOT_DM'],
        integration_types: ['USER_INSTALL'],
        options: [
          { name: 'sort', type: 'STRING', description: 'sort', choices: [{ name: 'A', value: 'a' }] },
          { name: 'channel', type: 'CHANNEL', description: 'channel', channel_types: ['GUILD_TEXT', 'GUILD_VOICE'] },
        ],
      },
    ];
    const chatInput = createChatInputCommandRegistry([{ name: 'search', handle: vi.fn() }]);

    const [body0] = buildApplicationCommandsBody(commandsFile, { chatInput });

    expect(body0.type).toBe(1);
    expect(body0.contexts).toEqual([0, 1]);
    expect(body0.integration_types).toEqual([1]);
    expect(body0.options?.[0].type).toBe(3);
    expect(body0.options?.[1].type).toBe(7);
    expect((body0.options?.[1] as { channel_types?: number[] }).channel_types).toEqual([0, 2]);
  });

  it('accepts a mix of numeric and string enum values within the same entry', () => {
    const commandsFile: CommandFileEntry[] = [
      { type: 1, name: 'mixed', description: 'mixed', options: [{ name: 'opt', type: 'INTEGER', description: 'opt' }] },
    ];
    const chatInput = createChatInputCommandRegistry([{ name: 'mixed', handle: vi.fn() }]);

    const [body0] = buildApplicationCommandsBody(commandsFile, { chatInput });

    expect(body0.type).toBe(1);
    expect(body0.options?.[0].type).toBe(4);
  });

  it('resolves string-form context-menu type/contexts/integration_types too', () => {
    const commandsFile: CommandFileEntry[] = [
      { type: 'MESSAGE', name: 'Inspect', contexts: ['PRIVATE_CHANNEL'], integration_types: ['GUILD_INSTALL', 'USER_INSTALL'] },
    ];
    const contextMenu = createContextMenuCommandRegistry([{ name: 'Inspect', handle: vi.fn() }]);

    const [body0] = buildApplicationCommandsBody(commandsFile, { contextMenu });

    expect(body0.type).toBe(3);
    expect(body0.contexts).toEqual([2]);
    expect(body0.integration_types).toEqual([0, 1]);
  });
});
