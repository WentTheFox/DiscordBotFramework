import { config as loadDotenv, DotenvConfigOptions } from 'dotenv';
import { z, ZodError, ZodRawShape } from 'zod';

export interface DefineEnvOptions {
  /**
   * Passed through to dotenv's `config()`. Defaults to `{ quiet: true }`.
   * Pass `false` to skip loading a `.env` file entirely (e.g. a queue-worker
   * process that inherits its environment from pm2).
   */
  dotenv?: DotenvConfigOptions | false;
  /**
   * Source object to validate. Defaults to `process.env`. Overriding this is
   * primarily useful in tests, to validate a fixture object instead of the
   * real environment.
   */
  source?: NodeJS.ProcessEnv;
}

const formatZodError = (error: ZodError): string => {
  const lines = error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  return `Environment validation failed:\n${lines.join('\n')}`;
};

/**
 * Loads `.env` (via dotenv) and validates `process.env` against a zod shape,
 * throwing a single formatted error listing every failing key. Required vs.
 * optional vs. defaulted fields are expressed directly in the schema (e.g.
 * `z.string().min(1)` vs `z.string().optional()` vs `.default(...)`) rather
 * than via a separate required-keys list.
 */
export function defineEnv<Schema extends ZodRawShape>(
  schema: Schema,
  options: DefineEnvOptions = {},
): Readonly<z.infer<z.ZodObject<Schema>>> {
  if (options.dotenv !== false) {
    loadDotenv(options.dotenv ?? { quiet: true });
  }

  const result = z.object(schema).safeParse(options.source ?? process.env);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }

  return Object.freeze(result.data);
}
