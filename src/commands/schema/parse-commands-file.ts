import type { ErrorObject, ValidateFunction } from 'ajv';

export interface ParseCommandsFileOptions {
  /**
   * A pre-compiled ajv validate function for the bot's own composed
   * commands.schema (e.g. from `ajv.compile(myCommandsSchema)`, after calling
   * `registerFrameworkSchemas(ajv)`).
   */
  validate: ValidateFunction;
}

const formatAjvErrors = (errors: readonly ErrorObject[]): string => {
  const lines = errors.map((error) => `  - ${error.instancePath || '(root)'}: ${error.message}`);
  return `commands.json validation failed:\n${lines.join('\n')}`;
};

/**
 * Validates already-parsed commands.json data (e.g. from a native JSON
 * import, or `JSON.parse(readFileSync(...))`) against a bot-supplied ajv
 * validate function, throwing one formatted error listing every failing
 * path. This is the structural pass only - it runs right after parsing and
 * cannot validate description-completeness, since descriptions may be
 * legitimately absent pending i18n resolution in `buildApplicationCommandsBody`.
 */
export function parseCommandsFile<T>(data: unknown, options: ParseCommandsFileOptions): T {
  if (!options.validate(data)) {
    throw new Error(formatAjvErrors(options.validate.errors ?? []));
  }

  return data as T;
}
