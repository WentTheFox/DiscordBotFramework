import { APIInteraction, APIInteractionResponse, InteractionResponseType, InteractionType } from 'discord-api-types/v10';
import { NestableLogger } from '../logger/types.js';
import { verifyInteractionRequest } from './verify-interaction-request.js';

export interface WebhookInteractionRequest {
  /** The request's `X-Signature-Ed25519` header. */
  signature: string | undefined;
  /** The request's `X-Signature-Timestamp` header. */
  timestamp: string | undefined;
  /** The raw (unparsed) request body, exactly as received - required for signature verification. */
  rawBody: string | Buffer;
}

export interface WebhookInteractionResponse {
  status: number;
  body: APIInteractionResponse | { error: string };
}

export interface HandleWebhookInteractionRequestOptions {
  /** The bot's Ed25519 application public key, from the Discord developer portal, as a hex string. */
  publicKey: string;
  logger: NestableLogger;
  /**
   * Called for every interaction that isn't Discord's own PING handshake
   * check. Its return value becomes the HTTP response body sent back to
   * Discord as the interaction's initial response (e.g. a `CHANNEL_MESSAGE_WITH_SOURCE`
   * or a `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE` to be followed up on later via
   * `createWebhookInteractionResponder`).
   */
  onInteraction: (interaction: APIInteraction) => APIInteractionResponse | Promise<APIInteractionResponse>;
}

/**
 * Framework-agnostic core of an HTTP Interactions endpoint: verifies the
 * request's Ed25519 signature, answers Discord's PING (type 1) validation
 * handshake with PONG directly, and otherwise hands the parsed interaction to
 * `onInteraction`. Deliberately takes/returns plain data (raw body + headers
 * in, `{ status, body }` out) instead of an `http.IncomingMessage`/Express
 * `Request`/etc., so it can be wired into any HTTP layer a bot already uses -
 * this package doesn't otherwise depend on one, and picking one here would be
 * a bigger commitment than this function needs to make.
 */
export async function handleWebhookInteractionRequest(
  request: WebhookInteractionRequest,
  options: HandleWebhookInteractionRequestOptions,
): Promise<WebhookInteractionResponse> {
  const { publicKey, logger, onInteraction } = options;

  const isValid = verifyInteractionRequest({
    publicKey,
    signature: request.signature,
    timestamp: request.timestamp,
    rawBody: request.rawBody,
  });
  if (!isValid) {
    logger.warn('Rejected webhook interaction request with invalid signature');
    return { status: 401, body: { error: 'Invalid request signature' } };
  }

  let interaction: APIInteraction;
  try {
    interaction = JSON.parse(request.rawBody.toString()) as APIInteraction;
  } catch (e) {
    logger.error('Failed to parse webhook interaction request body as JSON', e);
    return { status: 400, body: { error: 'Invalid JSON body' } };
  }

  if (interaction.type === InteractionType.Ping) {
    return { status: 200, body: { type: InteractionResponseType.Pong } };
  }

  try {
    const body = await onInteraction(interaction);
    return { status: 200, body };
  } catch (e) {
    logger.error('Error while handling webhook interaction', e);
    return { status: 500, body: { error: 'Internal error' } };
  }
}
