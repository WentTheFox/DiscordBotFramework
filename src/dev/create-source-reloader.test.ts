import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// `createSourceReloader` works by registering a Node module-customization hook
// (`module.register()`) that participates in Node's *native* ESM loader pipeline.
// Vitest doesn't run test files through that pipeline — it transforms and caches
// modules itself (vite-node), so dynamic `import()` calls made from inside a test
// never reach our hook and this can't be exercised in-process. A real `node`
// child process, using the actual compiled/source entry points, is the only way
// to observe the real behavior.
const reloaderModulePath = fileURLToPath(new URL('./create-source-reloader.ts', import.meta.url));

let root: string;
let appDir: string;
let outsideDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'source-reloader-'));
  appDir = join(root, 'app');
  outsideDir = join(root, 'outside');
  await mkdir(appDir, { recursive: true });
  await mkdir(outsideDir, { recursive: true });

  await writeFile(join(outsideDir, 'singleton.mjs'), 'export const marker = {};\n');
  await writeFile(join(appDir, 'leaf.mjs'), "export const greet = () => 'v1';\n");
  await writeFile(
    join(appDir, 'entry.mjs'),
    [
      "import { greet } from './leaf.mjs';",
      "import { marker } from '../outside/singleton.mjs';",
      'export const value = greet();',
      'export { marker };',
    ].join('\n'),
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const runFixture = (scriptPath: string): string[] => execFileSync(process.execPath, ['--experimental-strip-types', scriptPath], {
  encoding: 'utf8',
}).split('\n').filter(Boolean);

describe('createSourceReloader', () => {
  it('picks up a change to a file transitively imported by the reimported entry point, without re-evaluating modules outside rootDir', async () => {
    const scriptPath = join(root, 'fixture.mjs');
    await writeFile(scriptPath, `
import { createSourceReloader } from ${JSON.stringify(reloaderModulePath)};
import { writeFileSync } from 'node:fs';

const reloader = createSourceReloader({ rootDir: ${JSON.stringify(appDir)} });
const entryPath = ${JSON.stringify(join(appDir, 'entry.mjs'))};
const leafPath = ${JSON.stringify(join(appDir, 'leaf.mjs'))};

const first = await reloader.reimport(entryPath);
writeFileSync(leafPath, "export const greet = () => 'v2';\\n");
const second = await reloader.reimport(entryPath);
const third = await reloader.reimport(entryPath);

console.log(first.value);
console.log(second.value);
console.log(third.value);
console.log(first.marker === second.marker && second.marker === third.marker);
`);

    const [firstValue, secondValue, thirdValue, markerStable] = runFixture(scriptPath);

    expect(firstValue).toBe('v1');
    expect(secondValue).toBe('v2');
    expect(thirdValue).toBe('v2');
    expect(markerStable).toBe('true');
  });
});
