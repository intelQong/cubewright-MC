// test/ops.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLines, parseLine } from '../addon/scripts/protocol.js';
import { inspect, heights } from '../addon/scripts/ops.js';

// Flat grass at y=64, stone below, a 2-high oak log at (3,65..66,3), water at (5,64,5),
// a flower at (1,65,1), and nothing loaded at x >= 100.
const world = {
  blockAt(x, y, z) {
    if (x >= 100) return undefined;
    if (x === 3 && z === 3 && (y === 65 || y === 66)) return 'minecraft:oak_log';
    if (x === 1 && z === 1 && y === 65) return 'minecraft:poppy';
    if (y === 64) return x === 5 && z === 5 ? 'minecraft:water' : 'minecraft:grass_block';
    if (y < 64) return 'minecraft:stone';
    return 'minecraft:air';
  },
};

test('reply lines round-trip, chunked', () => {
  const payload = { counts: { 'minecraft:stone': 12 }, note: 'x'.repeat(2500) };
  const lines = toLines('ab12cd34', payload, 1000);
  assert.equal(lines.length, 3);
  const parts = lines.map(parseLine);
  assert.deepEqual(parts.map((p) => [p.id, p.seq, p.total]), [['ab12cd34', 1, 3], ['ab12cd34', 2, 3], ['ab12cd34', 3, 3]]);
  assert.deepEqual(JSON.parse(parts.map((p) => p.chunk).join('')), payload);
});

test('parseLine rejects anything that is not a reply line', () => {
  assert.equal(parseLine('hello'), null);
  assert.equal(parseLine('§8ic short 1/1 {}'), null);
});

test('inspect counts blocks and marks unloaded ones', () => {
  const r = inspect(world, { from: { x: 98, y: 64, z: 0 }, to: { x: 101, y: 64, z: 0 } });
  assert.deepEqual(r.counts, { 'minecraft:grass_block': 2, unloaded: 2 });
});

test('inspect layout draws layers with a legend', () => {
  const r = inspect(world, { from: { x: 2, y: 65, z: 3 }, to: { x: 4, y: 65, z: 3 }, layout: true });
  assert.equal(r.layers.length, 1);
  assert.equal(r.layers[0].rows[0], '.a.');
  assert.equal(r.legend.a, 'minecraft:oak_log');
});

test('inspect refuses boxes over the limit', () => {
  const r = inspect(world, { from: { x: 0, y: 0, z: 0 }, to: { x: 40, y: 40, z: 40 } });
  assert.match(r.error, /at most 32768/);
});

test('heights finds the ground under plants, flags water, null when unloaded', () => {
  const r = heights(world, { from: { x: 0, z: 0 }, to: { x: 5, z: 5 }, top: 80, bottom: 50 });
  assert.equal(r.width, 6);
  assert.equal(r.heights[1][1], 64); // poppy skipped
  assert.equal(r.heights[3][3], 66); // log counts as surface
  assert.equal(r.palette[r.surface[5][5]], 'minecraft:water');
  const off = heights(world, { from: { x: 99, z: 0 }, to: { x: 100, z: 0 }, top: 80, bottom: 50 });
  assert.equal(off.heights[0][1], null);
});

test('heights refuses areas over 64x64', () => {
  assert.match(heights(world, { from: { x: 0, z: 0 }, to: { x: 64, z: 0 }, top: 80, bottom: 50 }).error, /64/);
});
