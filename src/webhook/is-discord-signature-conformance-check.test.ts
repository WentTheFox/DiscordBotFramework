import { describe, expect, it } from 'vitest';
import { isDiscordSignatureConformanceCheck } from './is-discord-signature-conformance-check.js';

const APPLICATION_ID = 'my-app-id';

const conformanceCheckBody = JSON.stringify({
  type: 1,
  application_id: APPLICATION_ID,
  id: '1550505992918278216',
  user: { id: '643945264868098049', system: true, bot: true, username: 'discord' },
});

describe('isDiscordSignatureConformanceCheck', () => {
  it('recognizes the known conformance-check payload', () => {
    expect(isDiscordSignatureConformanceCheck(conformanceCheckBody, APPLICATION_ID)).toBe(true);
  });

  it('recognizes it without an applicationId to narrow against', () => {
    expect(isDiscordSignatureConformanceCheck(conformanceCheckBody)).toBe(true);
  });

  it('accepts a Buffer, not just a string', () => {
    expect(isDiscordSignatureConformanceCheck(Buffer.from(conformanceCheckBody), APPLICATION_ID)).toBe(true);
  });

  it('rejects a body for a different application when applicationId is given', () => {
    expect(isDiscordSignatureConformanceCheck(conformanceCheckBody, 'some-other-app-id')).toBe(false);
  });

  it('rejects a real interaction from a real user', () => {
    const body = JSON.stringify({
      type: 2,
      application_id: APPLICATION_ID,
      user: { id: '123456789012345678', system: false, bot: false, username: 'someone' },
    });
    expect(isDiscordSignatureConformanceCheck(body, APPLICATION_ID)).toBe(false);
  });

  it('rejects a Ping from a user that merely claims to be a bot/system user but has the wrong id', () => {
    const body = JSON.stringify({
      type: 1,
      application_id: APPLICATION_ID,
      user: { id: '111111111111111111', system: true, bot: true, username: 'not-discord' },
    });
    expect(isDiscordSignatureConformanceCheck(body, APPLICATION_ID)).toBe(false);
  });

  it('rejects non-JSON garbage without throwing', () => {
    expect(isDiscordSignatureConformanceCheck('not json at all', APPLICATION_ID)).toBe(false);
  });

  it('rejects an empty body without throwing', () => {
    expect(isDiscordSignatureConformanceCheck('', APPLICATION_ID)).toBe(false);
  });

  it('rejects a JSON body that is not an object', () => {
    expect(isDiscordSignatureConformanceCheck('42', APPLICATION_ID)).toBe(false);
    expect(isDiscordSignatureConformanceCheck('null', APPLICATION_ID)).toBe(false);
  });

  it('rejects a body missing the user field', () => {
    const body = JSON.stringify({ type: 1, application_id: APPLICATION_ID });
    expect(isDiscordSignatureConformanceCheck(body, APPLICATION_ID)).toBe(false);
  });
});
