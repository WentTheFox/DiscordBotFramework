export enum ApiAuthType {
  QUERY_PARAM = 'query_param',
  AUTHORIZATION_HEADER = 'bearer',
  CUSTOM_HEADER = 'custom_header',
  PATH_SEGMENT = 'path_segment',
}

export interface BaseApiAuthMethod {
  type: ApiAuthType;
}

export interface QueryParamApiAuthMethod extends BaseApiAuthMethod {
  type: ApiAuthType.QUERY_PARAM;
  paramName: string;
  /** Returns the param value, e.g. `() => env.API_TOKEN` */
  getValue: () => string;
}

export interface BearerTokenApiAuthMethod extends BaseApiAuthMethod {
  type: ApiAuthType.AUTHORIZATION_HEADER;
  /**
   * @default 'Bearer'
   */
  tokenType?: string;
  /** Returns the bearer token, e.g. `() => env.API_TOKEN` */
  getValue: () => string;
}

export interface CustomHeaderApiAuthMethod extends BaseApiAuthMethod {
  type: ApiAuthType.CUSTOM_HEADER;
  headerName: string;
  /** Returns the header value, e.g. `() => env.API_TOKEN` */
  getValue: () => string;
}

export interface PathSegmentApiAuthMethod extends BaseApiAuthMethod {
  type: ApiAuthType.PATH_SEGMENT;
  /**
   * Placeholder in `path` to substitute with the token value, e.g. `:token`
   * @default ':token'
   */
  placeholder?: string;
  /** Returns the value to substitute into the path, e.g. `() => env.API_TOKEN` */
  getValue: () => string;
}

export type ApiAuthMethod =
  | QueryParamApiAuthMethod
  | BearerTokenApiAuthMethod
  | PathSegmentApiAuthMethod
  | CustomHeaderApiAuthMethod;

/**
 * Structural subset of typia's `IValidation<T>` shape. Bots that already use
 * typia can pass `typia.createValidate<T>()` directly; bots that don't can
 * hand-write a check or omit `validator` entirely to get `response: unknown`.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: unknown[] };

export interface ApiRequest<T> {
  path: string;
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
  /**
   * If true, the response will not be JSON parsed and `raw` stream data is
   * returned instead.
   */
  raw?: boolean;
  /**
   * Validates/narrows the parsed response. If omitted, `response` is typed
   * as `unknown` and no validation is performed.
   */
  validator?: (data: unknown) => ValidationResult<T>;
  /**
   * Throw an error if the response does not pass validation
   * @default true
   */
  failOnInvalidResponse?: boolean;
}

export interface ApiResponse<T> {
  responseText: string | undefined;
  response: T;
  validation?: ValidationResult<T>;
  ok: boolean;
  status: number;
}

export interface ApiClientOptions {
  baseUrl: string;
  authentication?: Readonly<ApiAuthMethod>;
  fixedHeaders?: Readonly<Record<string, string>>;
  userAgent?: string;
}
