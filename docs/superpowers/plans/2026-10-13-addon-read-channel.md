# Add-on Read Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any AI see the player's Bedrock world (blocks, ground heights, crosshair) through an add-on, and run the bridge as a sandboxed service on the VM.

**Architecture:** The bridge sends `/scriptevent idealcraft:<op> <id> <json>` over the existing `/connect` socket; the add-on answers with `tellraw` lines `§8ic <id> <seq>/<total> <chunk>` that come back as `PlayerMessage` events from `Script Engine`. The add-on's read logic lives in a pure module (`addon/scripts/ops.js`) that Node can test, with a thin Script API adapter (`main.js`) around it.

**Tech Stack:** Node 22 (ESM, `node:test`), `ws` 8, Minecraft Bedrock Script API `@minecraft/server` 1.11.0, systemd.

**Spec:** `docs/superpowers/specs/2026-10-13-bedrock-ios-ai-builder-design.md`

## Global Constraints

- Script module dependency is exactly `@minecraft/server` version `1.11.0`; no experiments (2.0.0 did not load on the iPhone).
- Replies are accepted only from sender `Script Engine` with a pending 8-hex-character id.
- `player.sendMessage` does not reach `/connect`; replies use `dimension.runCommand("tellraw ...")` to the requesting player only.
- Reply chunk size starts at 1000 characters (constant `CHUNK` in `addon/scripts/protocol.js`).
- Inspect limit 32×32×32 blocks; heights limit 64×64 columns.
- Request timeout 10 s; a missing add-on yields the error text `the IdealCraft add-on did not answer: is it active in this world?`.
- Bridge listens on `10.100.0.1:8000` (WireGuard only), MCP on `127.0.0.1:8001`; token from `BRIDGE_TOKEN`.
- The service is not enabled at boot; it runs as user `idealcraft` with `ProtectHome=true`, `ProtectSystem=strict`, `NoNewPrivileges=true`, `PrivateTmp=true`.
- Node lives under `/home/ubuntu/.nvm/...`, which `ProtectHome` hides: the service uses a copy at `/srv/idealcraft/bin/node`.
- No CraftAI code or prompt text is copied.
- Biome is not reported: `@minecraft/server` 1.11.0 has no biome API (spec deviation; revisit when a newer module loads on iOS).

## Review Focus

1. Add-on not active in the world → every read tool returns the "did not answer" error within 10 s; `player_info` still works through `querytarget`.
2. Reply chunks arrive out of order or interleaved with other chat → the payload still assembles correctly.
3. A player types a fake reply line (`§8ic deadbeef 1/1 {}`) → ignored, because the sender is not `Script Engine` and the id is unknown.
4. The area includes unloaded chunks → those blocks report as `unloaded` (inspect) or `null` (heights), never a crash.
5. The game disconnects mid-request → the request fails at once with "game disconnected", not after the timeout.

---

## File Structure

| File | Responsibility |
|---|---|
| `addon/manifest.json` | Behavior pack manifest (create) |
| `addon/scripts/protocol.js` | Reply line format: `toLines` (add-on side), `parseLine` (bridge side). No `@minecraft` imports. (create) |
| `addon/scripts/ops.js` | Pure read ops `inspect`, `heights` over `world.blockAt(x,y,z)`. (create) |
| `addon/scripts/main.js` | Script API adapter: scriptevent → op → tellraw lines; `info`. (create) |
| `scripts/pack-addon.sh` | Zips `addon/` into `dist/IdealCraft.mcpack` (create) |
| `src/addon.js` | `AddonChannel`: request ids, chunk assembly, sender check, timeout (create) |
| `src/terrain.js` | `findSite(survey, width, depth)` flattest-footprint search (create) |
| `src/bedrock.js` | add `onDisconnect` hook (modify) |
| `src/tools.js` | `makeTools(game, addon)`; `player_info` via add-on with fallback; new `inspect_area`, `survey_terrain` (modify) |
| `src/agent.js` | system prompt mentions the new tools (modify) |
| `src/index.js` | wire `AddonChannel` into chat and disconnect handling (modify) |
| `test/addon.test.js`, `test/ops.test.js`, `test/terrain.test.js`, `test/e2e.test.js` | tests (create) |
| `deploy/idealcraft-bridge.service`, `deploy/install.sh` | sandboxed service (create) |

