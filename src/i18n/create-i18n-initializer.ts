import i18next, { i18n } from 'i18next';
import Backend from 'i18next-fs-backend';
import { NestableLogger } from '../logger/types.js';

export interface CreateI18nInitializerOptions {
  /** Directory containing `{{lng}}/{{ns}}.json` locale files. */
  localesDir: string;
  supportedLngs: string[];
  fallbackLng: string;
  debug?: boolean;
}

/**
 * Wraps the i18next + i18next-fs-backend bootstrap shared by bots that use
 * localized commands. Returns an initializer function that lazily
 * initializes i18next on first call and reuses the same instance on
 * subsequent calls (matching the singleton-init-promise pattern the source
 * bots already use).
 */
export function createI18nInitializer(options: CreateI18nInitializerOptions): (logger: NestableLogger) => Promise<i18n> {
  let initPromise: Promise<i18n> | null = null;

  return (logger: NestableLogger): Promise<i18n> => {
    if (initPromise !== null) {
      return initPromise;
    }

    logger.log('Initializing i18n');

    initPromise = i18next.use(Backend).init({
      lng: options.fallbackLng,
      fallbackLng: options.fallbackLng,
      debug: options.debug ?? false,
      preload: options.supportedLngs,
      backend: {
        loadPath: `${options.localesDir}/{{lng}}/{{ns}}.json`,
      },
      interpolation: {
        escapeValue: false,
      },
      overloadTranslationOptionHandler: () => ({}),
      showSupportNotice: false,
    }).then(() => i18next);

    return initPromise;
  };
}
