import {
  APIChatInputApplicationCommandInteraction,
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

  it('throws a clear error for an interaction type it does not recognize', () => {
    const client = createWebhookOnlyClient({ token: 'test-token' });
    expect(() => interactionFromWebhookPayload(client, { type: 999 } as unknown as APIChatInputApplicationCommandInteraction)).toThrow(/Unknown interaction type/);
  });
});
