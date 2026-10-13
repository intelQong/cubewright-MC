// addon/scripts/ops.js
// The add-on's read operations over a tiny world interface, so Node can test them:
// world.blockAt(x, y, z) -> block id, or undefined when that chunk is not loaded.
export const MAX_INSPECT = 32 * 32 * 32;
export const MAX_SIDE = 64;
export const MAX_SCAN = 128; // heights: blocks scanned per column, so one request can't freeze the game

// Not ground: what a footprint can sit on top of or clear away.
const NOT_GROUND = /^minecraft:(air|cave_air|void_air|short_grass|tall_grass|fern|large_fern|snow_layer|.*_leaves|.*flower.*|poppy|dandelion|.*_tulip|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|.*_sapling|.*bush.*|vine|.*_carpet)$/;

function span(a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new Error('coordinates must be integers');
  return [Math.min(a, b), Math.max(a, b)];
}

export function inspect(world, { from, to, layout = false }) {
  const [x1, x2] = span(from.x, to.x), [y1, y2] = span(from.y, to.y), [z1, z2] = span(from.z, to.z);
  const volume = (x2 - x1 + 1) * (y2 - y1 + 1) * (z2 - z1 + 1);
  if (volume > MAX_INSPECT) return { error: `box is ${volume} blocks; inspect at most ${MAX_INSPECT}` };
  const box = { from: { x: x1, y: y1, z: z1 }, to: { x: x2, y: y2, z: z2 } };
  const counts = {}, letters = {}, legend = {}, layers = [];
  const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const letter = (id) => {
    if (id === 'minecraft:air') return '.';
    if (id === 'unloaded') return '?';
    if (!(id in letters)) {
      const l = ALPHABET[Object.keys(letters).length] ?? '#';
      letters[id] = l;
      if (l !== '#') legend[l] = id;
    }
    return letters[id];
  };
  for (let y = y1; y <= y2; y++) {
    const rows = [];
    for (let z = z1; z <= z2; z++) {
      let row = '';
      for (let x = x1; x <= x2; x++) {
        const id = world.blockAt(x, y, z) ?? 'unloaded';
        counts[id] = (counts[id] ?? 0) + 1;
        if (layout) row += letter(id);
      }
      if (layout) rows.push(row);
    }
    if (layout) layers.push({ y, rows });
  }
  return layout ? { box, counts, legend, layers, note: 'rows run north to south (z), letters west to east (x); . air, ? unloaded' } : { box, counts };
}

// minY/maxY: the world's build range; the scan is clamped to it (getBlock fails outside it).
export function heights(world, { from, to, top, bottom, minY = -Infinity, maxY = Infinity }) {
  const [x1, x2] = span(from.x, to.x), [z1, z2] = span(from.z, to.z);
  const width = x2 - x1 + 1, depth = z2 - z1 + 1;
  if (width > MAX_SIDE || depth > MAX_SIDE) return { error: `area is ${width}x${depth}; survey at most ${MAX_SIDE}x${MAX_SIDE}` };
  if (!Number.isInteger(top) || !Number.isInteger(bottom)) return { error: 'top and bottom must be integers' };
  top = Math.min(top, maxY);
  bottom = Math.max(bottom, minY);
  if (top - bottom > MAX_SCAN) return { error: `scan range is ${top - bottom} blocks; at most ${MAX_SCAN}` };
  const palette = [], index = {};
  const heightsRows = [], surfaceRows = [];
  for (let z = z1; z <= z2; z++) {
    const hRow = [], sRow = [];
    for (let x = x1; x <= x2; x++) {
      let found = null, id;
      for (let y = top; y >= bottom; y--) {
        id = world.blockAt(x, y, z);
        if (id === undefined) break;
        if (!NOT_GROUND.test(id)) { found = y; break; }
      }
      hRow.push(found);
      if (found === null) sRow.push(null);
      else {
        if (!(id in index)) index[id] = palette.push(id) - 1;
        sRow.push(index[id]);
      }
    }
    heightsRows.push(hRow);
    surfaceRows.push(sRow);
  }
  return { origin: { x: x1, z: z1 }, width, depth, heights: heightsRows, surface: surfaceRows, palette,
    note: 'rows run north to south (z), columns west to east (x); heights is the top ground block y; null = not loaded or nothing in range' };
}
