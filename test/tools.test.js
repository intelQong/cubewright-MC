import { test } from 'node:test';
import assert from 'node:assert/strict';
import { box, volume, tiles, shellParts, facing } from '../src/tools.js';

test('tiles cover the box exactly and respect the limits', () => {
  const b = box({ x: -10, y: 0, z: 5 }, { x: 140, y: 70, z: 99 });
  const t = tiles(b, 64, 32768);
  assert.equal(t.reduce((n, x) => n + volume(x), 0), volume(b));
  for (const x of t) assert.ok(volume(x) <= 32768 && x.x2 - x.x1 < 64 && x.z2 - x.z1 < 64);
});

test('hollow shell + air interior equals the box, outline has no air', () => {
  const b = box({ x: 0, y: 0, z: 0 }, { x: 9, y: 5, z: 7 });
  const hollow = shellParts(b, 'stone', 'hollow');
  assert.equal(hollow.reduce((n, [p]) => n + volume(p), 0), volume(b));
  assert.equal(shellParts(b, 'stone', 'outline').filter(([, blk]) => blk === 'air').length, 0);
  // flat and thin boxes must not double count faces
  for (const thin of [box({ x: 0, y: 0, z: 0 }, { x: 9, y: 0, z: 9 }), box({ x: 0, y: 0, z: 0 }, { x: 0, y: 5, z: 9 })])
    assert.equal(shellParts(thin, 'stone', 'hollow').reduce((n, [p]) => n + volume(p), 0), volume(thin));
});

test('facing from Bedrock yRot', () => {
  assert.deepEqual([0, 90, 180, -180, -90, 359].map(facing), ['south', 'west', 'north', 'north', 'east', 'south']);
});

test('box rejects out-of-world y', () => {
  assert.throws(() => box({ x: 0, y: -65, z: 0 }, { x: 1, y: 1, z: 1 }));
});

test('a fill tile that changes nothing ("0 blocks filled") is not an error', async () => {
  const { makeTools, callTool } = await import('../src/tools.js');
  // Bedrock rejects a /fill that changes no block; the bridge's game.run turns that into an Error.
  const game = { run: async (cmd) => { if (cmd.endsWith(' air')) throw new Error('0 blocks filled'); return { statusCode: 0 }; } };
  const tools = makeTools(game, null);
  const out = await callTool(tools, 'fill', { from: { x: 0, y: 64, z: 0 }, to: { x: 4, y: 67, z: 4 }, block: 'oak_planks', mode: 'hollow' });
  assert.equal(out.error, false, out.text);
});

test('box accepts coordinates sent as numeric strings or decimals, rounding them', () => {
  assert.deepEqual(box({ x: '-40', y: 64.4, z: 2.6 }, { x: -38, y: '66', z: 3 }), { x1: -40, y1: 64, z1: 3, x2: -38, y2: 66, z2: 3 });
  assert.throws(() => box({ x: 'abc', y: 0, z: 0 }, { x: 1, y: 1, z: 1 }), /numbers/);
});