---

### Task 1: Reply protocol and pure read ops

**Files:**
- Create: `addon/scripts/protocol.js`, `addon/scripts/ops.js`
- Test: `test/ops.test.js`

**Interfaces:**
- Produces:
  - `toLines(id: string, payload: object, size = CHUNK): string[]`
  - `parseLine(text: string): {id: string, seq: number, total: number, chunk: string} | null`
  - `inspect(world, {from, to, layout?: boolean}): {box, counts} | {box, counts, legend, layers} | {error}`
  - `heights(world, {from, to, top, bottom}): {origin: {x, z}, width, depth, heights: (number|null)[][], surface: (number|null)[][], palette: string[]} | {error}`
  - `world` is `{ blockAt(x, y, z): string | undefined }` (undefined = chunk not loaded)

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/ops.test.js`
Expected: FAIL with `Cannot find module '.../addon/scripts/protocol.js'`

- [ ] **Step 3: Write the implementation**

```js
// addon/scripts/protocol.js
// Reply lines from the add-on to the bridge. Shared by both sides; no @minecraft imports so Node can test it.
export const CHUNK = 1000;

export function toLines(id, payload, size = CHUNK) {
  const text = JSON.stringify(payload);
  const total = Math.max(1, Math.ceil(text.length / size));
  const lines = [];
  for (let i = 0; i < total; i++) lines.push(`§8ic ${id} ${i + 1}/${total} ${text.slice(i * size, (i + 1) * size)}`);
  return lines;
}

export function parseLine(text) {
  const m = /^§8ic ([0-9a-f]{8}) (\d+)\/(\d+) (.*)$/s.exec(text);
  return m && { id: m[1], seq: Number(m[2]), total: Number(m[3]), chunk: m[4] };
}
```

```js
// addon/scripts/ops.js
// The add-on's read operations over a tiny world interface, so Node can test them:
// world.blockAt(x, y, z) -> block id, or undefined when that chunk is not loaded.
export const MAX_INSPECT = 32 * 32 * 32;
export const MAX_SIDE = 64;

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

