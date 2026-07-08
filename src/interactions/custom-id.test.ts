import { describe, expect, it } from 'vitest';
import { parseCustomIdSegments } from './custom-id.js';

describe('parseCustomIdSegments', () => {
  it('returns just the id when there is no separator', () => {
    expect(parseCustomIdSegments('confirm')).toEqual({ id: 'confirm' });
  });

  it('splits id and resourceId on the first separator', () => {
    expect(parseCustomIdSegments('confirm:123')).toEqual({ id: 'confirm', resourceId: '123' });
  });

  it('keeps the rest of the string intact if the resourceId itself contains the separator', () => {
    expect(parseCustomIdSegments('confirm:123:456')).toEqual({ id: 'confirm', resourceId: '123:456' });
  });

  it('supports a custom separator', () => {
    expect(parseCustomIdSegments('confirm|123', '|')).toEqual({ id: 'confirm', resourceId: '123' });
  });
});
