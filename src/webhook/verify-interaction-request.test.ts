import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyInteractionRequest } from './verify-interaction-request.js';

function generateKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPublicKeyHex = (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).subarray(-32).toString('hex');
  return { rawPublicKeyHex, privateKey };
}

function signRequest(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], timestamp: string, rawBody: string) {
  return sign(null, Buffer.concat([Buffer.from(timestamp), Buffer.from(rawBody)]), privateKey).toString('hex');
}

describe('verifyInteractionRequest', () => {
  it('accepts a validly signed request', () => {
    const { rawPublicKeyHex, privateKey } = generateKeys();
    const timestamp = '1700000000';
    const rawBody = '{"type":1}';
    const signature = signRequest(privateKey, timestamp, rawBody);

    expect(verifyInteractionRequest({ publicKey: rawPublicKeyHex, signature, timestamp, rawBody })).toBe(true);
  });

  it('rejects a request signed with a different key', () => {
    const { privateKey } = generateKeys();
    const { rawPublicKeyHex: otherPublicKeyHex } = generateKeys();
    const timestamp = '1700000000';
    const rawBody = '{"type":1}';
    const signature = signRequest(privateKey, timestamp, rawBody);

    expect(verifyInteractionRequest({ publicKey: otherPublicKeyHex, signature, timestamp, rawBody })).toBe(false);
  });

  it('rejects a request whose body was tampered with after signing', () => {
    const { rawPublicKeyHex, privateKey } = generateKeys();
    const timestamp = '1700000000';
    const signature = signRequest(privateKey, timestamp, '{"type":1}');

    expect(verifyInteractionRequest({ publicKey: rawPublicKeyHex, signature, timestamp, rawBody: '{"type":2}' })).toBe(false);
  });

  it('rejects when the signature header is missing', () => {
    const { rawPublicKeyHex } = generateKeys();
    expect(verifyInteractionRequest({ publicKey: rawPublicKeyHex, signature: undefined, timestamp: '1700000000', rawBody: '{}' })).toBe(false);
  });

  it('rejects when the timestamp header is missing', () => {
    const { rawPublicKeyHex } = generateKeys();
    expect(verifyInteractionRequest({ publicKey: rawPublicKeyHex, signature: 'aa', timestamp: undefined, rawBody: '{}' })).toBe(false);
  });

  it('rejects malformed (non-hex) input instead of throwing', () => {
    expect(verifyInteractionRequest({ publicKey: 'not-hex', signature: 'also-not-hex', timestamp: '1700000000', rawBody: '{}' })).toBe(false);
  });
});