export function heights(world, { from, to, top, bottom }) {
  const [x1, x2] = span(from.x, to.x), [z1, z2] = span(from.z, to.z);
  const width = x2 - x1 + 1, depth = z2 - z1 + 1;
  if (width > MAX_SIDE || depth > MAX_SIDE) return { error: `area is ${width}x${depth}; survey at most ${MAX_SIDE}x${MAX_SIDE}` };
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/ops.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add addon/scripts/protocol.js addon/scripts/ops.js test/ops.test.js
git commit -m "Add-on: reply protocol and pure read ops (inspect, heights)"
```

---

### Task 2: Add-on pack (Script API adapter and packaging)

**Files:**
- Create: `addon/manifest.json`, `addon/scripts/main.js`, `scripts/pack-addon.sh`
- Modify: `.gitignore` (add `dist/`), `package.json` (script `pack:addon`)

**Interfaces:**
- Consumes: `toLines` (Task 1), `inspect`, `heights` (Task 1)
- Produces: in-game ops `idealcraft:info`, `idealcraft:inspect`, `idealcraft:heights`. `info` payload:
  `{name, position: {x, y, z} (feet, floats), yRot, dimension, looking_at: {block, x, y, z} | null, world_y_range: [min, max]}`

- [ ] **Step 1: Write the manifest** (generate fresh UUIDs with `cat /proc/sys/kernel/random/uuid`; the two must differ)

```json
{
  "format_version": 2,
  "header": {
    "name": "IdealCraft AI",
    "description": "Lets the IdealCraft AI bridge see your world. Read only.",
    "uuid": "<uuid-1>",
    "version": [0, 1, 0],
    "min_engine_version": [1, 20, 80]
  },
  "modules": [
    { "type": "script", "language": "javascript", "uuid": "<uuid-2>", "version": [0, 1, 0], "entry": "scripts/main.js" }
  ],
  "dependencies": [{ "module_name": "@minecraft/server", "version": "1.11.0" }]
}
```

- [ ] **Step 2: Write the adapter**

```js
// addon/scripts/main.js
// Script API side: answers /scriptevent idealcraft:<op> <id> <json> with tellraw reply lines.
import { system, world } from '@minecraft/server';
import { toLines } from './protocol.js';
import { inspect, heights } from './ops.js';

function info(player) {
  const hit = player.getBlockFromViewDirection({ maxDistance: 64, includeLiquidBlocks: true });
  const { min, max } = player.dimension.heightRange;
  return {
    name: player.name,
    position: player.location,
    yRot: player.getRotation().y,
    dimension: player.dimension.id,
    looking_at: hit ? { block: hit.block.typeId, ...hit.block.location } : null,
    world_y_range: [min, max - 1],
  };
}

system.afterEvents.scriptEventReceive.subscribe((e) => {
  if (!e.id.startsWith('idealcraft:')) return;
  const [id, ...rest] = e.message.split(' ');
  if (!/^[0-9a-f]{8}$/.test(id)) return;
  const player = e.sourceEntity?.typeId === 'minecraft:player' ? e.sourceEntity : world.getPlayers()[0];
  if (!player) return;

  let payload;
  try {
    const args = rest.length ? JSON.parse(rest.join(' ')) : {};
    const dim = player.dimension;
    const view = { blockAt: (x, y, z) => { try { return dim.getBlock({ x, y, z })?.typeId; } catch { return undefined; } } };
    const feet = Math.floor(player.location.y);
    const op = e.id.slice('idealcraft:'.length);
    if (op === 'info') payload = info(player);
    else if (op === 'inspect') payload = inspect(view, args);
    else if (op === 'heights') payload = heights(view, { top: feet + 40, bottom: feet - 40, ...args });
    else payload = { error: `unknown op ${op}` };
  } catch (err) {
    payload = { error: String(err?.message ?? err) };
  }

  const target = `@a[name=${JSON.stringify(player.name)}]`;
  for (const line of toLines(id, payload)) {
    player.dimension.runCommand(`tellraw ${target} ${JSON.stringify({ rawtext: [{ text: line }] })}`);
  }
});

system.runTimeout(() => world.sendMessage('§8IdealCraft add-on ready'), 100);
```

- [ ] **Step 3: Write the pack script and wire it**

```sh
#!/bin/sh
# scripts/pack-addon.sh: builds dist/IdealCraft.mcpack from addon/
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/IdealCraft.mcpack
(cd addon && zip -qr ../dist/IdealCraft.mcpack manifest.json scripts)
echo dist/IdealCraft.mcpack
```

Run: `chmod +x scripts/pack-addon.sh && printf 'dist/\n' >> .gitignore`
Add to `package.json` scripts: `"pack:addon": "sh scripts/pack-addon.sh"`

- [ ] **Step 4: Verify the pack builds and the scripts parse**

Run: `npm run pack:addon && unzip -l dist/IdealCraft.mcpack && node --check addon/scripts/protocol.js && node --check addon/scripts/ops.js`
Expected: archive lists `manifest.json`, `scripts/main.js`, `scripts/protocol.js`, `scripts/ops.js`; no syntax errors.
(`main.js` imports `@minecraft/server`, so it can only be checked in game: Task 7.)

- [ ] **Step 5: Commit**

```bash
git add addon/manifest.json addon/scripts/main.js scripts/pack-addon.sh .gitignore package.json
git commit -m "Add-on: Script API adapter and mcpack build"
```

---

### Task 3: Bridge add-on channel

**Files:**
- Create: `src/addon.js`
- Modify: `src/bedrock.js` (add `onDisconnect`), `src/index.js` (wire channel)
- Test: `test/addon.test.js`

**Interfaces:**
- Consumes: `parseLine` (Task 1); `game.run(commandLine): Promise<body>` (existing `Bedrock`)
- Produces:
  - `new AddonChannel(game, timeoutMs = 10000)`
  - `channel.request(op: string, args?: object): Promise<object>` (rejects with the payload's `error` text, the timeout text, or the run error)
  - `channel.handle(sender: string, message: string): boolean` (true = it was an add-on reply line, do not treat as chat)
  - `channel.rejectAll(err: Error): void`
  - `Bedrock#onDisconnect: () => void` (called when the game socket closes)

- [ ] **Step 1: Write the failing tests**

```js
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
const idOf = (cmd) => cmd.split(' ')[1];
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/addon.test.js`
Expected: FAIL with `Cannot find module '.../src/addon.js'`

- [ ] **Step 3: Write the implementation**

```js
// src/addon.js
// Request/response with the IdealCraft add-on: /scriptevent out, tellraw reply lines back.
import { randomBytes } from 'node:crypto';
import { parseLine } from '../addon/scripts/protocol.js';

// A tell arrives as its rawtext JSON; a say arrives as plain text.
function textOf(message) {
  try { return JSON.parse(message).rawtext.map((r) => r.text ?? '').join(''); } catch { return String(message); }
}

export class AddonChannel {
  pending = new Map();

  constructor(game, timeoutMs = 10_000) {
    this.game = game;
    this.timeoutMs = timeoutMs;
  }

  async request(op, args = {}) {
    const id = randomBytes(4).toString('hex');
    const reply = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('the IdealCraft add-on did not answer: is it active in this world?'));
      }, this.timeoutMs);
      this.pending.set(id, { parts: new Map(), resolve, reject, timer });
    });
    try {
      await this.game.run(`scriptevent idealcraft:${op} ${id} ${JSON.stringify(args)}`);
    } catch (err) {
      this.#finish(id, null, err);
    }
    const payload = await reply;
    if (payload.error) throw new Error(payload.error);
    return payload;
  }

  // True when the message is an add-on reply line (consumed); false for everything else.
  handle(sender, message) {
    if (sender !== 'Script Engine') return false;
    const line = parseLine(textOf(message).trim());
    if (!line) return false;
    const p = this.pending.get(line.id);
    if (!p) return true;
    p.parts.set(line.seq, line.chunk);
    if (p.parts.size < line.total) return true;
    const text = [...p.parts.keys()].sort((a, b) => a - b).map((k) => p.parts.get(k)).join('');
    try { this.#finish(line.id, JSON.parse(text)); } catch { this.#finish(line.id, null, new Error('add-on reply was not valid JSON')); }
    return true;
  }

  rejectAll(err) {
    for (const id of [...this.pending.keys()]) this.#finish(id, null, err);
  }

  #finish(id, payload, err) {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    if (err) p.reject(err);
    else p.resolve(payload);
  }
}
```

In `src/bedrock.js`, add the field `onDisconnect = () => {};` next to `onChat`, and in the socket `close` handler, after `this.pending.clear();`, add `this.onDisconnect();`.

In `src/index.js`:
- import: `import { AddonChannel } from './addon.js';`
- after `const game = new Bedrock();`: `const addon = new AddonChannel(game);` and `game.onDisconnect = () => addon.rejectAll(new Error('game disconnected'));`
- change `const tools = makeTools(game);` to `const tools = makeTools(game, addon);` (Task 4 adds the parameter; JS ignores it until then)
- first line of `game.onChat`: `if (addon.handle(sender, message)) return;`

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS (all existing tests plus 4 new)

- [ ] **Step 5: Commit**

```bash
git add src/addon.js src/bedrock.js src/index.js test/addon.test.js
git commit -m "Bridge: add-on request/reply channel"
```

---

### Task 4: Read tools and site search

**Files:**
- Create: `src/terrain.js`
- Modify: `src/tools.js`, `src/agent.js` (system prompt)
- Test: `test/terrain.test.js`

**Interfaces:**
- Consumes: `AddonChannel#request` (Task 3); `heights` payload shape (Task 1); `info` payload (Task 2); existing `facing(yRot)`
- Produces:
  - `findSite(survey, width, depth): {x, z, y, unevenness} | null`: `y` is the first block above the highest ground in the footprint; water and `null` columns are never chosen
  - `makeTools(game, addon)` with tools `player_info`, `inspect_area`, `survey_terrain`, `fill`, `say`, `run_command`, `undo`

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/terrain.test.js`
Expected: FAIL with `Cannot find module '.../src/terrain.js'`

- [ ] **Step 3: Write the implementation**

```js
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
```

In `src/tools.js`:
- `import { findSite } from './terrain.js';`
- change the signature to `export function makeTools(game, addon) {`
- replace the `player_info` tool's `description` and `run` with:

```js
      description:
        'Where the player is: position (feet), facing, dimension, the block in the crosshair (looking_at), world height. ' +
        'Call it first; build relative to it. +x east, +z south, +y up.',
      async run() {
        try {
          const p = await addon.request('info');
          const pos = { x: Math.floor(p.position.x), y: Math.floor(p.position.y), z: Math.floor(p.position.z) };
          return { position: pos, facing: facing(p.yRot), dimension: p.dimension.replace('minecraft:', ''), looking_at: p.looking_at, world_y_range: p.world_y_range };
        } catch (err) {
          const res = await game.run('querytarget @s');
          const [p] = JSON.parse(res.details);
          const pos = { x: Math.floor(p.position.x), y: Math.floor(p.position.y - 1.62), z: Math.floor(p.position.z) };
          return { position: pos, facing: facing(p.yRot), dimension: ['overworld', 'nether', 'the_end'][p.dimension] ?? p.dimension, world_y_range: [MIN_Y, MAX_Y], note: `limited info: ${err.message}` };
        }
      },
```

- add these two tools after `player_info`:

```js
    {
      name: 'inspect_area',
      description:
        'The exact blocks in a box (at most 32x32x32) as counts per block id. With layout=true also as layers of letters ' +
        '(one layer per y, rows north to south, letters west to east) with a legend: use thin slices to check walls, roofs and stairs.',
      inputSchema: { type: 'object', properties: { from: point, to: point, layout: { type: 'boolean' } }, required: ['from', 'to'] },
      async run({ from, to, layout = false }) {
        return addon.request('inspect', { from, to, layout });
      },
    },
    {
      name: 'survey_terrain',
      description:
        'Ground heights and surface blocks over an area (at most 64x64, x/z only), scanning 40 blocks above and below the player. ' +
        'With site {width, depth}, also finds the flattest dry spot for that footprint: build with its x,z as the north-west corner and y as the first block above ground.',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'object', properties: { x: { type: 'integer' }, z: { type: 'integer' } }, required: ['x', 'z'] },
          to: { type: 'object', properties: { x: { type: 'integer' }, z: { type: 'integer' } }, required: ['x', 'z'] },
          site: { type: 'object', properties: { width: { type: 'integer' }, depth: { type: 'integer' } }, required: ['width', 'depth'] },
        },
        required: ['from', 'to'],
      },
      async run({ from, to, site }) {
        const survey = await addon.request('heights', { from, to });
        if (!site) return survey;
        return { ...survey, site: findSite(survey, site.width, site.depth) ?? 'no dry, loaded spot that size in this area' };
      },
    },
