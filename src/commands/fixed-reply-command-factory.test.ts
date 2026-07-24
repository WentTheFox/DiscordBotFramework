import { describe, expect, it, vi } from 'vitest';
import { MessageFlags } from 'discord-api-types/v10';
import { fixedReplyCommandFactory } from './fixed-reply-command-factory.js';

describe('fixedReplyCommandFactory', () => {
  it('returns only a handle - name/description now live in commands.json', () => {
    const command = fixedReplyCommandFactory('pong');

    expect(Object.keys(command)).toEqual(['handle']);
  });

  it('replies with the given content, non-ephemeral by default', async () => {
    const command = fixedReplyCommandFactory('pong');
    const interaction = { reply: vi.fn() };

    await command.handle(interaction as never, undefined as never);

    expect(interaction.reply).toHaveBeenCalledWith({ content: 'pong', flags: undefined });
  });

  it('replies ephemerally when requested', async () => {
    const command = fixedReplyCommandFactory('pong', true);
    const interaction = { reply: vi.fn() };

    await command.handle(interaction as never, undefined as never);

    expect(interaction.reply).toHaveBeenCalledWith({ content: 'pong', flags: MessageFlags.Ephemeral });
  });
});
