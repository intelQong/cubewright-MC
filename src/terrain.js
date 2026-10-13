// src/terrain.js
// ponytail: brute force over every footprint position, O(W*D*w*d) and fine for 64x64; prefix min/max if it gets slow.
export function findSite(survey, width, depth) {
  const water = new Set(survey.palette.flatMap((id, i) => (/water|lava/.test(id) ? [i] : [])));
  let best = null;
  for (let z0 = 0; z0 + depth <= survey.depth; z0++) {
    for (let x0 = 0; x0 + width <= survey.width; x0++) {
      let lo = Infinity, hi = -Infinity, ok = true;
      for (let z = z0; z < z0 + depth && ok; z++) {
        for (let x = x0; x < x0 + width; x++) {
          const h = survey.heights[z][x];
          if (h === null || water.has(survey.surface[z][x])) { ok = false; break; }
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
      }
      if (ok && (!best || hi - lo < best.unevenness)) {
        best = { x: survey.origin.x + x0, z: survey.origin.z + z0, y: hi + 1, unevenness: hi - lo };
      }
    }
  }
  return best;
}