```

In `src/agent.js`, replace the first two lines of `SYSTEM` after the opening sentence with:

```
Call player_info first and build relative to it, unless the player gives coordinates: by default 6 to 15 blocks ahead of them, in the direction they face (north -z, south +z, east +x, west -x).
Before building anything bigger than a hut, call survey_terrain over the area ahead with site set to the footprint, and build on the site it returns. Use inspect_area to see what is already there and to check your work.
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/terrain.js src/tools.js src/agent.js test/terrain.test.js
git commit -m "Tools: player_info via add-on, inspect_area, survey_terrain with site search"
```

---

### Task 5: End-to-end test with a fake game

**Files:**
- Test: `test/e2e.test.js`

**Interfaces:**
- Consumes: `Bedrock` (`listen(port, host, token)` returns the `WebSocketServer`), `AddonChannel`, `makeTools`, `callTool`, `inspect`, `heights`, `toLines`

- [ ] **Step 1: Write the test**

```js
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
    const m = /^scriptevent idealcraft:(\w+) (\w+) (.*)$/.exec(body.commandLine);
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

test('player_info and survey_terrain work through the add-on channel', async () => {
  const { tools, stop } = await start(true, 2000);

  const info = JSON.parse((await callTool(tools, 'player_info', {})).text);
  assert.deepEqual(info.position, { x: 0, y: 65, z: 0 });
  assert.equal(info.facing, 'north');

  const out = await callTool(tools, 'survey_terrain', { from: { x: -4, z: 0 }, to: { x: 5, z: 5 }, site: { width: 4, depth: 4 } });
  assert.equal(out.error, false, out.text);
  const site = JSON.parse(out.text).site;
  assert.equal(site.y, 65);
  assert.equal(site.unevenness, 0);
  assert.equal(site.x, 0, 'the flat ground starts at x=0; the slope west of it is uneven');
  stop();
});

