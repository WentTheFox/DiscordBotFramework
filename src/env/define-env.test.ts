import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineEnv } from './define-env.js';
import { boolFromString } from './helpers.js';

describe('defineEnv', () => {
  it('parses and coerces a valid source object', () => {
    const env = defineEnv({
      DISCORD_BOT_TOKEN: z.string().min(1),
      LOCAL: boolFromString().default(false),
      SUPPORT_SERVER_ID: z.string().optional().default(''),
    }, {
      dotenv: false,
      source: { DISCORD_BOT_TOKEN: 'abc', LOCAL: 'true' },
    });

    expect(env).toEqual({
      DISCORD_BOT_TOKEN: 'abc',
      LOCAL: true,
      SUPPORT_SERVER_ID: '',
    });
  });

  it('throws a single error listing every missing/invalid key', () => {
    expect(() => defineEnv({
      DISCORD_BOT_TOKEN: z.string().min(1),
      API_URL: z.string().url(),
    }, {
      dotenv: false,
      source: { API_URL: 'not-a-url' },
    })).toThrowError(/DISCORD_BOT_TOKEN[\s\S]*API_URL/);
  });

  it('boolFromString treats any non-"true" value as false', () => {
    const env = defineEnv({
      DEBUG_I18N: boolFromString().default(false),
    }, {
      dotenv: false,
      source: { DEBUG_I18N: 'nope' },
    });
    expect(env.DEBUG_I18N).toBe(false);
  });
});
