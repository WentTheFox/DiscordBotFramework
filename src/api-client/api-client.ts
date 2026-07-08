import { Readable } from 'node:stream';
import { NestableLogger } from '../logger/types.js';
import { ApiHttpException } from './api-http-exception.js';
import { ApiAuthType, ApiClientOptions, ApiRequest, ApiResponse } from './types.js';

export class ApiClient {
  constructor(
    private logger: NestableLogger,
    public readonly options: ApiClientOptions,
    private fetchImpl: typeof fetch = globalThis.fetch,
  ) {
  }

  public async request<T>(params: ApiRequest<T>): Promise<ApiResponse<T>> {
    const {
      failOnInvalidResponse = true,
      query,
      path,
      body,
      method = 'GET',
      raw,
      validator,
    } = params;
    let responseText: string | undefined;
    let response: unknown;
    let r: Response | undefined;
    const { authentication } = this.options;
    const queryParams = new URLSearchParams();
    if (authentication?.type === ApiAuthType.QUERY_PARAM) {
      queryParams.set(authentication.paramName, authentication.getValue());
    }
    if (query) {
      Object.keys(query).forEach((key) => {
        queryParams.set(key, query?.[key] ?? '');
      });
    }
    let requestUrlRaw = this.options.baseUrl + this.normalizePath(path);
    if (authentication?.type === ApiAuthType.PATH_SEGMENT) {
      const placeholder = authentication.placeholder ?? ':token';
      requestUrlRaw = requestUrlRaw.replace(placeholder, authentication.getValue());
    }
    const requestUrlBuilder = new URL(requestUrlRaw);
    requestUrlBuilder.search = this.normalizeQueryParams(queryParams);
    const errorPrefix = `fetch ${method} ${String(requestUrlBuilder)}:`;

    try {
      const requestHeaders: Record<string, string> = {
        ...(this.options.userAgent ? { 'User-Agent': this.options.userAgent } : {}),
        ...this.options.fixedHeaders,
      };
      if (!raw) {
        requestHeaders['Accept'] = 'application/json';
      }
      const requestBody = typeof body !== 'undefined' ? JSON.stringify(body) : undefined;
      if (body) {
        requestHeaders['Content-Type'] = 'application/json';
      }
      if (authentication?.type === ApiAuthType.AUTHORIZATION_HEADER) {
        requestHeaders['Authorization'] = `${authentication.tokenType ?? 'Bearer'} ${authentication.getValue()}`;
      } else if (authentication?.type === ApiAuthType.CUSTOM_HEADER) {
        requestHeaders[authentication.headerName] = authentication.getValue();
      }
      r = await this.fetchImpl(requestUrlBuilder, {
        method,
        headers: requestHeaders,
        body: requestBody,
      });
      if (r.ok && !raw) {
        responseText = await r.text();
      }
    } catch (e) {
      const errorMessage = `${errorPrefix} Failed API request`;
      this.logger.error(errorMessage, e);
      throw new ApiHttpException(errorMessage, 500, e);
    }
    if (!r.ok) {
      const clientSideMessage = `API request failed with HTTP status ${r.status} ${r.statusText}`;
      const errorMessage = `${errorPrefix} ${clientSideMessage}\n${responseText}`;
      this.logger.error(errorMessage);
      throw new ApiHttpException(clientSideMessage, r.status);
    }

    if (raw) {
      const requestBody = r.body;
      if (requestBody !== null) {
        response = Readable.fromWeb(requestBody as never);
      }
    } else {
      try {
        if (responseText) {
          response = JSON.parse(responseText);
        }
      } catch (e) {
        const clientSideMessage = 'Failed to parse response as JSON';
        const errorMessage = `${errorPrefix} Failed to parse response as JSON\n${responseText}`;
        this.logger.error(errorMessage, e);
        throw new ApiHttpException(clientSideMessage, 500, e);
      }
    }

    let validation;
    if (validator) {
      validation = validator(response);
      if (!validation.success) {
        const clientSideMessage = 'Response validation failed';
        const errorMessage = `${errorPrefix} ${clientSideMessage}\n${responseText}\n${['', ...validation.errors.map((err) => JSON.stringify(err))].join('\n- ')}`;
        if (failOnInvalidResponse) {
          throw new ApiHttpException(clientSideMessage, 500, validation.errors);
        }
        this.logger.warn(errorMessage);
      }
    }

    return {
      responseText,
      response: response as T,
      validation,
      ok: r?.ok ?? false,
      status: r?.status ?? 0,
    };
  }

  public normalizePath(path: string | undefined): string {
    if (!path || path.length === 0) {
      return '/';
    }
    return path.replace(/^([^/])/, '/$1');
  }

  public normalizeQueryParams(queryParams: URLSearchParams): string {
    return queryParams.size > 0 ? `?${queryParams.toString()}` : '';
  }
}
