import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, link, unlink, lstat } from 'node:fs/promises';
import path from 'node:path';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function verifyBytes(bytes, entry) {
  assert(/^[a-f0-9]{64}$/.test(entry?.sha256), 'invalid expected SHA256');
  assert(Number.isSafeInteger(entry.size) && entry.size >= 0, 'invalid expected size');
  assert.equal(bytes.length, entry.size, 'size mismatch');
  assert.equal(sha256(bytes), entry.sha256, 'SHA256 mismatch');
  return true;
}

/** One explicit ID per invocation. Destination must be a trusted local directory. */
export async function downloadVerified({ id, entry, baseUrl, outDir, fetchImpl = fetch, wait = ms => new Promise(r => setTimeout(r, ms)), attempts = 3, maxBytes = 32 * 1024 * 1024 }) {
  assert(typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id), 'unsafe id');
  assert(/^[a-f0-9]{64}$/.test(entry?.sha256) && Number.isSafeInteger(entry.size) && entry.size >= 0 && entry.size <= maxBytes, 'invalid manifest entry');
  assert(Number.isSafeInteger(attempts) && attempts >= 1 && attempts <= 5, 'attempts must be 1..5');
  assert(typeof outDir === 'string' && path.isAbsolute(outDir), 'absolute output directory required');
  const base = new URL(baseUrl);
  assert(base.protocol === 'https:' && !base.username && !base.password && !base.search && !base.hash, 'plain HTTPS base required');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const url = new URL(`${entry.sha256}.json`, base);
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${id}.json`);
  try {
    const stat = await lstat(file);
    assert(stat.isFile() && !stat.isSymbolicLink(), 'output must be a regular file');
    verifyBytes(await readFile(file), entry);
    return { status: 'REUSED', file, sha256: entry.sha256 };
  } catch (e) {
    if (e.code !== 'ENOENT') throw new Error('Existing file differs or is unsafe; not overwritten', { cause: e });
  }
  let bytes;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
      if (!response.ok) {
        const transient = response.status === 429 || response.status >= 500;
        if (!transient) throw Object.assign(new Error(`HTTP ${response.status}`), { noRetry: true });
        const retryAfter = Number(response.headers.get('retry-after'));
        if (retryAfter > 60) throw Object.assign(new Error('Retry-After exceeds local retry window; resume later'), { noRetry: true });
        if (attempt < attempts - 1 && retryAfter > 0) await wait(retryAfter * 1000);
        throw new Error(`HTTP ${response.status}`);
      }
      const chunks = []; let size = 0;
      assert(response.body, 'response body required');
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > entry.size || size > maxBytes) throw Object.assign(new Error('response exceeds declared size'), { noRetry: true });
        chunks.push(Buffer.from(chunk));
      }
      bytes = Buffer.concat(chunks);
      try { verifyBytes(bytes, entry); } catch (e) { e.noRetry = true; throw e; }
      break;
    } catch (e) {
      if (e.noRetry || attempt === attempts - 1) throw e;
      await wait(1000 * 2 ** attempt);
    }
  }
  // No disk write before integrity succeeds. Temp file is beside final output.
  const temporary = `${file}.${randomUUID()}.part`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    // Atomic no-clobber publication on filesystems supporting hard links (e.g. NTFS/ext4).
    // If another writer publishes first, fail rather than replacing their result.
    await link(temporary, file);
  } finally {
    await unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; });
  }
  return { status: 'DOWNLOADED', file, sha256: entry.sha256 };
}
