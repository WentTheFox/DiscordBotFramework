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

  describe('retry', () => {
    it('retries on 5xx and succeeds', async () => {
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(new Response('err', { status: 503 }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));
      const client = new ApiClient(new DevNullLogger(), {
        baseUrl: 'https://example.com',
        retry: { maxAttempts: 2, initialDelayMs: 0 },
      }, fetchImpl);

      const { response } = await client.request({ path: '/thing' });

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(response).toEqual({ ok: true });
    });

    it('retries on 429', async () => {
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));
      const client = new ApiClient(new DevNullLogger(), {
        baseUrl: 'https://example.com',
        retry: { maxAttempts: 2, initialDelayMs: 0 },
      }, fetchImpl);

      await client.request({ path: '/thing' });

      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('does not retry on 4xx (except 429)', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));
      const client = new ApiClient(new DevNullLogger(), {
        baseUrl: 'https://example.com',
        retry: { maxAttempts: 3, initialDelayMs: 0 },
      }, fetchImpl);

      await expect(client.request({ path: '/thing' })).rejects.toMatchObject({ status: 404 });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('throws after exhausting all attempts', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('err', { status: 500 }));
      const client = new ApiClient(new DevNullLogger(), {
        baseUrl: 'https://example.com',
        retry: { maxAttempts: 3, initialDelayMs: 0 },
      }, fetchImpl);

      await expect(client.request({ path: '/thing' })).rejects.toMatchObject({ status: 500 });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it('respects custom shouldRetry', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('err', { status: 500 }));
      const client = new ApiClient(new DevNullLogger(), {
        baseUrl: 'https://example.com',
        retry: { maxAttempts: 3, initialDelayMs: 0, shouldRetry: () => false },
      }, fetchImpl);

      await expect(client.request({ path: '/thing' })).rejects.toMatchObject({ status: 500 });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });

  describe('timeoutMs', () => {
    it('does not pass a signal when no timeout is set', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
      const client = new ApiClient(new DevNullLogger(), { baseUrl: 'https://example.com' }, fetchImpl);

      await client.request({ path: '/thing' });

      const [, init] = fetchImpl.mock.calls[0];
      expect(init.signal).toBeUndefined();
    });

    it('uses the client-level default when the request sets none', async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
      const client = new ApiClient(new DevNullLogger(), {
        baseUrl: 'https://example.com',
        timeoutMs: 1000,
      }, fetchImpl);

      await client.request({ path: '/thing' });

      expect(timeoutSpy).toHaveBeenCalledWith(1000);
    });

    it('lets a per-request timeoutMs override the client-level default', async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
      const client = new ApiClient(new DevNullLogger(), {
        baseUrl: 'https://example.com',
        timeoutMs: 1000,
      }, fetchImpl);

      await client.request({ path: '/thing', timeoutMs: 2000 });

      expect(timeoutSpy).toHaveBeenCalledWith(2000);
    });

    it('aborts and throws ApiHttpException when a request outlives timeoutMs', async () => {
      const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      }));
      const client = new ApiClient(new DevNullLogger(), {
        baseUrl: 'https://example.com',
        timeoutMs: 5,
      }, fetchImpl);

      await expect(client.request({ path: '/thing' })).rejects.toMatchObject({
        status: 500,
        message: expect.stringContaining('Request timed out after 5ms'),
      });
    });

    it('composes with retry - a timeout is retried like any other 5xx', async () => {
      const fetchImpl = vi.fn()
        .mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));
      const client = new ApiClient(new DevNullLogger(), {
        baseUrl: 'https://example.com',
        timeoutMs: 5,
        retry: { maxAttempts: 2, initialDelayMs: 0 },
      }, fetchImpl);

      const { response } = await client.request({ path: '/thing' });

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(response).toEqual({ ok: true });
    });
  });
});
