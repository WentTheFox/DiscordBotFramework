import { createPublicKey, verify } from 'node:crypto';

// DER SPKI wrapper for a raw 32-byte Ed25519 public key
// (302a300506032b6570032100 = SEQUENCE { SEQUENCE { OID 1.3.101.112 }, BIT STRING (32 bytes) }).
// Node's `crypto.createPublicKey` has no raw-Ed25519-key input format, only DER/PEM/JWK, and
// Discord's developer portal only ever gives bots the raw 32-byte hex key - this prefix is the
// standard, fixed way to wrap one into the DER SPKI shape `createPublicKey` accepts.
const ed25519SpkiDerPrefix = Buffer.from('302a300506032b6570032100', 'hex');

export interface VerifyInteractionRequestOptions {
  /** The bot's Ed25519 application public key, from the Discord developer portal, as a hex string. */
  publicKey: string;
  /** The request's `X-Signature-Ed25519` header. */
  signature: string | undefined;
  /** The request's `X-Signature-Timestamp` header. */
  timestamp: string | undefined;
  /** The raw (unparsed) request body, exactly as received - verification fails against a re-serialized body. */
  rawBody: string | Buffer;
}

/**
 * Verifies a Discord Interactions-webhook request's Ed25519 signature, per
 * https://discord.com/developers/docs/interactions/overview#setting-up-an-endpoint.
 *
 * Built on Node's native `crypto` module (`verify`/`createPublicKey`, both
 * Ed25519-capable since Node 12) instead of `tweetnacl` or
 * `discord-interactions` - matching this package's standing preference for a
 * native API over a new dependency when one suffices (see the discord-webhook
 * pino transport, and `createHandlerWatcher`'s use of native `fs.watch`).
 */
export function verifyInteractionRequest(options: VerifyInteractionRequestOptions): boolean {
  const { publicKey, signature, timestamp, rawBody } = options;
  if (!signature || !timestamp) {
    return false;
  }

  try {
    const key = createPublicKey({
      key: Buffer.concat([ed25519SpkiDerPrefix, Buffer.from(publicKey, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), Buffer.from(rawBody)]);
    return verify(null, message, key, Buffer.from(signature, 'hex'));
  } catch {
    // Malformed hex in publicKey/signature, wrong-length key, etc. - all just "not valid".
    return false;
  }
}
