import { HTTPError, Message, Routes } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { createWebhookOnlyClient, isInteractionCallbackRoute } from './create-webhook-only-client.js';

function createClientAnswering503() {
  const requestedUrls: string[] = [];
  const client = createWebhookOnlyClient({
    token: 'token',
    rest: {
      makeRequest: async (url) => {
        requestedUrls.push(url);
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      },
    },
  });
  return { client, requestedUrls };
}

describe('isInteractionCallbackRoute', () => {
  it('matches only the interaction callback route', () => {
    expect(isInteractionCallbackRoute(Routes.interactionCallback('1554118919042900030', 'aW50ZXJhY3Rpb24'))).toBe(true);
    expect(isInteractionCallbackRoute(Routes.webhook('1', 'aW50ZXJhY3Rpb24'))).toBe(false);
    expect(isInteractionCallbackRoute(Routes.webhookMessage('1', 'aW50ZXJhY3Rpb24', '@original'))).toBe(false);
  });
});

describe('createWebhookOnlyClient', () => {
  const messageWithOwnReaction = {
    id: '1',
    channel_id: '2',
    content: 'x',
    author: { id: '3', username: 'a' },
    attachments: [],
    embeds: [],
    mentions: [],
    mention_roles: [],
    pinned: false,
    type: 0,
    timestamp: new Date().toISOString(),
    reactions: [{ emoji: { name: '👍', id: null }, count: 1, me: true }],
  };

  it('leaves client.user null without an applicationId', () => {
    const client = createWebhookOnlyClient({ token: 'token' });

    expect(client.user).toBeNull();
    expect(() => new Message(client, messageWithOwnReaction as never)).toThrow(TypeError);
  });

  it('sets client.user from applicationId so messages with the bot\'s own reaction construct', () => {
    const client = createWebhookOnlyClient({ token: 'token', applicationId: '123' });

    expect(client.user.id).toBe('123');
    expect(new Message(client, messageWithOwnReaction as never).reactions.cache.size).toBe(1);
  });

  // HTTPError is discord.js's own copy of @discordjs/rest's, which dispatch's 5xx check relies on
  it('does not retry a failed interaction callback', async () => {
    const { client, requestedUrls } = createClientAnswering503();

    await expect(client.rest.post(Routes.interactionCallback('1554118919042900030', 'aW50ZXJhY3Rpb24'), { body: { type: 5 }, auth: false }))
      .rejects.toBeInstanceOf(HTTPError);
    expect(requestedUrls).toHaveLength(1);
  });

  it('keeps the usual retries for other requests', async () => {
    const { client, requestedUrls } = createClientAnswering503();

    await expect(client.rest.post(Routes.webhook('1', 'aW50ZXJhY3Rpb24'), { body: { content: 'hi' } }))
      .rejects.toBeInstanceOf(HTTPError);
    expect(requestedUrls).toHaveLength(4);
  });
});
