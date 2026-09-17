import { REST } from '@discordjs/rest';
import { RESTPatchAPIWebhookWithTokenMessageJSONBody, RESTPostAPIWebhookWithTokenJSONBody, RESTPostAPIWebhookWithTokenResult, Routes } from 'discord-api-types/v10';

export interface CreateWebhookInteractionResponderOptions {
  rest: REST;
  applicationId: string;
  /** The responding interaction's own token (`APIInteraction.token`), valid for 15 minutes after receipt. */
  interactionToken: string;
}

export interface WebhookInteractionResponder {
  /** `PATCH /webhooks/{application.id}/{interaction.token}/messages/@original` - edits the initial response (including a deferred one). */
  editReply(body: RESTPatchAPIWebhookWithTokenMessageJSONBody): Promise<unknown>;
  /** `POST /webhooks/{application.id}/{interaction.token}` - sends an additional message after the initial response. */
  followUp(body: RESTPostAPIWebhookWithTokenJSONBody): Promise<RESTPostAPIWebhookWithTokenResult>;
  /** `DELETE /webhooks/{application.id}/{interaction.token}/messages/@original` - deletes the initial response. */
  deleteReply(): Promise<void>;
}

/**
 * REST counterpart to editing/following-up on an interaction once it's
 * already been given its initial response - built on `@discordjs/rest` (an
 * existing peer dependency, same client `createCommandRegistrar` already
 * uses) rather than a live discord.js `Client`, since webhook mode has none.
 *
 * This is *not* a drop-in replacement for discord.js's
 * `Interaction#reply()`/`editReply()`/`options.get*()` surface - it only
 * covers what happens after `handleWebhookInteractionRequest`'s synchronous
 * response (the initial `reply()`/`deferReply()` equivalent is just the
 * `APIInteractionResponse` your `onInteraction` callback returns). Mimicking
 * discord.js's full `Interaction` shape closely enough for existing
 * gateway-based handler code to run unmodified against it is real,
 * unvalidated design work - see CLAUDE.md's `./webhook` design-decision entry.
 */
export function createWebhookInteractionResponder(options: CreateWebhookInteractionResponderOptions): WebhookInteractionResponder {
  const { rest, applicationId, interactionToken } = options;

  return {
    editReply: (body) => rest.patch(Routes.webhookMessage(applicationId, interactionToken, '@original'), { body }),
    followUp: (body) => rest.post(Routes.webhook(applicationId, interactionToken), { body }) as Promise<RESTPostAPIWebhookWithTokenResult>,
    deleteReply: () => rest.delete(Routes.webhookMessage(applicationId, interactionToken, '@original')) as Promise<void>,
  };
}
