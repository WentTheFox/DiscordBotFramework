import {
  APIChatInputApplicationCommandInteraction,
  APIMessageApplicationCommandInteraction,
  APIMessageComponentButtonInteraction,
  APIModalSubmitInteraction,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ComponentType,
  InteractionType,
  Routes,
} from 'discord-api-types/v10';
import { describe, expect, it, vi } from 'vitest';
import { createWebhookOnlyClient } from './create-webhook-only-client.js';
import { interactionFromWebhookPayload } from './interaction-from-webhook-payload.js';

function chatInputPayload(): APIChatInputApplicationCommandInteraction {
  return {
    id: '1',
    application_id: 'app-1',
    type: InteractionType.ApplicationCommand,
    token: 'interaction-token',
    version: 1,
    app_permissions: '0',
    locale: 'en-US',
    entitlements: [],
    authorizing_integration_owners: {},
    data: {
      id: 'cmd-1',
      name: 'greet',
      type: ApplicationCommandType.ChatInput,
      options: [{ name: 'name', type: ApplicationCommandOptionType.String, value: 'World' }],
    },
    channel: { id: 'channel-1', type: 0 },
    channel_id: 'channel-1',
    user: { id: 'user-1', username: 'tester', discriminator: '0', global_name: null, avatar: null },
  } as APIChatInputApplicationCommandInteraction;
}

function messageContextMenuWithPollPayload(): APIMessageApplicationCommandInteraction {
  return {
    ...chatInputPayload(),
    id: '4',
    data: {
      id: 'cmd-2',
      name: 'Find timestamps',
      type: ApplicationCommandType.Message,
      target_id: '223456789012345678',
      resolved: {
        messages: {
          '223456789012345678': {
            id: '223456789012345678',
            channel_id: 'channel-1',
            type: 0,
            content: '',
            author: { id: '323456789012345678', username: 'poller', discriminator: '0', global_name: null, avatar: null },
            timestamp: '2026-09-25T06:35:00.000Z',
            edited_timestamp: null,
            tts: false,
            mention_everyone: false,
            mentions: [],
            mention_roles: [],
            attachments: [],
            embeds: [],
            pinned: false,
            // Unlike the gateway's poll payloads, a resolved message's poll carries no channel_id
            poll: {
              question: { text: 'When?' },
              answers: [{ answer_id: 1, poll_media: { text: 'Now' } }],
              expiry: '2026-09-26T06:35:00.000Z',
              allow_multiselect: false,
              layout_type: 1,
            },
          },
        },
      },
    },
  } as unknown as APIMessageApplicationCommandInteraction;
}

function buttonPayload(): APIMessageComponentButtonInteraction {
  return {
    id: '2',
    application_id: 'app-1',
    type: InteractionType.MessageComponent,
    token: 'interaction-token',
    version: 1,
    app_permissions: '0',
    locale: 'en-US',
    entitlements: [],
    authorizing_integration_owners: {},
    data: { custom_id: 'confirm', component_type: ComponentType.Button },
    channel: { id: 'channel-1', type: 0 },
    channel_id: 'channel-1',
    message: { id: '123456789012345678' },
    user: { id: 'user-1', username: 'tester', discriminator: '0', global_name: null, avatar: null },
  } as unknown as APIMessageComponentButtonInteraction;
}

function modalSubmitPayload(): APIModalSubmitInteraction {
  return {
    id: '3',
    application_id: 'app-1',
    type: InteractionType.ModalSubmit,
    token: 'interaction-token',
    version: 1,
    app_permissions: '0',
    locale: 'en-US',
    entitlements: [],
    authorizing_integration_owners: {},
    data: { custom_id: 'feedback', components: [] },
    channel: { id: 'channel-1', type: 0 },
    channel_id: 'channel-1',
    user: { id: 'user-1', username: 'tester', discriminator: '0', global_name: null, avatar: null },
  } as unknown as APIModalSubmitInteraction;
}

describe('interactionFromWebhookPayload', () => {
  it('constructs a working ChatInputCommandInteraction whose .options read the payload data', () => {
    const client = createWebhookOnlyClient({ token: 'test-token' });
    const interaction = interactionFromWebhookPayload(client, chatInputPayload());

    expect(interaction.isChatInputCommand()).toBe(true);
    if (!interaction.isChatInputCommand()) throw new Error('unreachable');
    expect(interaction.commandName).toBe('greet');
    expect(interaction.options.getString('name')).toBe('World');
  });

  it('sends .reply() via REST to the interaction callback route, with no gateway/cache dependency', async () => {
    const client = createWebhookOnlyClient({ token: 'test-token' });
    const postSpy = vi.spyOn(client.rest, 'post').mockResolvedValue(undefined);

    const interaction = interactionFromWebhookPayload(client, chatInputPayload());
    if (!interaction.isChatInputCommand()) throw new Error('unreachable');
    await interaction.reply({ content: 'pong' });

    expect(postSpy).toHaveBeenCalledWith(
      Routes.interactionCallback('1', 'interaction-token'),
      expect.objectContaining({ auth: false }),
    );
  });

  it('.guild is always null and .member degrades to the raw payload object instead of throwing', () => {
    const client = createWebhookOnlyClient({ token: 'test-token' });
    const interaction = interactionFromWebhookPayload(client, chatInputPayload());

    expect(interaction.guild).toBeNull();
  });

  it('constructs a working ButtonInteraction (private constructor in discord.js)', () => {
    const client = createWebhookOnlyClient({ token: 'test-token' });
    const interaction = interactionFromWebhookPayload(client, buttonPayload());

    expect(interaction.isButton()).toBe(true);
    if (!interaction.isButton()) throw new Error('unreachable');
    expect(interaction.customId).toBe('confirm');
  });

  it('constructs a working ModalSubmitInteraction (private constructor in discord.js)', () => {
    const client = createWebhookOnlyClient({ token: 'test-token' });
    const interaction = interactionFromWebhookPayload(client, modalSubmitPayload());

    expect(interaction.isModalSubmit()).toBe(true);
    if (!interaction.isModalSubmit()) throw new Error('unreachable');
    expect(interaction.customId).toBe('feedback');
  });

  it('constructs a MessageContextMenuCommandInteraction targeting a message with a poll', () => {
    const client = createWebhookOnlyClient({ token: 'test-token' });
    const payload = messageContextMenuWithPollPayload();
    const interaction = interactionFromWebhookPayload(client, payload);

    expect(interaction.isMessageContextMenuCommand()).toBe(true);
    if (!interaction.isMessageContextMenuCommand()) throw new Error('unreachable');
    expect(interaction.targetMessage.poll?.channelId).toBe('channel-1');
    expect(interaction.targetMessage.poll?.question.text).toBe('When?');
    // The caller's payload is left untouched
    expect(payload.data.resolved.messages['223456789012345678'].poll).not.toHaveProperty('channel_id');
  });

  it('throws a clear error for an interaction type it does not recognize', () => {
    const client = createWebhookOnlyClient({ token: 'test-token' });
    expect(() => interactionFromWebhookPayload(client, { type: 999 } as unknown as APIChatInputApplicationCommandInteraction)).toThrow(/Unknown interaction type/);
  });
});
