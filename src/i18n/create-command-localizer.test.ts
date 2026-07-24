import i18next from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { createCommandLocalizer } from './create-command-localizer.js';

beforeAll(async () => {
  await i18next.init({
    lng: 'en-US',
    fallbackLng: 'en-US',
    resources: {
      'en-US': {
        translation: {
          commands: {
            search: {
              name: 'search',
              description: 'Search for something',
              options: { query: { description: 'Query string' } },
            },
          },
        },
      },
      'es-ES': {
        translation: {
          commands: {
            search: {
              name: 'buscar',
              description: 'Buscar algo',
            },
          },
        },
      },
    },
    interpolation: { escapeValue: false },
  });
});

describe('createCommandLocalizer', () => {
  it('resolveDescription returns the base-locale translation for an existing key', () => {
    const localizer = createCommandLocalizer({ locales: ['en-US', 'es-ES'], baseLocale: 'en-US', t: i18next.t });
    expect(localizer.resolveDescription(['commands', 'search', 'description'])).toBe('Search for something');
  });

  it('resolveDescription returns undefined for a missing key (key-echo detection)', () => {
    const localizer = createCommandLocalizer({ locales: ['en-US', 'es-ES'], baseLocale: 'en-US', t: i18next.t });
    expect(localizer.resolveDescription(['commands', 'nonexistent', 'description'])).toBeUndefined();
  });

  it('localizeName builds a per-locale dictionary, excluding locales with no translation', () => {
    const localizer = createCommandLocalizer({ locales: ['en-US', 'es-ES'], baseLocale: 'en-US', t: i18next.t });
    expect(localizer.localizeName(['commands', 'search', 'name'])).toEqual({ 'en-US': 'search', 'es-ES': 'buscar' });
  });

  it('localizeDescription omits locales with no translation, e.g. es-ES missing an option description', () => {
    const localizer = createCommandLocalizer({ locales: ['en-US', 'es-ES'], baseLocale: 'en-US', t: i18next.t });
    expect(localizer.localizeDescription(['commands', 'search', 'options', 'query', 'description'])).toEqual({ 'en-US': 'Query string' });
  });

  it('returns undefined (not {}) when zero locales have a translation', () => {
    const localizer = createCommandLocalizer({ locales: ['en-US', 'es-ES'], baseLocale: 'en-US', t: i18next.t });
    expect(localizer.localizeName(['commands', 'nonexistent', 'name'])).toBeUndefined();
  });
});
