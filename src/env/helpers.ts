import { z } from 'zod';

/**
 * Reproduces the `VAR === 'true'` string-boolean convention used across the
 * legacy bots' env files (e.g. `LOCAL`, `DEBUG_I18N`, `DISABLE_SETTINGS`).
 * Any value other than the literal string `"true"` (including undefined/empty)
 * resolves to `false`, matching the previous behavior exactly.
 */
export const boolFromString = () => z.preprocess(
  (value) => value === 'true',
  z.boolean(),
);
