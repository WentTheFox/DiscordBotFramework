import { describe, expect, it, vi } from 'vitest';
import { ChatInputCommandInteraction, MessageComponentInteraction } from 'discord.js';
import { DevNullLogger } from '../logger/dev-null-logger.js';
import { dispatchChatInputCommand, dispatchComponent } from './dispatch.js';
import { BotChatInputCommand, BotMessageComponent } from './types.js';

const context = { logger: new DevNullLogger() };

describe('dispatchChatInputCommand', () => {
  it('invokes the matching command handler', async () => {
    const handle = vi.fn();
    const commands: Record<string, BotChatInputCommand<typeof context>> = {
      ping: { getDefinition: () => ({ name: 'ping', description: 'ping' }), handle },
    };
    const interaction = { commandName: 'ping' } as unknown as ChatInputCommandInteraction;

    await dispatchChatInputCommand(interaction, context, { commands, onError: vi.fn() });

    expect(handle).toHaveBeenCalledWith(interaction, context);
  });

  it('calls onError when the handler throws', async () => {
    const onError = vi.fn();
    const commands: Record<string, BotChatInputCommand<typeof context>> = {
      boom: {
        getDefinition: () => ({ name: 'boom', description: 'boom' }),
        handle: () => {
          throw new Error('nope');
        },
      },
    };
    const interaction = { commandName: 'boom' } as unknown as ChatInputCommandInteraction;

    await dispatchChatInputCommand(interaction, context, { commands, onError });

    expect(onError).toHaveBeenCalledWith(interaction, context, expect.any(Error));
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