test('without the add-on, player_info falls back to querytarget and read tools explain why', async () => {
  const { tools, stop } = await start(false, 200);
  const info = JSON.parse((await callTool(tools, 'player_info', {})).text);
  assert.deepEqual(info.position, { x: 0, y: 65, z: 0 });
  assert.match(info.note, /did not answer/);
  const out = await callTool(tools, 'inspect_area', { from: { x: 0, y: 64, z: 0 }, to: { x: 1, y: 64, z: 1 } });
  assert.equal(out.error, true);
  assert.match(out.text, /is it active in this world/);
  stop();
});
```

- [ ] **Step 2: Run it**

Run: `node --test test/e2e.test.js`
Expected: PASS (2 tests). If it fails, fix the code from Tasks 1–4 (not the test) unless the test contradicts the spec.

- [ ] **Step 3: Commit**

```bash
git add test/e2e.test.js
git commit -m "Test: end-to-end add-on channel over a real WebSocket"
```

---

### Task 6: Sandboxed service on the VM

**Files:**
- Create: `deploy/idealcraft-bridge.service`, `deploy/install.sh`
- Modify: `README.md` (section "Run on the VM")

- [ ] **Step 1: Write the unit**

```ini
# deploy/idealcraft-bridge.service
[Unit]
Description=IdealCraft AI bridge (Minecraft Bedrock)
After=network-online.target wg-quick@wg0.service
Wants=network-online.target

