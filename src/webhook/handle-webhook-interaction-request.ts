import { createHash } from 'node:crypto';
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
  /**
   * Request headers, lowercase-keyed (matches Node's `http.IncomingMessage`,
   * Express, Fastify, ... convention). Optional - only used to enrich the
   * diagnostic `debug` log emitted when signature verification fails,
   * verification/dispatch behavior is identical either way.
   */
  headers?: Record<string, string | undefined>;
}

export interface WebhookInteractionResponse {
  status: number;
  body: APIInteractionResponse | { error: string } | Record<string, never>;
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
   *
   * If you instead bridge into a real discord.js interaction via
   * `interactionFromWebhookPayload` and dispatch it through
   * `dispatchChatInputCommand`/`createInteractionRouter`, the handler's own
   * `.reply()`/`.deferReply()` call already sends the actual response via
   * REST before this resolves - return nothing (`void`) in that case, and a
   * generic 200 ack is sent back to Discord's original request instead.
   * **This dual response path (a real REST call already made mid-handler,
   * plus a separate bare HTTP ack to the original webhook POST) is unverified
   * against live Discord traffic** - see this module's CLAUDE.md entry.
   */
  onInteraction: (interaction: APIInteraction) => APIInteractionResponse | void | Promise<APIInteractionResponse | void>;
  /**
   * Opt-in, off by default. Adds the exact `signature`/`timestamp` header
   * values, a SHA-256 hash of the raw body (not the body itself), and - only
   * if the body happens to parse as JSON - just its `type`/`id` fields, to
   * the signature-rejection diagnostic. For diagnosing a genuine crypto-level
   * mismatch (e.g. a proxy subtly altering the body/headers in flight) where
   * the default diagnostic's metadata (source IP, user-agent, lengths) isn't
   * enough - deliberately excludes body content beyond `type`/`id`, so it's
   * safe to enable without logging user-submitted interaction data (command
   * option values, etc.).
   */
  verboseSignatureDiagnostics?: boolean;
}

/**
 * Best-effort source IP for the diagnostic log below - checks the headers a
 * request sitting behind a reverse proxy (Cloudflare, nginx, ...) actually
 * carries the real client IP in, since `req.socket.remoteAddress`-equivalent
 * info is proxy-terminated and not available from headers/body alone. Not
 * used for anything security-sensitive (signature verification never trusts
 * client-supplied IP data) - purely to help a bot operator eyeball whether a
 * batch of rejections looks like internet-scanner noise or something worth a
 * closer look.
 */
function resolveSourceIp(headers: Record<string, string | undefined> | undefined): string | undefined {
  if (!headers) {
    return undefined;
  }
  return headers['cf-connecting-ip'] ?? headers['x-real-ip'] ?? headers['x-forwarded-for']?.split(',')[0]?.trim();
}

/**
 * Extra fields for `verboseSignatureDiagnostics` - the exact signature/
 * timestamp values (not sensitive: an Ed25519 signature and a unix
 * timestamp, neither reveals the private key or any user data) and a body
 * hash for correlating/deduplicating failures, plus `type`/`id` if the body
 * happens to be parseable JSON (garbage/scanner traffic usually isn't).
 * Deliberately stops there - never logs the parsed body beyond those two
 * fields, let alone the raw body itself.
 */
function verboseSignatureDiagnostics(request: WebhookInteractionRequest): Record<string, unknown> {
  const bodyHash = createHash('sha256').update(request.rawBody).digest('hex');
  let parsed: { type?: unknown; id?: unknown } | undefined;
  try {
    parsed = JSON.parse(request.rawBody.toString()) as { type?: unknown; id?: unknown };
  } catch {
    parsed = undefined;
  }
  return {
    signature: request.signature,
    timestamp: request.timestamp,
    bodyHash,
    bodyType: parsed?.type,
    bodyId: parsed?.id,
  };
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
 *
 * On a signature-verification failure, logs a `debug`-level diagnostic
 * (source IP, user-agent, whether the signature/timestamp headers were even
 * present, signature/body length) alongside the existing `warn` - a public
 * webhook endpoint draws routine internet-scanner noise as well as genuine
 * misconfiguration, and this is what tells the two apart after the fact
 * without every consuming bot re-implementing the same wrapper around this
 * call. Requires `request.headers` (optional) to populate the IP/user-agent
 * fields; omit it and those two just come back `undefined`.
 */
export async function handleWebhookInteractionRequest(
  request: WebhookInteractionRequest,
  options: HandleWebhookInteractionRequestOptions,
): Promise<WebhookInteractionResponse> {
  const { publicKey, logger, onInteraction, verboseSignatureDiagnostics: verbose = false } = options;

  const isValid = verifyInteractionRequest({
    publicKey,
    signature: request.signature,
    timestamp: request.timestamp,
    rawBody: request.rawBody,
  });
  if (!isValid) {
    logger.warn('Rejected webhook interaction request with invalid signature');
    logger.debug('Webhook interaction signature-rejection diagnostics', {
      sourceIp: resolveSourceIp(request.headers),
      userAgent: request.headers?.['user-agent'],
      hasSignatureHeader: request.signature !== undefined,
      hasTimestampHeader: request.timestamp !== undefined,
      signatureLength: request.signature?.length ?? 0,
      bodyLength: Buffer.byteLength(request.rawBody),
      ...(verbose ? verboseSignatureDiagnostics(request) : undefined),
    });
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
    return { status: 200, body: body ?? {} };
  } catch (e) {
    logger.error('Error while handling webhook interaction', e);
    return { status: 500, body: { error: 'Internal error' } };
  }
}
