import { describe, expect, it, vi } from 'vitest';
import { DevNullLogger } from '../logger/dev-null-logger.js';
import { ApiClient } from './api-client.js';
import { ApiHttpException } from './api-http-exception.js';
import { ApiAuthType } from './types.js';

const jsonResponse = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'content-type': 'application/json' },
  ...init,
});

describe('ApiClient', () => {
  it('attaches a bearer token via getValue()', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = new ApiClient(new DevNullLogger(), {
      baseUrl: 'https://example.com/api',
      authentication: { type: ApiAuthType.AUTHORIZATION_HEADER, getValue: () => 'secret-token' },
    }, fetchImpl);

    await client.request({ path: '/ping' });

    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer secret-token');
  });

  it('returns unknown response when no validator is passed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ hello: 'world' }));
    const client = new ApiClient(new DevNullLogger(), { baseUrl: 'https://example.com' }, fetchImpl);

    const { response, validation } = await client.request({ path: '/thing' });

    expect(response).toEqual({ hello: 'world' });
    expect(validation).toBeUndefined();
  });

  it('throws ApiHttpException when validation fails and failOnInvalidResponse is true', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ hello: 'world' }));
    const client = new ApiClient(new DevNullLogger(), { baseUrl: 'https://example.com' }, fetchImpl);

    await expect(client.request({
      path: '/thing',
      validator: () => ({ success: false, errors: ['bad shape'] }),
    })).rejects.toBeInstanceOf(ApiHttpException);
  });

  it('throws ApiHttpException on non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500, statusText: 'Server Error' }));
    const client = new ApiClient(new DevNullLogger(), { baseUrl: 'https://example.com' }, fetchImpl);

    await expect(client.request({ path: '/thing' })).rejects.toMatchObject({ status: 500 });
  });
});
