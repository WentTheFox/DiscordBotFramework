import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { DevNullLogger } from '../logger/dev-null-logger.js';
import {
  createChatInputCommandRegistry,
  createComponentRegistry,
  createContextMenuCommandRegistry,
  createModalRegistry,
  flattenCommandModals,
  NamedChatInputCommand,
  Registry,
} from './registry.js';

const context = { logger: new DevNullLogger() };
type Ctx = typeof context;

describe('createChatInputCommandRegistry', () => {
  it('builds byName/names/isKnown from an array of named commands', () => {
    const ping: NamedChatInputCommand<Ctx, 'ping'> = { name: 'ping', getDefinition: () => ({ name: 'ping', description: 'ping' }), handle: vi.fn() };
    const pong: NamedChatInputCommand<Ctx, 'pong'> = { name: 'pong', getDefinition: () => ({ name: 'pong', description: 'pong' }), handle: vi.fn() };

    const registry = createChatInputCommandRegistry([ping, pong]);

    expect(registry.byName.ping).toBe(ping);
    expect(registry.byName.pong).toBe(pong);
    expect(registry.names).toEqual(['ping', 'pong']);
    expect(registry.isKnown('ping')).toBe(true);
    expect(registry.isKnown('missing')).toBe(false);

    expectTypeOf(registry).toEqualTypeOf<Registry<'ping' | 'pong', typeof ping | typeof pong>>();
  });

  it('throws on duplicate names', () => {
    const a: NamedChatInputCommand<Ctx, 'dup'> = { name: 'dup', getDefinition: () => ({ name: 'dup', description: 'a' }), handle: vi.fn() };
    const b: NamedChatInputCommand<Ctx, 'dup'> = { name: 'dup', getDefinition: () => ({ name: 'dup', description: 'b' }), handle: vi.fn() };

    expect(() => createChatInputCommandRegistry([a, b])).toThrow(/Duplicate registry key "dup"/);
  });
});

describe('createContextMenuCommandRegistry', () => {
  it('keys by name', () => {
    const registry = createContextMenuCommandRegistry([
      { name: 'Report', getDefinition: () => ({ name: 'Report', type: 3 as never }), handle: vi.fn() },
    ]);
    expect(registry.isKnown('Report')).toBe(true);
  });
});

describe('createComponentRegistry', () => {
  it('keys by id and supports many-to-one handlers', () => {
    const sharedHandle = vi.fn();
    const registry = createComponentRegistry([
      { id: 'nick-format-brackets', handle: sharedHandle },
      { id: 'nick-format-pipe', handle: sharedHandle },
    ]);

    expect(registry.byName['nick-format-brackets'].handle).toBe(sharedHandle);
    expect(registry.byName['nick-format-pipe'].handle).toBe(sharedHandle);
    expect(registry.names).toEqual(['nick-format-brackets', 'nick-format-pipe']);
  });
});

describe('createModalRegistry', () => {
  it('keys by id', () => {
    const registry = createModalRegistry([{ id: 'create-sticker', handle: vi.fn() }]);
    expect(registry.isKnown('create-sticker')).toBe(true);
  });
});

describe('flattenCommandModals', () => {
  it('flattens each command\'s nested modal map into a flat id -> handler registry', async () => {
    const createStickerModalHandle = vi.fn();
    const deleteStickerModalHandle = vi.fn();
    const chatInputRegistry = createChatInputCommandRegistry([
      {
        name: 'create-sticker',
        getDefinition: () => ({ name: 'create-sticker', description: 'create' }),
        handle: vi.fn(),
        modal: { 'create-sticker-modal': createStickerModalHandle },
      },
      {
        name: 'delete-sticker',
        getDefinition: () => ({ name: 'delete-sticker', description: 'delete' }),
        handle: vi.fn(),
        modal: { 'delete-sticker-modal': deleteStickerModalHandle },
      },
      {
        name: 'ping',
        getDefinition: () => ({ name: 'ping', description: 'ping' }),
        handle: vi.fn(),
      },
    ]);

    const modals = flattenCommandModals(chatInputRegistry);

    expect(modals.names).toEqual(['create-sticker-modal', 'delete-sticker-modal']);
    expect(modals.byName['create-sticker-modal'].handle).toBe(createStickerModalHandle);
    expect(modals.byName['delete-sticker-modal'].handle).toBe(deleteStickerModalHandle);

    const interaction = {} as never;
    await modals.byName['create-sticker-modal'].handle(interaction, context, undefined);
    expect(createStickerModalHandle).toHaveBeenCalledWith(interaction, context, undefined);
  });

  it('produces an empty registry when no commands declare modals', () => {
    const chatInputRegistry = createChatInputCommandRegistry([
      { name: 'ping', getDefinition: () => ({ name: 'ping', description: 'ping' }), handle: vi.fn() },
    ]);

    const modals = flattenCommandModals(chatInputRegistry);

    expect(modals.names).toEqual([]);
  });
});
