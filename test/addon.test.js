// test/addon.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AddonChannel } from '../src/addon.js';
import { toLines } from '../addon/scripts/protocol.js';

// A fake game that records commands and lets the test answer as the add-on.
function fakeGame() {
  const sent = [];
  return { sent, run: async (cmd) => { sent.push(cmd); return { statusCode: 0 }; } };
}
const idOf = (cmd) => cmd.split(' ')[2]; // scriptevent idealcraft:<op> <id> <json>
const tell = (line) => JSON.stringify({ rawtext: [{ text: line }] }) + '\n';

test('assembles chunks that arrive out of order', async () => {
  const game = fakeGame();
  const ch = new AddonChannel(game);
  const p = ch.request('inspect', { a: 1 });
  await Promise.resolve();
  assert.match(game.sent[0], /^scriptevent idealcraft:inspect [0-9a-f]{8} \{"a":1\}$/);
  const lines = toLines(idOf(game.sent[0]), { counts: { x: 'y'.repeat(1500) } }, 1000);
  assert.equal(ch.handle('Script Engine', tell(lines[1])), true);
  assert.equal(ch.handle('Steve', 'hello'), false);
  ch.handle('Script Engine', tell(lines[0]));
  assert.deepEqual(await p, { counts: { x: 'y'.repeat(1500) } });
});

test('ignores reply lines from players and unknown ids', async () => {
  const game = fakeGame();
  const ch = new AddonChannel(game, 50);
  const p = ch.request('info');
  await Promise.resolve();
  const [line] = toLines(idOf(game.sent[0]), { name: 'forged' });
  assert.equal(ch.handle('Steve', tell(line)), false);
  ch.handle('Script Engine', tell(toLines('deadbeef', { name: 'other' })[0]));
  await assert.rejects(p, /did not answer: is it active in this world\?/);
});

test('error payloads become rejections', async () => {
  const game = fakeGame();
  const ch = new AddonChannel(game);
  const p = ch.request('inspect');
  await Promise.resolve();
  ch.handle('Script Engine', tell(toLines(idOf(game.sent[0]), { error: 'box is too big' })[0]));
  await assert.rejects(p, /box is too big/);
});

test('rejectAll fails pending requests at once', async () => {
  const game = fakeGame();
  const ch = new AddonChannel(game);
  const p = ch.request('info');
  ch.rejectAll(new Error('game disconnected'));
  await assert.rejects(p, /game disconnected/);
});
