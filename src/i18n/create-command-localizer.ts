import { TFunction } from 'i18next';

export interface CreateCommandLocalizerOptions {
  /** All locale codes to attempt name_localizations/description_localizations for. */
  locales: readonly string[];
  /** The base/default locale whose translation (if present) also becomes the plain `description` fallback value. */
  baseLocale: string;
  t: TFunction;
}

export interface CommandLocalizer {
  /** Matches `DescriptionResolver`'s shape - pass directly as `buildApplicationCommandsBody`'s `resolveDescription`. */
  resolveDescription: (path: readonly string[]) => string | undefined;
  /** Matches `LocalizationResolver`'s shape - pass directly as `buildApplicationCommandsBody`'s `localizeNames`. */
  localizeName: (path: readonly string[]) => Record<string, string> | undefined;
  /** Matches `LocalizationResolver`'s shape - pass directly as `buildApplicationCommandsBody`'s `localizeDescriptions`. */
  localizeDescription: (path: readonly string[]) => Record<string, string> | undefined;
}

/**
 * Generic i18next-backed localizer for commands.json entries, replacing a
 * bot's own bespoke `getLocalizedObject`/`getCommonOptionMeta`-style helpers.
 * Every method takes the same dot-path-shaped key array
 * `buildApplicationCommandsBody` builds internally (e.g.
 * `['commands', 'search', 'description']`), so its three hook slots
 * (`resolveDescription`, `localizeNames`, `localizeDescriptions`) can be
 * wired straight to this object's methods with no glue code.
 */
export function createCommandLocalizer(options: CreateCommandLocalizerOptions): CommandLocalizer {
  const { locales, baseLocale, t } = options;

  function translate(path: readonly string[], lng: string): string | undefined {
    const key = path.join('.');
    // fallbackLng disabled so each locale's own coverage is checked
    // independently - otherwise a configured fallback chain would silently
    // fill in every locale from the fallback language, and localizeName/
    // localizeDescription could never produce a sparse per-locale dictionary.
    // i18next echoes the key back unchanged when no translation exists (no
    // returnNull/parseMissingKeyHandler configured) - that echo is the only
    // signal available to detect "not found" with a plain TFunction.
    const value = t(key, { lng, fallbackLng: false });
    return value === key ? undefined : value;
  }

  function localizeAll(path: readonly string[]): Record<string, string> | undefined {
    const result: Record<string, string> = {};
    for (const locale of locales) {
      const value = translate(path, locale);
      if (value !== undefined) {
        result[locale] = value;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  return {
    resolveDescription: (path) => translate(path, baseLocale),
    localizeName: (path) => localizeAll(path),
    localizeDescription: (path) => localizeAll(path),
  };
}
