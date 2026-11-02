import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

function validateState(state) {
  assert(typeof state?.game_id === 'string' && state.game_id.length > 0, 'game_id required');
  assert(Number.isSafeInteger(state.revision) && state.revision >= 0, 'invalid revision');
  assert(Number.isSafeInteger(state.gold) && state.gold >= 0, 'invalid wallet');
  assert(Array.isArray(state.owned) && new Set(state.owned.map(x => x.instance_id)).size === state.owned.length, 'duplicate inventory instance');
  assert(state.owned.every(x => typeof x.instance_id === 'string' && x.instance_id && typeof x.item_id === 'string' && x.item_id), 'invalid inventory');
  assert(Array.isArray(state.offers) && new Set(state.offers.map(x => x.offer_id)).size === state.offers.length, 'duplicate offer identity');
  assert(state.offers.every(x => typeof x.offer_id === 'string' && x.offer_id && typeof x.item_id === 'string' && x.item_id && typeof x.sold_out === 'boolean' && Number.isSafeInteger(x.price) && x.price >= 0), 'invalid offers');
}

/** In-memory confirmed-event ledger. Upstream authentication/confirmation is NOT implemented here. */
export class PurchaseJournal {
  #state;
  #events = new Map();
  constructor(state) { validateState(state); this.#state = structuredClone(state); }
  snapshot() { return structuredClone(this.#state); }
  confirmPurchase(event) {
    assert(event?.confirmed === true, 'unconfirmed event must not advance');
    assert(typeof event.event_id === 'string' && event.event_id, 'event_id required');
    assert.equal(event.game_id, this.#state.game_id, 'wrong game');
    const prior = this.#events.get(event.event_id);
    if (prior) {
      assert(isDeepStrictEqual(prior, event), 'event_id reused with different payload');
      return { status: 'DUPLICATE', advance: false, replan_required: false, state: this.snapshot() };
    }
    assert.equal(event.expected_revision, this.#state.revision, 'stale/conflicting revision');
    assert(typeof event.instance_id === 'string' && event.instance_id, 'purchased instance required');
    assert(!this.#state.owned.some(x => x.instance_id === event.instance_id), 'instance already owned');
    const offer = this.#state.offers.find(x => x.offer_id === event.offer_id);
    assert(offer && !offer.sold_out, 'offer missing or already sold');
    assert.equal(event.item_id, offer.item_id, 'wrong purchased item');
    assert.equal(event.paid, offer.price, 'price mismatch; resync before acknowledgement');
    assert(this.#state.gold >= event.paid, 'insufficient recorded wallet; resync required');
    const next = structuredClone(this.#state);
    next.gold -= event.paid;
    next.owned.push({ instance_id: event.instance_id, item_id: event.item_id, location: 'stash' });
    next.offers.find(x => x.offer_id === event.offer_id).sold_out = true;
    next.revision++;
    validateState(next);
    this.#state = next;
    this.#events.set(event.event_id, structuredClone(event));
    return { status: 'APPLIED', advance: true, replan_required: true, state: this.snapshot() };
  }
}

/** Moving owned instances between board and stash cannot create, destroy or substitute an item. */
export function assertInventoryConserved(before, after) {
  const identities = list => {
    assert(Array.isArray(list), 'inventory array required');
    const seen = new Set();
    return list.map(x => {
      assert(typeof x.instance_id === 'string' && x.instance_id && typeof x.item_id === 'string' && x.item_id, 'inventory identity required');
      assert(!seen.has(x.instance_id), 'duplicate inventory identity');
      seen.add(x.instance_id);
      return JSON.stringify([x.instance_id, x.item_id]);
    }).sort();
  };
  assert.deepEqual(identities(after), identities(before), 'inventory not conserved');
  return true;
}
