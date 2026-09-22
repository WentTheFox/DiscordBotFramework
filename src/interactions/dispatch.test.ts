import { describe, expect, it, vi } from 'vitest';
import { AutocompleteInteraction, ChatInputCommandInteraction, DiscordAPIError, MessageComponentInteraction } from 'discord.js';
import { DevNullLogger } from '../logger/dev-null-logger.js';
import { dispatchAutocomplete, dispatchChatInputCommand, dispatchComponent, isUnknownInteractionError } from './dispatch.js';
import { BotChatInputCommand, BotMessageComponent } from './types.js';

const context = { logger: new DevNullLogger() };

const unknownInteractionError = () => new DiscordAPIError(
  { message: 'Unknown interaction', code: 10062 },
  10062,
  404,
  'POST',
  'https://discord.com/api/v10/interactions/1/token/callback',
  { files: undefined, body: undefined },
);

describe('dispatchChatInputCommand', () => {
  it('invokes the matching command handler', async () => {
    const handle = vi.fn();
    const commands: Record<string, BotChatInputCommand<typeof context>> = {
      ping: { handle },
    };
    const interaction = { commandName: 'ping' } as unknown as ChatInputCommandInteraction;

    await dispatchChatInputCommand(interaction, context, { commands, onError: vi.fn() });

    expect(handle).toHaveBeenCalledWith(interaction, context);
  });

  it('calls onError when the handler throws', async () => {
    const onError = vi.fn();
    const commands: Record<string, BotChatInputCommand<typeof context>> = {
      boom: {
        handle: () => {
          throw new Error('nope');
        },
      },
    };
    const interaction = { commandName: 'boom' } as unknown as ChatInputCommandInteraction;

    await dispatchChatInputCommand(interaction, context, { commands, onError });

    expect(onError).toHaveBeenCalledWith(interaction, context, expect.any(Error));
  });

  it('logs an expired interaction as a single warning instead of calling onError', async () => {
    const onError = vi.fn();
    const warn = vi.spyOn(context.logger, 'warn');
    const error = vi.spyOn(context.logger, 'error');
    const commands: Record<string, BotChatInputCommand<typeof context>> = {
      late: {
        handle: () => {
          throw unknownInteractionError();
        },
      },
    };
    const interaction = { commandName: 'late', createdTimestamp: Date.now() - 3500 } as unknown as ChatInputCommandInteraction;

    await dispatchChatInputCommand(interaction, context, { commands, onError });

    expect(onError).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^Interaction expired .*: command interaction \(commandName=late\), age=\d+ms$/));
    warn.mockRestore();
    error.mockRestore();
  });

  it('throws for an unknown command when no onUnknownCommand is given', async () => {
    const interaction = { commandName: 'missing' } as unknown as ChatInputCommandInteraction;
    await expect(dispatchChatInputCommand(interaction, context, { commands: {}, onError: vi.fn() }))
      .rejects.toThrow(/Unknown command/);
  });
});

describe('dispatchComponent', () => {
  it('parses the customId and passes the resourceId through', async () => {
    const handle = vi.fn();
    const components: Record<string, BotMessageComponent<typeof context>> = { confirm: { handle } };
    const interaction = { customId: 'confirm:42' } as unknown as MessageComponentInteraction;

    await dispatchComponent(interaction, context, { components, onError: vi.fn() });

    expect(handle).toHaveBeenCalledWith(interaction, context, '42');
  });
});

describe('dispatchAutocomplete', () => {
  it('does not call onError for an expired interaction', async () => {
    const onError = vi.fn();
    const commands: Record<string, BotChatInputCommand<typeof context>> = {
      at: {
        handle: vi.fn(),
        autocomplete: {
          timezone: () => {
            throw unknownInteractionError();
          },
        },
      },
    };
    const interaction = {
      commandName: 'at',
      createdTimestamp: Date.now(),
      options: { getFocused: () => ({ name: 'timezone', value: '' }) },
    } as unknown as AutocompleteInteraction;

    await dispatchAutocomplete(interaction, context, { commands, onError });

    expect(onError).not.toHaveBeenCalled();
  });
});

describe('isUnknownInteractionError', () => {
  it('only matches Discord API error 10062', () => {
    expect(isUnknownInteractionError(unknownInteractionError())).toBe(true);
    expect(isUnknownInteractionError(new Error('Unknown interaction'))).toBe(false);
  });
});
