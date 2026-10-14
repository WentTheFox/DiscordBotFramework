import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGitData } from './get-git-data.js';

describe('getGitData', () => {
  let dir: string;
  const logger = { error: vi.fn() } as never;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'git-data-'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('prefers .git-deploy-commit when present', async () => {
    await writeFile(join(dir, '.git-deploy-commit'), '1c2037f6689604ac6a48b2a1a073c85fef7612a4\n2026-10-11T14:27:20+02:00\n');

    await expect(getGitData({ logger })).resolves.toEqual({ hash: '1c2037f', timeAgo: String(Date.parse('2026-10-11T14:27:20+02:00') / 1000) });
  });

  it('falls back to git, which fails outside a repository', async () => {
    await expect(getGitData({ logger })).rejects.toThrow('Error while getting commit data');
  });
});
