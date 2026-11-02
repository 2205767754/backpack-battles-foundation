import assert from 'node:assert/strict';

const cellKey = ([r, c]) => `${r},${c}`;
function cell(value) {
  assert(Array.isArray(value) && value.length === 2 && value.every(Number.isSafeInteger), 'integer cell required');
  return value;
}

/** Native library offsets are [dx,dy]. Do not normalize the source anchor. */
export function occupiedCells({ r, c, rot }, visual) {
  assert([r, c, rot].every(Number.isSafeInteger), 'integer anchor/rotation required');
  assert(rot >= 0 && rot <= 3 && Array.isArray(visual?.occupied?.[rot]), 'missing native rotation');
  const offsets = visual.occupied[rot];
  assert(offsets.length > 0, 'empty footprint');
  const result = offsets.map(offset => {
    const [dx, dy] = cell(offset);
    return [r + dy, c + dx];
  });
  assert(new Set(result.map(cellKey)).size === result.length, 'duplicate occupied cell');
  return result;
}

/** Bags and equipment occupy distinct layers; all item cells need bag coverage. */
export function validateGeometry({ rows, cols, placements }) {
  assert(Number.isSafeInteger(rows) && rows > 0 && Number.isSafeInteger(cols) && cols > 0, 'invalid board');
  assert(Array.isArray(placements), 'placements must be known, not null');
  const errors = [], ids = new Set(), layers = { bag: new Map(), item: new Map() };
  const inside = ([r, c]) => r >= 0 && r < rows && c >= 0 && c < cols;
  for (const p of placements) {
    assert(p && typeof p.instance_id === 'string' && p.instance_id.length > 0, 'instance_id required');
    assert(Object.hasOwn(layers, p.kind), 'geometry kind must be bag or item');
    assert(Array.isArray(p.occupied_cells) && p.occupied_cells.length > 0, 'occupied cells required');
    if (ids.has(p.instance_id)) errors.push({ code: 'DUPLICATE_INSTANCE', instance_id: p.instance_id });
    ids.add(p.instance_id);
    const own = new Set();
    for (const entry of p.occupied_cells) {
      cell(entry);
      const key = cellKey(entry), layer = layers[p.kind];
      if (own.has(key)) errors.push({ code: 'DUPLICATE_CELL', instance_id: p.instance_id, cell: entry });
      own.add(key);
      if (!inside(entry)) errors.push({ code: 'OUT_OF_BOUNDS', instance_id: p.instance_id, cell: entry });
      if (layer.has(key)) errors.push({ code: 'SAME_LAYER_OVERLAP', instance_id: p.instance_id, other: layer.get(key), cell: entry });
      layer.set(key, p.instance_id);
    }
  }
  for (const [key, id] of layers.item) {
    if (!layers.bag.has(key)) errors.push({ code: 'OUTSIDE_BAGS', instance_id: id, cell: key.split(',').map(Number) });
  }
  return { valid: errors.length === 0, errors, scope: 'GEOMETRY_ONLY', battle_optimality_proven: false };
}

/** Input channels are world [r,c] coordinates, not relative offsets. No effect eligibility implied. */
export function geometricLinks(source, targets) {
  assert(typeof source?.instance_id === 'string' && Array.isArray(targets), 'invalid link input');
  const links = [];
  for (const [channel, slots] of Object.entries(source.channels ?? {})) {
    assert(Array.isArray(slots), 'channel slots required');
    const keys = new Set(slots.map(s => cellKey(cell(s))));
    const seen = new Set();
    for (const target of targets) {
      if (target.instance_id === source.instance_id || target.kind !== 'item' || seen.has(target.instance_id)) continue;
      if (target.occupied_cells.some(s => keys.has(cellKey(cell(s))))) {
        seen.add(target.instance_id);
        links.push({ source: source.instance_id, target: target.instance_id, channel, evidence: 'GEOMETRIC_HIT_ONLY' });
      }
    }
  }
  return links;
}