[Service]
User=idealcraft
Group=idealcraft
WorkingDirectory=/srv/idealcraft
EnvironmentFile=/etc/idealcraft.env
ExecStart=/srv/idealcraft/bin/node src/index.js
Restart=on-failure
RestartSec=5
ProtectHome=true
ProtectSystem=strict
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Write the installer** (idempotent; never enables at boot; keeps an existing env file)

```sh
#!/bin/sh
# deploy/install.sh: copies the bridge to /srv/idealcraft and installs the service. Run with sudo from the repo root.
set -e
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
NODE_BIN="${NODE_BIN:-$(command -v node)}"
id idealcraft >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin idealcraft
mkdir -p /srv/idealcraft/bin
cp -r src package.json /srv/idealcraft/
cp -r addon /srv/idealcraft/        # src/addon.js imports addon/scripts/protocol.js
cp -r node_modules /srv/idealcraft/
cp "$NODE_BIN" /srv/idealcraft/bin/node
chown -R root:root /srv/idealcraft && chmod -R go-w /srv/idealcraft
if [ ! -f /etc/idealcraft.env ]; then
  umask 077
  printf 'WS_HOST=10.100.0.1\nBRIDGE_TOKEN=%s\n# AI_MODEL=\n# AI_BASE_URL=\n# AI_API_KEY=\n' "$(openssl rand -hex 16)" > /etc/idealcraft.env
fi
chmod 600 /etc/idealcraft.env && chown root:root /etc/idealcraft.env
cp deploy/idealcraft-bridge.service /etc/systemd/system/
systemctl daemon-reload
echo "installed. start: sudo systemctl start idealcraft-bridge   settings: sudo nano /etc/idealcraft.env"
```

Note: the installer generates a fresh random token. To keep using the current one, put `BRIDGE_TOKEN=<BRIDGE_TOKEN>` in `/etc/idealcraft.env` (the owner chose it; acceptable only because the port is WireGuard-only).

- [ ] **Step 3: Install and verify the sandbox**

