import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { sha256, verifyBytes, downloadVerified } from '../src/integrity.mjs';

const bytes = Buffer.from('{"synthetic":true}');
const entry = { sha256: sha256(bytes), size: bytes.length };
async function sandbox(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bpb-foundation-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
const options = outDir => ({ id: 'synthetic-id', entry, baseUrl: 'https://example.invalid/layouts/', outDir, wait: async () => {} });
test('SHA256 uses known independent vector, not only self-generated fixtures', () => {
  assert.equal(sha256(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('exact digest and size are both required', () => {
  assert(verifyBytes(bytes, entry));
  assert.throws(() => verifyBytes(bytes, { ...entry, size: bytes.length + 1 }));
  assert.throws(() => verifyBytes(bytes, { ...entry, sha256: '0'.repeat(64) }));
});
test('verified download is atomically published and next run reuses without network', async t => {
  const outDir = await sandbox(t);
  const result = await downloadVerified({ ...options(outDir), fetchImpl: async (url, init) => {
    assert.equal(url.href, `https://example.invalid/layouts/${entry.sha256}.json`);
    assert.equal(init.redirect, 'error');
    return new Response(bytes);
  } });
  assert.equal(result.status, 'DOWNLOADED');
  assert.deepEqual(await readFile(result.file), bytes);
  const reused = await downloadVerified({ ...options(outDir), fetchImpl: () => { throw Error('must not fetch'); } });
  assert.equal(reused.status, 'REUSED');
  assert.deepEqual(await readdir(outDir), ['synthetic-id.json']);
});
test('integrity failure writes neither final nor temporary file', async t => {
  const outDir = await sandbox(t);
  await assert.rejects(downloadVerified({ ...options(outDir), fetchImpl: async () => new Response('X'.repeat(bytes.length)) }), /SHA256/);
  assert.deepEqual(await readdir(outDir), []);
});
test('oversized response fails closed before publication', async t => {
  const outDir = await sandbox(t);
  await assert.rejects(downloadVerified({ ...options(outDir), fetchImpl: async () => new Response(Buffer.alloc(bytes.length + 1)) }), /exceeds/);
  assert.deepEqual(await readdir(outDir), []);
});
test('existing corrupt local file is preserved rather than overwritten', async t => {
  const outDir = await sandbox(t), file = path.join(outDir, 'synthetic-id.json');
  await writeFile(file, 'preserve-me');
  await assert.rejects(downloadVerified({ ...options(outDir), fetchImpl: () => { throw Error('must not fetch'); } }), /not overwritten/);
  assert.equal(await readFile(file, 'utf8'), 'preserve-me');
});
test('429 honors retry delay, then succeeds with a finite attempt budget', async t => {
  const outDir = await sandbox(t); let calls = 0; const waits = [];
  await downloadVerified({ ...options(outDir), wait: async ms => waits.push(ms), fetchImpl: async () => ++calls === 1 ? new Response('', { status: 429, headers: { 'retry-after': '2' } }) : new Response(bytes) });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2000, 1000]);
});
test('404 is not retried and persistent 503 stops at configured attempt count', async t => {
  const outDir = await sandbox(t); let calls = 0;
  await assert.rejects(downloadVerified({ ...options(outDir), fetchImpl: async () => { calls++; return new Response('', { status: 404 }); } }), /404/);
  assert.equal(calls, 1); calls = 0;
  await assert.rejects(downloadVerified({ ...options(outDir), attempts: 2, fetchImpl: async () => { calls++; return new Response('', { status: 503 }); } }), /503/);
  assert.equal(calls, 2);
});
test('HTTP, credentials in URL and path traversal IDs are rejected before fetching', async t => {
  const outDir = await sandbox(t);
  for (const patch of [{ baseUrl: 'http://example.invalid/' }, { baseUrl: 'https://user:password@example.invalid/' }, { id: '../escape' }]) {
    await assert.rejects(downloadVerified({ ...options(outDir), ...patch, fetchImpl: () => { throw Error('must not fetch'); } }));
  }
  assert.deepEqual(await readdir(outDir), []);
});
test('another writer winning the final filename is never overwritten', async t => {
  const outDir = await sandbox(t), file = path.join(outDir, 'synthetic-id.json');
  await assert.rejects(downloadVerified({ ...options(outDir), fetchImpl: async () => {
    await writeFile(file, 'other-writer-result');
    return new Response(bytes);
  } }), { code: 'EEXIST' });
  assert.equal(await readFile(file, 'utf8'), 'other-writer-result');
  assert.deepEqual(await readdir(outDir), ['synthetic-id.json']);
});
