import assert from 'node:assert/strict';
import { readdir, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = [];
const topFiles = new Set(['README.md', 'package.json', '.gitignore', '.gitattributes']);
const dirs = new Set(['src', 'scripts', 'test', 'fixtures', 'schemas', 'docs', '.github']);
const allowedExtensions = new Set(['.md', '.json', '.mjs', '.yml']);
const secretPatterns = [
  new RegExp(['gh', '[opusr]_[A-Za-z0-9]{30,}'].join('')),
  new RegExp(['github', '_pat_[A-Za-z0-9_]{30,}'].join('')),
  new RegExp(['-----BEGIN ', '(?:RSA |EC |OPENSSH )?PRIVATE KEY-----'].join('')),
  /[A-Za-z]:[\\/](?:Users|codex)[\\/]/i
];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (dir === root && entry.name === '.git') continue;
    const file = path.join(dir, entry.name), rel = path.relative(root, file).split(path.sep).join('/');
    assert(!(await lstat(file)).isSymbolicLink(), `symlink not allowed: ${rel}`);
    const first = rel.split('/')[0];
    if (entry.isDirectory()) { assert(dirs.has(first), `unapproved directory: ${rel}`); await walk(file); continue; }
    assert(topFiles.has(rel) || dirs.has(first) && allowedExtensions.has(path.extname(rel)), `unapproved file: ${rel}`);
    const bytes = await readFile(file);
    assert(bytes.length <= 100_000 && !bytes.includes(0), `oversize/binary file: ${rel}`);
    const text = bytes.toString('utf8');
    for (const pattern of secretPatterns) assert(!pattern.test(text), `possible credential/local path: ${rel}`);
    files.push(rel);
  }
}
await walk(root);
console.log(JSON.stringify({ verdict: 'PASS', files: files.sort(), limitation: 'Allowlist/common-pattern checks only; manual review still required.' }, null, 2));
