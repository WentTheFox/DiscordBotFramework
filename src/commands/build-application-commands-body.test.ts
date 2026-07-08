import { describe, expect, it, vi } from 'vitest';
import { ApplicationCommandOptionType, ApplicationCommandType } from 'discord-api-types/v10';
import { createChatInputCommandRegistry, createContextMenuCommandRegistry } from '../interactions/registry.js';
import { buildApplicationCommandsBody } from './build-application-commands-body.js';

describe('buildApplicationCommandsBody', () => {
  it('flattens a chat-input registry into JSON bodies', () => {
    const chatInput = createChatInputCommandRegistry([
      { name: 'ping', getDefinition: () => ({ name: 'ping', description: 'ping' }), handle: vi.fn() },
    ]);

    const body = buildApplicationCommandsBody({ chatInput });

    expect(body).toEqual([{ name: 'ping', description: 'ping' }]);
  });

  it('merges sharedMetadata, letting the definition win except for name', () => {
    const chatInput = createChatInputCommandRegistry([
      { name: 'ping', getDefinition: () => ({ name: 'not-ping', description: 'ping' }), handle: vi.fn() },
    ]);

    const body = buildApplicationCommandsBody({ chatInput }, { sharedMetadata: { description: 'shared', contexts: [0] } });

    expect(body).toEqual([{ name: 'ping', description: 'ping', contexts: [0] }]);
  });

  it('forwards definitionArg to getDefinition', () => {
    const getDefinition = vi.fn((t?: string) => ({ name: 'ping', description: t ?? 'default' }));
    const chatInput = createChatInputCommandRegistry([{ name: 'ping', getDefinition, handle: vi.fn() }]);

    buildApplicationCommandsBody({ chatInput }, { definitionArg: 'translated' });

    expect(getDefinition).toHaveBeenCalledWith('translated');
  });

  it('filters out commands whose registerCondition returns false', () => {
    const chatInput = createChatInputCommandRegistry([
      { name: 'always', getDefinition: () => ({ name: 'always', description: 'always' }), handle: vi.fn() },
      {
        name: 'conditional', getDefinition: () => ({ name: 'conditional', description: 'conditional' }), handle: vi.fn(), registerCondition: () => false,
      },
    ]);

    const body = buildApplicationCommandsBody({ chatInput });

    expect(body.map((c) => c.name)).toEqual(['always']);
  });

  it('includes context-menu commands and respects their registerCondition', () => {
    const contextMenu = createContextMenuCommandRegistry([
      { name: 'Report', getDefinition: () => ({ name: 'Report', type: ApplicationCommandType.Message }), handle: vi.fn() },
      {
        name: 'Hidden', getDefinition: () => ({ name: 'Hidden', type: ApplicationCommandType.Message }), handle: vi.fn(), registerCondition: () => false,
      },
    ]);

    const body = buildApplicationCommandsBody({ contextMenu });

    expect(body.map((c) => c.name)).toEqual(['Report']);
  });

  it('stably sorts options so required options precede optional ones', () => {
    const chatInput = createChatInputCommandRegistry([
      {
        name: 'search',
        getDefinition: () => ({
          name: 'search',
          description: 'search',
          options: [
            { name: 'sort', description: 'sort', type: ApplicationCommandOptionType.String, required: false },
            { name: 'filter', description: 'filter', type: ApplicationCommandOptionType.String, required: false },
            { name: 'query', description: 'query', type: ApplicationCommandOptionType.String, required: true },
            { name: 'limit', description: 'limit', type: ApplicationCommandOptionType.Integer, required: true },
          ],
        }),
        handle: vi.fn(),
      },
    ]);

    const [{ options }] = buildApplicationCommandsBody({ chatInput });

    expect(options?.map((o) => o.name)).toEqual(['query', 'limit', 'sort', 'filter']);
  });

  it('recursively sorts nested subcommand option arrays', () => {
    const chatInput = createChatInputCommandRegistry([
      {
        name: 'settings',
        getDefinition: () => ({
          name: 'settings',
          description: 'settings',
          options: [
            {
              name: 'set',
              description: 'set',
              type: ApplicationCommandOptionType.Subcommand,
              options: [
                { name: 'value', description: 'value', type: ApplicationCommandOptionType.String, required: false },
                { name: 'key', description: 'key', type: ApplicationCommandOptionType.String, required: true },
              ],
            },
          ],
        }),
        handle: vi.fn(),
      },
    ]);

    const [{ options }] = buildApplicationCommandsBody({ chatInput });
    const [subcommand] = options as unknown as { options: { name: string }[] }[];

    expect(subcommand.options.map((o) => o.name)).toEqual(['key', 'value']);
  });
});
