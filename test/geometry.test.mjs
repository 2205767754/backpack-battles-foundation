import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { occupiedCells, validateGeometry, geometricLinks } from '../src/geometry.mjs';
import { validateLayoutRecord } from '../src/contracts.mjs';

const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/synthetic-layout.json', import.meta.url), 'utf8'));
test('native x/y offsets preserve negative anchor offsets and explicit rotation', () => {
  assert.deepEqual(occupiedCells({ r: 5, c: 7, rot: 1 }, { occupied: [null, [[-1, 0], [0, 2]]] }), [[5, 6], [7, 7]]);
});
test('native rotation is required rather than silently substituted', () => {
  assert.throws(() => occupiedCells({ r: 0, c: 0, rot: 2 }, { occupied: [[[0, 0]]] }));
});
test('fractional and repeated source cells are rejected', () => {
  assert.throws(() => occupiedCells({ r: 0.5, c: 0, rot: 0 }, { occupied: [[[0, 0]]] }));
  assert.throws(() => occupiedCells({ r: 0, c: 0, rot: 0 }, { occupied: [[[0, 0], [0, 0]]] }));
});
test('bag/item overlap is legal across layers, but item/item overlap is not', () => {
  const d = fixture(), ps = d.rounds[0].placements;
  assert.equal(validateGeometry({ ...d.board, placements: ps }).valid, true);
  ps[2].occupied_cells = [[0, 0]];
  assert(validateGeometry({ ...d.board, placements: ps }).errors.some(e => e.code === 'SAME_LAYER_OVERLAP'));
});
test('outside bag and board are different geometry failures', () => {
  const d = fixture(), ps = d.rounds[0].placements;
  ps[2].occupied_cells = [[2, 2], [3, 2]];
  const codes = validateGeometry({ ...d.board, placements: ps }).errors.map(e => e.code);
  assert(codes.includes('OUT_OF_BOUNDS'));
  assert(codes.includes('OUTSIDE_BAGS'));
});
test('duplicate instance identities do not disappear into occupancy maps', () => {
  const d = fixture();
  d.rounds[0].placements[2].instance_id = 'item-1';
  assert(validateGeometry({ ...d.board, placements: d.rounds[0].placements }).errors.some(e => e.code === 'DUPLICATE_INSTANCE'));
});
test('star channels are independent and multi-cell targets count once per channel', () => {
  const source = { instance_id: 'a', channels: { star: [[0, 1], [0, 2]], diamond: [[0, 2]] } };
  const target = { instance_id: 'b', kind: 'item', occupied_cells: [[0, 1], [0, 2]] };
  assert.deepEqual(geometricLinks(source, [target, target]), [
    { source: 'a', target: 'b', channel: 'star', evidence: 'GEOMETRIC_HIT_ONLY' },
    { source: 'a', target: 'b', channel: 'diamond', evidence: 'GEOMETRIC_HIT_ONLY' }
  ]);
});
test('synthetic record passes contract without pretending to cover eighteen rounds', () => {
  assert.equal(validateLayoutRecord(fixture()).rounds, 1);
  assert.throws(() => validateLayoutRecord(fixture(), { expectedRounds: 18 }));
});
test('eighteen-round profile verifies every round and rejects gaps', () => {
  const d = fixture();
  d.rounds = Array.from({ length: 18 }, (_, i) => ({ ...structuredClone(d.rounds[0]), round: i + 1 }));
  assert.equal(validateLayoutRecord(d, { expectedRounds: 18 }).rounds, 18);
  d.rounds[8].round = 10;
  assert.throws(() => validateLayoutRecord(d, { expectedRounds: 18 }));
});
test('missing coordinates are null, never fabricated origin coordinates', () => {
  const d = fixture();
  d.rounds[0].coord_source = 'INVENTORY_ONLY_NO_COORDS';
  d.rounds[0].placements = null;
  assert(validateLayoutRecord(d).valid);
  d.rounds[0].placements = [];
  assert.throws(() => validateLayoutRecord(d));
});
test('unknown transactions cannot be replaced with a known-empty purchase list', () => {
  const d = fixture();
  d.rounds[0].actions.buy = [];
  assert.throws(() => validateLayoutRecord(d));
});
test('layout evidence cannot supply a wallet or mixed-namespace item', () => {
  const d = fixture();
  d.rounds[0].wallet = 1234;
  assert.throws(() => validateLayoutRecord(d));
  d.rounds[0].wallet = null;
  d.rounds[0].placements[0].item_id = 'other:bag';
  assert.throws(() => validateLayoutRecord(d));
});
test('missing coordinates do not excuse a malformed board definition', () => {
  const d = fixture();
  d.rounds[0].coord_source = 'INVENTORY_ONLY_NO_COORDS';
  d.rounds[0].placements = null;
  d.board.rows = -1;
  assert.throws(() => validateLayoutRecord(d));
});
