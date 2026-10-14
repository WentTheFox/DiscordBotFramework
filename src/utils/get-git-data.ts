import { exec } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import shellEscape from 'shell-escape';
import { NestableLogger } from '../logger/types.js';

const SHORT_HASH_LENGTH = 7;

/**
 * git-deploy-toolkit deploys a worktree without a `.git` directory, and records the deployed commit in
 * `.git-deploy-commit` instead (full hash on line 1, ISO commit date on line 2).
 */
async function getDeployedCommitData(): Promise<{ hash: string; timeAgo: string } | null> {
  try {
    const [hash, date] = (await readFile(join(process.cwd(), '.git-deploy-commit'), 'utf8')).split('\n').map((line) => line.trim());
    const timestamp = Date.parse(date);
    if (!hash || Number.isNaN(timestamp)) return null;
    return { hash: hash.slice(0, SHORT_HASH_LENGTH), timeAgo: String(Math.floor(timestamp / 1000)) };
  } catch {
    return null;
  }
}

export async function getGitData({ logger }: { logger: NestableLogger }): Promise<{ hash: string; timeAgo: string }> {
  const deployed = await getDeployedCommitData();
  if (deployed) return deployed;
  return new Promise((res, rej) => {
    const separator = ';';
    const command = shellEscape(`env -i git log -1 --date=short --pretty=format:%h${separator}%ct`.split(' '));
    exec(command, { cwd: process.cwd() }, (err, data) => {
      if (err) {
        logger.error('Error getting commit data', err);
        rej(new Error('Error while getting commit data'));
        return;
      }

      const [hash, timeAgo] = data.trim().split(separator);
      res({ hash, timeAgo });
    });
  });
}
