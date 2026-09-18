/** Discord's own official system user - the `user` on the payload this recognizes below. */
const DISCORD_SYSTEM_USER_ID = '643945264868098049';

/**
 * Recognizes a recurring, confirmed-benign pattern seen in production: a `Ping` (type 1)
 * interaction payload, "from" Discord's own official system user, deliberately signed with a
 * signature that doesn't verify against the app's public key. Everything else about it is genuine
 * (real Discord source IP, `Discord-Interactions/1.0` UA, correct `application_id`) - manually
 * re-verifying a captured sample confirmed the signature itself is the only thing wrong, and
 * Discord confirms an application's public key can't be rotated, so a stale-key explanation is
 * ruled out too. Most plausible explanation left: Discord intentionally sends a mis-signed `Ping`
 * to verify endpoints actually reject bad signatures rather than trusting anything that looks like
 * a Discord request. Rejecting it is correct either way - this only exists so
 * `handleWebhookInteractionRequest` can recognize it and quiet its own expected, recurring
 * rejection logs for just this case, without changing the rejection itself.
 *
 * Deliberately checks the interaction's shape, not a fixed byte length - a specific size is
 * incidental and could shift if Discord adds/removes a field, but `type` + the official system
 * user is what actually identifies this case. `applicationId` is optional extra narrowing (a
 * request that already failed signature verification could in principle mimic this exact shape);
 * omit it to match on shape alone.
 */
export function isDiscordSignatureConformanceCheck(rawBody: string | Buffer, applicationId?: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString());
  } catch {
    return false;
  }

  if (typeof parsed !== 'object' || parsed === null) return false;
  const body = parsed as Record<string, unknown>;
  if (body.type !== 1) return false;
  if (applicationId !== undefined && body.application_id !== applicationId) return false;

  const user = body.user;
  if (typeof user !== 'object' || user === null) return false;
  const { id, system, bot } = user as Record<string, unknown>;
  return id === DISCORD_SYSTEM_USER_ID && system === true && bot === true;
}
