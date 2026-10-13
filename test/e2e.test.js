// test/e2e.test.js
// The whole chain over a real WebSocket: tools -> bridge -> fake game -> fake add-on -> reply lines -> tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Bedrock } from '../src/bedrock.js';
import { AddonChannel } from '../src/addon.js';
import { makeTools, callTool } from '../src/tools.js';
import { inspect, heights } from '../addon/scripts/ops.js';
import { toLines } from '../addon/scripts/protocol.js';

// Flat grass at y=64 for x >= 0; west of x=0 the ground slopes up one block per block (x=-1 -> 65).
const world = { blockAt: (x, y, z) => (y <= (x < 0 ? 64 - x : 64) ? 'minecraft:grass_block' : 'minecraft:air') };

// withAddon=false plays a world where the add-on is not active: scriptevents go unanswered.
function fakeGame(port, withAddon = true) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/secret-token`);
  const event = (sender, text) => ws.send(JSON.stringify({
    header: { messagePurpose: 'event', eventName: 'PlayerMessage' },
    body: { type: 'tell', sender, receiver: 'Steve', message: JSON.stringify({ rawtext: [{ text }] }) },
  }));
  ws.on('message', (raw) => {
    const { header, body } = JSON.parse(raw);
    if (header.messagePurpose !== 'commandRequest') return;
    const details = JSON.stringify([{ dimension: 0, position: { x: 0.5, y: 66.62, z: 0.5 }, yRot: 180 }]);
    ws.send(JSON.stringify({ header: { requestId: header.requestId, messagePurpose: 'commandResponse' }, body: { statusCode: 0, details } }));
    if (!withAddon) return;
    const m = /^scriptevent cubewright:(\w+) (\w+) (.*)$/.exec(body.commandLine);
    if (!m) return;
    const [, op, id, json] = m;
    const args = JSON.parse(json);
    const payload = op === 'info'
      ? { name: 'Steve', position: { x: 0.5, y: 65, z: 0.5 }, yRot: 180, dimension: 'minecraft:overworld', looking_at: null, world_y_range: [-64, 319] }
      : op === 'inspect' ? inspect(world, args) : heights(world, { top: 80, bottom: 50, ...args });
    for (const line of toLines(id, payload, 200).reverse()) event('Script Engine', line); // out of order on purpose
  });
  return new Promise((resolve) => ws.on('open', () => resolve(ws)));
}

async function start(withAddon, timeoutMs) {
  const game = new Bedrock();
  const addon = new AddonChannel(game, timeoutMs);
  game.onChat = (sender, message) => addon.handle(sender, message);
  const wss = game.listen(0, '127.0.0.1', 'secret-token');
  await new Promise((r) => wss.on('listening', r));
  const ws = await fakeGame(wss.address().port, withAddon);
  await new Promise((r) => setTimeout(r, 50)); // let the bridge register the connection
  return { tools: makeTools(game, addon), stop: () => (ws.close(), wss.close()) };
}

test('player_info and survey_terrain work through the add-on channel', async (t) => {
  const { tools, stop } = await start(true, 2000);
  t.after(stop); // also on failure, or the open socket keeps node alive

  const info = JSON.parse((await callTool(tools, 'player_info', {})).text);
  assert.deepEqual(info.position, { x: 0, y: 65, z: 0 });
  assert.equal(info.facing, 'north');

  const out = await callTool(tools, 'survey_terrain', { from: { x: -4, z: 0 }, to: { x: 5, z: 5 }, site: { width: 4, depth: 4 } });
  assert.equal(out.error, false, out.text);
  const site = JSON.parse(out.text).site;
  assert.equal(site.y, 65);
  assert.equal(site.unevenness, 0);
  assert.equal(site.x, 0, 'the flat ground starts at x=0; the slope west of it is uneven');
});

test('without the add-on, player_info falls back to querytarget and read tools explain why', async (t) => {
  const { tools, stop } = await start(false, 200);
  t.after(stop);
  const info = JSON.parse((await callTool(tools, 'player_info', {})).text);
  assert.deepEqual(info.position, { x: 0, y: 65, z: 0 });
  assert.match(info.note, /did not answer/);
  const out = await callTool(tools, 'inspect_area', { from: { x: 0, y: 64, z: 0 }, to: { x: 1, y: 64, z: 1 } });
  assert.equal(out.error, true);
  assert.match(out.text, /is it active in this world/);
});