Run:
```bash
chmod +x deploy/install.sh
pkill -f 'node src/index.js' || true            # stop the hand-started bridge
sudo NODE_BIN="$(command -v node)" deploy/install.sh
sudo sed -i 's/^BRIDGE_TOKEN=.*/BRIDGE_TOKEN=<BRIDGE_TOKEN>/' /etc/idealcraft.env
sudo systemctl start idealcraft-bridge && sleep 2
systemctl is-active idealcraft-bridge
systemctl is-enabled idealcraft-bridge || true
ss -ltnp | grep -E ':800[01]'
sudo -u idealcraft ls /home 2>&1 | head -1
sudo systemd-run --pty --wait -p User=idealcraft -p ProtectHome=true ls /home/ubuntu 2>&1 | tail -1
```
Expected: `active`; `disabled`; listeners on `10.100.0.1:8000` and `127.0.0.1:8001`; listing `/home/ubuntu` as the sandboxed user fails (`No such file or directory` or `Permission denied`).

- [ ] **Step 4: Document and commit**

Add to `README.md`:

````markdown
## Run on the VM (sandboxed service)

```sh
sudo deploy/install.sh                 # once, and again after updates
sudo systemctl start idealcraft-bridge # on
sudo systemctl stop idealcraft-bridge  # off
journalctl -u idealcraft-bridge -f     # log (player chat appears here)
```

Settings and API keys: `/etc/idealcraft.env` (root only). The service never starts at boot unless you `enable` it.
````

```bash
git add deploy README.md
git commit -m "Deploy: sandboxed systemd service for the bridge"
```

---

### Task 7: Check on the iPhone

**Files:** none (manual)

- [ ] **Step 1:** `npm run pack:addon`, send `dist/IdealCraft.mcpack` to the owner, who imports it, activates it in the world, removes the old **IdealCraft Test** pack, and joins.
- [ ] **Step 2:** Owner sees `IdealCraft add-on ready`, then runs `/connect 10.100.0.1:8000/<BRIDGE_TOKEN>`.
- [ ] **Step 3:** From the VM, call each tool through MCP and confirm a real answer:
```bash
for t in '{"name":"player_info","arguments":{}}' \
         '{"name":"survey_terrain","arguments":{"from":{"x":-30,"z":-10},"to":{"x":-18,"z":2},"site":{"width":5,"depth":5}}}'; do
  curl -s -XPOST 127.0.0.1:8001/mcp -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":$t}"; echo
done
```
(Pick the survey area around the `position` that `player_info` returns.)
Expected: `player_info` includes `looking_at`; `survey_terrain` returns heights and a `site`.
- [ ] **Step 4:** With an AI configured (`AI_MODEL`, `AI_BASE_URL`, `AI_API_KEY` in `/etc/idealcraft.env`, then restart the service), the owner types `!ai build a small cottage` and then `!ai undo`. Expected: the cottage sits on the ground in front of them; undo restores it.
- [ ] **Step 5:** Record the results (what worked, chunk count seen for a 32×32 survey, anything odd) in the spec's "Verified facts" section and commit.

---

## After this plan: the road to beating CRAFT AI

This plan gives the AI eyes. These follow-up designs, in order, close the quality gap; each gets its own spec and plan.

| Phase | What | Why it matters against the jar |
|---|---|---|
| 2. Geometry tools | `shape` (sphere, dome, cylinder, cone, line), `roof` (gable, hip, shed, pyramid with correct Bedrock stair states and overhang), `replace` and palettes (weathered textures), `clone` with mirror/rotate that rotates Bedrock block states, `batch` | The jar's builds look good mostly because of these tools; the AI cannot place correct roofs or textures with `fill` alone |
| 3. Build prompt and review loop | An original, Bedrock-specific build prompt; detail levels (quick / detailed / masterpiece); elevation views (`inspect_area` view north/south/east/west/top) so the AI checks its own work | The jar's 19 KB prompt and self-review are its second big quality lever |
| 4. Build speed and undo | Place blocks from the add-on (no 100-command queue), undo journal per request instead of per fill | Big builds become practical on a phone |
| 5. Benchmark | A fixed set of prompts (cottage, castle, dragon, bridge, pixel art) built with 2–3 models, judged from screenshots, kept as a regression set | "Better than the jar" becomes something measured, not claimed |

Where the project already wins and must keep winning: runs on iPhone Bedrock, works with any AI, needs no install on the phone, is open and light (about 80 MB on the VM).
