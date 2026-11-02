import assert from 'node:assert/strict';
import { validateGeometry } from './geometry.mjs';

export const ACTION_FIELDS = ['buy', 'sell', 'craft', 'reroll', 'offers'];
const text = x => typeof x === 'string' && x.length > 0;

/** This contract is layout-only by design. Transaction evidence has a separate contract. */
export function validateLayoutRecord(record, { expectedRounds = null } = {}) {
  assert(record?.schema_version === 1, 'unsupported schema_version');
  assert(record.evidence_type === 'OBSERVED_LAYOUT_ONLY', 'unsupported evidence_type');
  assert(text(record.source?.namespace) && text(record.source?.build_id), 'source identity required');
  assert(/^[a-f0-9]{64}$/.test(record.source.payload_sha256), 'payload sha256 required');
  assert(text(record.class_id) && text(record.starting_bag_id), 'class/bag identity required');
  assert(record.confirmed_subclass_id === null || text(record.confirmed_subclass_id), 'subclass must be explicit or null');
  assert(Number.isSafeInteger(record.board?.rows) && record.board.rows > 0 && Number.isSafeInteger(record.board?.cols) && record.board.cols > 0, 'invalid board');
  assert(Array.isArray(record.rounds) && record.rounds.length > 0, 'rounds required');
  if (expectedRounds !== null) {
    assert(Number.isSafeInteger(expectedRounds) && expectedRounds > 0, 'invalid round profile');
    assert.equal(record.rounds.length, expectedRounds, 'incomplete requested round profile');
  }
  for (const [i, round] of record.rounds.entries()) {
    assert.equal(round.round, i + 1, 'rounds must be contiguous from 1');
    assert.equal(round.wallet, null, 'layout evidence does not contain spendable wallet');
    assert(round.actions && ACTION_FIELDS.every(k => Object.hasOwn(round.actions, k) && round.actions[k] === null), 'layout is not a transaction log');
    if (round.coord_source === 'INVENTORY_ONLY_NO_COORDS') {
      assert.equal(round.placements, null, 'missing coordinates must not be fabricated');
      continue;
    }
    assert.equal(round.coord_source, 'SOURCE_EXACT', 'unknown coordinate provenance');
    for (const p of round.placements ?? []) {
      assert(text(p.item_id) && p.item_id.startsWith(`${record.source.namespace}:`), 'namespaced item identity required');
      assert([p.r, p.c, p.rot].every(Number.isSafeInteger) && p.rot >= 0 && p.rot <= 3, 'invalid anchor/rotation');
    }
    const geometry = validateGeometry({ ...record.board, placements: round.placements });
    assert(geometry.valid, `invalid geometry: ${JSON.stringify(geometry.errors)}`);
  }
  return { valid: true, rounds: record.rounds.length, scope: 'CONTRACT_AND_GEOMETRY_ONLY' };
}
