import { exec } from 'node:child_process';
import shellEscape from 'shell-escape';
import { NestableLogger } from '../logger/types.js';

export function getGitData({ logger }: { logger: NestableLogger }): Promise<{ hash: string; timeAgo: string }> {
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
