import { describe, expect, it } from 'vitest';
import { condenseStringArray } from './strings.js';

describe('condenseStringArray', () => {
  it('joins short adjacent strings together', () => {
    expect(condenseStringArray(['a', 'b', 'c'], 10, ',')).toEqual(['a,b,c']);
  });

  it('keeps an over-length item on its own', () => {
    expect(condenseStringArray(['a', 'x'.repeat(20), 'b'], 10, ',')).toEqual(['a', 'x'.repeat(20), 'b']);
  });

  it('returns the input unchanged for fewer than 2 items', () => {
    expect(condenseStringArray(['only'])).toEqual(['only']);
  });
});
