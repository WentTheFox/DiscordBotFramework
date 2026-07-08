import { describe, expect, it, vi } from 'vitest';
import { runAttempts } from './run-attempts.js';

describe('runAttempts', () => {
  it('stops at the first successful attempt', async () => {
    const first = vi.fn().mockResolvedValue(false);
    const second = vi.fn().mockResolvedValue(true);
    const third = vi.fn().mockResolvedValue(true);

    const result = await runAttempts([first, second, third]);

    expect(result).toBe(true);
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
    expect(third).not.toHaveBeenCalled();
  });

  it('returns false when every attempt fails', async () => {
    const result = await runAttempts([
      vi.fn().mockResolvedValue(false),
      vi.fn().mockResolvedValue(false),
    ]);
    expect(result).toBe(false);
  });
});
