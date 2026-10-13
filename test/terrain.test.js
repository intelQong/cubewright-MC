// test/terrain.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSite } from '../src/terrain.js';

const survey = (heights, waterAt = []) => ({
  origin: { x: 10, z: 20 },
  width: heights[0].length,
  depth: heights.length,
  heights,
  palette: ['minecraft:grass_block', 'minecraft:water'],
  surface: heights.map((row, z) => row.map((h, x) => (h === null ? null : waterAt.some(([wx, wz]) => wx === x && wz === z) ? 1 : 0))),
});

test('picks the flattest footprint and returns world coordinates', () => {
  const s = survey([
    [70, 66, 64, 64],
    [70, 66, 64, 64],
    [70, 66, 65, 64],
  ]);
  assert.deepEqual(findSite(s, 2, 2), { x: 12, z: 20, y: 65, unevenness: 0 });
});

test('never builds on water or unloaded ground', () => {
  const s = survey([
    [64, 64, null],
    [64, 64, 64],
  ], [[0, 0]]);
  assert.deepEqual(findSite(s, 1, 2), { x: 11, z: 20, y: 65, unevenness: 0 });
  assert.equal(findSite(survey([[null]]), 1, 1), null);
});

test('rejects footprint sizes that are not integers from 1 to 64', () => {
  const s = survey([[64, 64], [64, 64]]);
  for (const [w, d] of [[0, 1], [1, -3], [1.5, 1], [1e9, 1], [1, NaN]]) {
    assert.throws(() => findSite(s, w, d), /1 to 64/, `${w}x${d}`);
  }
});
