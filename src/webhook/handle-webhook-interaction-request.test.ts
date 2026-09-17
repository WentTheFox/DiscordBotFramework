import { generateKeyPairSync, sign } from 'node:crypto';
import { InteractionResponseType, InteractionType } from 'discord-api-types/v10';
import { describe, expect, it, vi } from 'vitest';
import { DevNullLogger } from '../logger/dev-null-logger.js';
import { handleWebhookInteractionRequest } from './handle-webhook-interaction-request.js';

function generateKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPublicKeyHex = (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).subarray(-32).toString('hex');
  return { rawPublicKeyHex, privateKey };
}

function signedRequest(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], rawBody: string) {
  const timestamp = '1700000000';
  const signature = sign(null, Buffer.concat([Buffer.from(timestamp), Buffer.from(rawBody)]), privateKey).toString('hex');
  return { signature, timestamp, rawBody };
}

describe('handleWebhookInteractionRequest', () => {
  it('rejects a request with an invalid signature without calling onInteraction', async () => {
    const { rawPublicKeyHex } = generateKeys();
    const onInteraction = vi.fn();

    const result = await handleWebhookInteractionRequest(
      { signature: 'not-valid', timestamp: '1700000000', rawBody: '{"type":1}' },
      { publicKey: rawPublicKeyHex, logger: new DevNullLogger(), onInteraction },
    );

    expect(result.status).toBe(401);
    expect(onInteraction).not.toHaveBeenCalled();
  });

  it('answers a PING with a PONG without calling onInteraction', async () => {
    const { rawPublicKeyHex, privateKey } = generateKeys();
    const onInteraction = vi.fn();
    const request = signedRequest(privateKey, JSON.stringify({ type: InteractionType.Ping }));

    const result = await handleWebhookInteractionRequest(request, { publicKey: rawPublicKeyHex, logger: new DevNullLogger(), onInteraction });

    expect(result).toEqual({ status: 200, body: { type: InteractionResponseType.Pong } });
    expect(onInteraction).not.toHaveBeenCalled();
  });

  it('passes a validly signed non-PING interaction to onInteraction and relays its response', async () => {
    const { rawPublicKeyHex, privateKey } = generateKeys();
    const interactionPayload = { type: InteractionType.ApplicationCommand, id: '123' };
    const request = signedRequest(privateKey, JSON.stringify(interactionPayload));
    const responseBody = { type: InteractionResponseType.ChannelMessageWithSource, data: { content: 'pong' } };
    const onInteraction = vi.fn().mockResolvedValue(responseBody);

    const result = await handleWebhookInteractionRequest(request, { publicKey: rawPublicKeyHex, logger: new DevNullLogger(), onInteraction });

    expect(onInteraction).toHaveBeenCalledWith(expect.objectContaining(interactionPayload));
    expect(result).toEqual({ status: 200, body: responseBody });
  });

  it('returns 400 for a validly signed but unparseable body', async () => {
    const { rawPublicKeyHex, privateKey } = generateKeys();
    const request = signedRequest(privateKey, 'not json');

    const result = await handleWebhookInteractionRequest(request, { publicKey: rawPublicKeyHex, logger: new DevNullLogger(), onInteraction: vi.fn() });

    expect(result.status).toBe(400);
  });

  it('returns 500 if onInteraction throws', async () => {
    const { rawPublicKeyHex, privateKey } = generateKeys();
    const request = signedRequest(privateKey, JSON.stringify({ type: InteractionType.ApplicationCommand, id: '123' }));
    const onInteraction = vi.fn().mockRejectedValue(new Error('boom'));

    const result = await handleWebhookInteractionRequest(request, { publicKey: rawPublicKeyHex, logger: new DevNullLogger(), onInteraction });

    expect(result.status).toBe(500);
  });
});
