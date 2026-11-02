import test from 'node:test';
import assert from 'node:assert/strict';
import { PurchaseJournal, assertInventoryConserved } from '../src/journal.mjs';

const state = () => ({ game_id: 'synthetic-game', revision: 0, gold: 4, owned: [], offers: [{ offer_id: 'A', item_id: 'synthetic:twig', price: 3, sold_out: false }] });
const event = () => ({ game_id: 'synthetic-game', event_id: 'E', expected_revision: 0, confirmed: true, instance_id: 'I', offer_id: 'A', item_id: 'synthetic:twig', paid: 3 });
test('confirmed purchase updates exact inventory, wallet and offer, then requests replanning', () => {
  const journal = new PurchaseJournal(state());
  const result = journal.confirmPurchase(event());
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.replan_required, true);
  assert.equal(result.state.gold, 1);
  assert.equal(result.state.revision, 1);
  assert.deepEqual(result.state.owned, [{ instance_id: 'I', item_id: 'synthetic:twig', location: 'stash' }]);
  assert.equal(result.state.offers[0].sold_out, true);
});
test('duplicate event is idempotent even though its expected revision is now old', () => {
  const journal = new PurchaseJournal(state());
  journal.confirmPurchase(event());
  const before = journal.snapshot(), duplicate = journal.confirmPurchase(event());
  assert.equal(duplicate.status, 'DUPLICATE');
  assert.equal(duplicate.advance, false);
  assert.deepEqual(journal.snapshot(), before);
});
test('event ID reuse with different payload is a conflict, not a second purchase', () => {
  const journal = new PurchaseJournal(state());
  journal.confirmPurchase(event());
  assert.throws(() => journal.confirmPurchase({ ...event(), paid: 2 }));
  assert.equal(journal.snapshot().owned.length, 1);
});
for (const [name, patch] of [
  ['unconfirmed', { confirmed: false }], ['wrong game', { game_id: 'another-game' }],
  ['stale revision', { expected_revision: 1 }], ['wrong item', { item_id: 'synthetic:other' }],
  ['wrong price', { paid: 1 }], ['missing offer', { offer_id: 'B' }]
]) test(`failed ${name} acknowledgement does not mutate or advance state`, () => {
  const journal = new PurchaseJournal(state()), before = journal.snapshot();
  assert.throws(() => journal.confirmPurchase({ ...event(), ...patch }));
  assert.deepEqual(journal.snapshot(), before);
  assert.equal(journal.confirmPurchase(event()).status, 'APPLIED');
});
test('impossible recorded budget waits for resync instead of forcing success', () => {
  const s = state(); s.gold = 2;
  const journal = new PurchaseJournal(s);
  assert.throws(() => journal.confirmPurchase(event()));
  assert.deepEqual(journal.snapshot(), s);
});
test('caller mutations of state, events and snapshots cannot corrupt journal', () => {
  const s = state(), journal = new PurchaseJournal(s), e = event();
  s.gold = 0;
  journal.confirmPurchase(e);
  e.paid = 0;
  const snap = journal.snapshot(); snap.owned.length = 0;
  assert.equal(journal.snapshot().owned.length, 1);
  assert.equal(journal.confirmPurchase(event()).status, 'DUPLICATE');
});
test('stash/board transfers conserve instances, substitutions and duplicates fail', () => {
  const before = [{ instance_id: 'I', item_id: 'synthetic:twig', location: 'stash' }];
  assert(assertInventoryConserved(before, [{ ...before[0], location: 'board' }]));
  assert.throws(() => assertInventoryConserved(before, []));
  assert.throws(() => assertInventoryConserved(before, [{ ...before[0], item_id: 'synthetic:other' }]));
  assert.throws(() => assertInventoryConserved(before, [before[0], before[0]]));
});
