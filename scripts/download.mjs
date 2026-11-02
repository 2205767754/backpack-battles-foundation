import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { downloadVerified } from '../src/integrity.mjs';

const { values } = parseArgs({ options: {
  manifest: { type: 'string' }, id: { type: 'string' }, base: { type: 'string' }, out: { type: 'string' }
} });
try {
  for (const key of ['manifest', 'id', 'base', 'out']) if (!values[key]) throw new Error(`--${key} required`);
  const manifest = JSON.parse(await readFile(values.manifest, 'utf8'));
  // Adapter for the source manifest; locator variants fail closed until explicitly implemented.
  const entry = manifest.files?.[`example-${values.id}.json`];
  if (!entry || entry.locator) throw new Error('Missing/unsupported manifest entry');
  console.log(JSON.stringify(await downloadVerified({ id: values.id, entry, baseUrl: values.base, outDir: values.out }), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
