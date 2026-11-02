import { readFile } from 'node:fs/promises';
import { validateLayoutRecord } from '../src/contracts.mjs';
import { geometricLinks } from '../src/geometry.mjs';
import { PurchaseJournal } from '../src/journal.mjs';

const record = JSON.parse(await readFile(new URL('../fixtures/synthetic-layout.json', import.meta.url), 'utf8'));
const layout = validateLayoutRecord(record);
const placements = record.rounds[0].placements;
const journal = new PurchaseJournal({ game_id: 'synthetic-game', revision: 0, gold: 4, owned: [], offers: [{ offer_id: 'offer-A', item_id: 'synthetic:twig', price: 3, sold_out: false }] });
const event = { event_id: 'event-A', game_id: 'synthetic-game', expected_revision: 0, confirmed: true, offer_id: 'offer-A', item_id: 'synthetic:twig', instance_id: 'owned-A', paid: 3 };
console.log(JSON.stringify({
  data: 'SYNTHETIC_ONLY',
  layout,
  links: geometricLinks(placements[1], placements),
  purchase: journal.confirmPurchase(event),
  duplicate: journal.confirmPurchase(event),
  real_game_verified: false
}, null, 2));
