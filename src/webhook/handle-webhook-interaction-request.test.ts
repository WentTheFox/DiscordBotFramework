import { createHash, generateKeyPairSync, sign } from 'node:crypto';
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

  it('logs signature-rejection diagnostics, preferring cf-connecting-ip over x-forwarded-for', async () => {
    const { rawPublicKeyHex } = generateKeys();
    const logger = new DevNullLogger();
    const debugSpy = vi.spyOn(logger, 'debug');

    await handleWebhookInteractionRequest(
      {
        signature: 'not-valid',
        timestamp: '1700000000',
        rawBody: '{"type":1}',
        headers: {
          'cf-connecting-ip': '203.0.113.1',
          'x-forwarded-for': '198.51.100.9, 10.0.0.1',
          'user-agent': 'curl/8.0',
        },
      },
      { publicKey: rawPublicKeyHex, logger, onInteraction: vi.fn() },
    );

    expect(debugSpy).toHaveBeenCalledWith(
      'Webhook interaction signature-rejection diagnostics',
      expect.objectContaining({
        sourceIp: '203.0.113.1',
        userAgent: 'curl/8.0',
        hasSignatureHeader: true,
        hasTimestampHeader: true,
        signatureLength: 'not-valid'.length,
        bodyLength: Buffer.byteLength('{"type":1}'),
      }),
    );
  });

  it('falls back to x-forwarded-for, and reports absent headers correctly', async () => {
    const { rawPublicKeyHex } = generateKeys();
    const logger = new DevNullLogger();
    const debugSpy = vi.spyOn(logger, 'debug');

    await handleWebhookInteractionRequest(
      { signature: undefined, timestamp: undefined, rawBody: '', headers: { 'x-forwarded-for': '198.51.100.9, 10.0.0.1' } },
      { publicKey: rawPublicKeyHex, logger, onInteraction: vi.fn() },
    );

    expect(debugSpy).toHaveBeenCalledWith(
      'Webhook interaction signature-rejection diagnostics',
      expect.objectContaining({
        sourceIp: '198.51.100.9',
        userAgent: undefined,
        hasSignatureHeader: false,
        hasTimestampHeader: false,
        signatureLength: 0,
        bodyLength: 0,
      }),
    );
  });

  it('omits signature/timestamp/body content from diagnostics by default', async () => {
    const { rawPublicKeyHex } = generateKeys();
    const logger = new DevNullLogger();
    const debugSpy = vi.spyOn(logger, 'debug');

    await handleWebhookInteractionRequest(
      { signature: 'not-valid', timestamp: '1700000000', rawBody: '{"type":1,"id":"999"}' },
      { publicKey: rawPublicKeyHex, logger, onInteraction: vi.fn() },
    );

    const [, diagnostics] = debugSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(diagnostics).not.toHaveProperty('signature');
    expect(diagnostics).not.toHaveProperty('timestamp');
    expect(diagnostics).not.toHaveProperty('bodyHash');
    expect(diagnostics).not.toHaveProperty('bodyType');
    expect(diagnostics).not.toHaveProperty('bodyId');
  });

  it('includes signature/timestamp/bodyHash/type/id when verboseSignatureDiagnostics is enabled', async () => {
    const { rawPublicKeyHex } = generateKeys();
    const logger = new DevNullLogger();
    const debugSpy = vi.spyOn(logger, 'debug');
    const rawBody = '{"type":1,"id":"999"}';

    await handleWebhookInteractionRequest(
      { signature: 'not-valid', timestamp: '1700000000', rawBody },
      { publicKey: rawPublicKeyHex, logger, onInteraction: vi.fn(), verboseSignatureDiagnostics: true },
    );

    expect(debugSpy).toHaveBeenCalledWith(
      'Webhook interaction signature-rejection diagnostics',
      expect.objectContaining({
        signature: 'not-valid',
        timestamp: '1700000000',
        bodyHash: createHash('sha256').update(rawBody).digest('hex'),
        bodyType: 1,
        bodyId: '999',
      }),
    );
  });

  it('leaves bodyType/bodyId undefined for verbose diagnostics when the body is not JSON', async () => {
    const { rawPublicKeyHex } = generateKeys();
    const logger = new DevNullLogger();
    const debugSpy = vi.spyOn(logger, 'debug');

    await handleWebhookInteractionRequest(
      { signature: 'not-valid', timestamp: '1700000000', rawBody: 'not json' },
      { publicKey: rawPublicKeyHex, logger, onInteraction: vi.fn(), verboseSignatureDiagnostics: true },
    );

    expect(debugSpy).toHaveBeenCalledWith(
      'Webhook interaction signature-rejection diagnostics',
      expect.objectContaining({ bodyType: undefined, bodyId: undefined }),
    );
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
