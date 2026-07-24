// Generates real, standalone .json mirrors of every src/commands/schema/*.schema.ts
// fragment into build/commands/schema/, for non-TS tools that want to consume the
// framework's generic JSON Schema fragments directly. TypeScript's resolveJsonModule
// always widens imported JSON string/number values (confirmed: no config combination
// preserves literal types), so json-schema-to-ts's FromSchema cannot consume a real
// .json import - the .ts files (as const) are the actual source of truth used for both
// runtime ajv validation and compile-time type derivation. This script's output is a
// generated artifact only, regenerated on every build, never hand-edited.
import { readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(__dirname, '..', 'build', 'commands', 'schema');

const files = readdirSync(schemaDir).filter((f) => f.endsWith('.schema.js'));

for (const file of files) {
  const moduleUrl = pathToFileURL(join(schemaDir, file)).href;
  const mod = await import(moduleUrl);
  const [exportName] = Object.keys(mod);
  const schema = mod[exportName];
  const jsonPath = join(schemaDir, file.replace(/\.js$/, '.json'));
  writeFileSync(jsonPath, JSON.stringify(schema, null, 2) + '\n');
  console.log(`Generated ${jsonPath}`);
}
