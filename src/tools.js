// The tools an AI builds with. Same list is served over MCP and to the built-in chat agent.

const MAX_BUILD_VOLUME = 1_000_000; // ponytail: flat cap; per-request budget if builds get bigger
const MIN_Y = -64, MAX_Y = 319;

// Normalises two corners into {x1..z2} with x1<=x2 etc.
export function box(from, to) {
  for (const p of [from, to]) {
    for (const k of ['x', 'y', 'z']) if (!Number.isInteger(p?.[k])) throw new Error(`coordinates must be integers (${k})`);
  }
  const b = {
    x1: Math.min(from.x, to.x), y1: Math.min(from.y, to.y), z1: Math.min(from.z, to.z),
    x2: Math.max(from.x, to.x), y2: Math.max(from.y, to.y), z2: Math.max(from.z, to.z),
  };
  if (b.y1 < MIN_Y || b.y2 > MAX_Y) throw new Error(`y must stay between ${MIN_Y} and ${MAX_Y}`);
  return b;
}

export const volume = (b) => (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1) * (b.z2 - b.z1 + 1);

// Splits a box into tiles no wider than maxXZ on x/z and no bigger than maxVolume blocks.
export function tiles(b, maxXZ, maxVolume, maxY = 384) {
  const tx = Math.min(b.x2 - b.x1 + 1, maxXZ), tz = Math.min(b.z2 - b.z1 + 1, maxXZ);
  const ty = Math.max(1, Math.min(b.y2 - b.y1 + 1, maxY, Math.floor(maxVolume / (tx * tz))));
  const out = [];
  for (let x = b.x1; x <= b.x2; x += tx)
    for (let y = b.y1; y <= b.y2; y += ty)
      for (let z = b.z1; z <= b.z2; z += tz)
        out.push({ x1: x, y1: y, z1: z, x2: Math.min(x + tx - 1, b.x2), y2: Math.min(y + ty - 1, b.y2), z2: Math.min(z + tz - 1, b.z2) });
  return out;
}

// hollow/outline as plain solid boxes, so they still work once tiled:
// [box, block] pairs; outline leaves the inside alone, hollow fills it with air.
export function shellParts(b, block, mode) {
  const faces = [
    { ...b, y2: b.y1 }, { ...b, y1: b.y2 },                                   // bottom, top
    { ...b, y1: b.y1 + 1, y2: b.y2 - 1, z2: b.z1 }, { ...b, y1: b.y1 + 1, y2: b.y2 - 1, z1: b.z2 }, // north, south
    { ...b, y1: b.y1 + 1, y2: b.y2 - 1, z1: b.z1 + 1, z2: b.z2 - 1, x2: b.x1 },  // west
    { ...b, y1: b.y1 + 1, y2: b.y2 - 1, z1: b.z1 + 1, z2: b.z2 - 1, x1: b.x2 },  // east
  ];
  const inner = { x1: b.x1 + 1, y1: b.y1 + 1, z1: b.z1 + 1, x2: b.x2 - 1, y2: b.y2 - 1, z2: b.z2 - 1 };
  const valid = (f) => f.x1 <= f.x2 && f.y1 <= f.y2 && f.z1 <= f.z2;
  const seen = new Set();
  const parts = faces.filter(valid).filter((f) => !seen.has(JSON.stringify(f)) && seen.add(JSON.stringify(f))).map((f) => [f, block]);
  if (mode === 'hollow' && valid(inner)) parts.push([inner, 'air']);
  return parts;
}

const coords = (b) => `${b.x1} ${b.y1} ${b.z1} ${b.x2} ${b.y2} ${b.z2}`;

// Bedrock yRot: 0 = south (+z), 90 = west, ±180 = north, -90 = east.
export function facing(yRot) {
  return ['south', 'west', 'north', 'east'][((Math.round(yRot / 90) % 4) + 4) % 4];
}

const point = { type: 'object', properties: { x: { type: 'integer' }, y: { type: 'integer' }, z: { type: 'integer' } }, required: ['x', 'y', 'z'] };

export function makeTools(game) {
  const undoStack = [];
  let saves = 0;

  return [
    {
      name: 'player_info',
      description: 'Where the player is: position (feet), facing direction, dimension. Call it first; build relative to it. +x east, +z south, +y up.',
      inputSchema: { type: 'object', properties: {} },
      async run() {
        const res = await game.run('querytarget @s');
        const [p] = JSON.parse(res.details);
        const pos = { x: Math.floor(p.position.x), y: Math.floor(p.position.y - 1.62), z: Math.floor(p.position.z) };
        return { position: pos, facing: facing(p.yRot), dimension: ['overworld', 'nether', 'the_end'][p.dimension] ?? p.dimension, world_y_range: [MIN_Y, MAX_Y] };
      },
    },
    {
      name: 'fill',
      description:
        'Fills a box between two corners with one block. Bedrock block ids and states, e.g. "stone_bricks", "oak_planks", ' +
        '"oak_stairs [\\"weirdo_direction\\"=2]". mode: solid (default), hollow (walls + air inside), outline (walls only, inside untouched), keep (only replaces air). Undoable.',
      inputSchema: {
        type: 'object',
        properties: { from: point, to: point, block: { type: 'string' }, mode: { type: 'string', enum: ['solid', 'hollow', 'outline', 'keep'] } },
        required: ['from', 'to', 'block'],
      },
      async run({ from, to, block, mode = 'solid' }) {
        const b = box(from, to);
        if (volume(b) > MAX_BUILD_VOLUME) throw new Error(`box is ${volume(b)} blocks; the limit is ${MAX_BUILD_VOLUME}`);
        if (!/^[a-z0-9_:]+(\s*\[.*\])?$/i.test(block.trim())) throw new Error(`not a block id: ${block}`);

        const id = `idealcraft_${process.pid}_${++saves}`;
        const saved = tiles(b, 64, 64 * 384 * 64).map((t, i) => ({ name: `${id}_${i}`, at: t }));
        for (const s of saved) await game.run(`structure save ${s.name} ${coords(s.at)} false memory true`);
        undoStack.push({ saved, box: b });

        const parts = mode === 'hollow' || mode === 'outline' ? shellParts(b, block, mode) : [[b, block]];
        const handling = mode === 'keep' ? ' keep' : '';
        const jobs = parts.flatMap(([part, blk]) => tiles(part, 64, 32768).map((t) => game.run(`fill ${coords(t)} ${blk}${handling}`)));
        const results = await Promise.allSettled(jobs);
        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length) throw new Error(`${failed.length}/${jobs.length} fills failed (undo is still available): ${failed[0].reason.message}`);
        return `filled ${volume(b)} blocks (${jobs.length} commands)`;
      },
    },
    {
      name: 'say',
      description: 'Shows a short message in the player\'s chat: progress updates, questions, what you built.',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      async run({ text }) {
        await game.run(`tellraw @s ${JSON.stringify({ rawtext: [{ text: String(text).slice(0, 500) }] })}`);
        return 'shown';
      },
    },
    {
      name: 'run_command',
      description: 'Runs one Minecraft Bedrock command as the player (time, weather, give, tp, summon, effect...). Changes made this way cannot be undone; build with fill instead.',
      inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
      async run({ command }) {
        if (/[\r\n]/.test(command)) throw new Error('one command per call');
        const res = await game.run(command);
        return res.statusMessage ?? 'ok';
      },
    },
    {
      name: 'undo',
      description: 'Restores the blocks from before the last fill. Call repeatedly to step further back. Use only when the player asks or after a mistake.',
      inputSchema: { type: 'object', properties: {} },
      async run() {
        const last = undoStack.pop();
        if (!last) return 'nothing to undo';
        for (const s of last.saved) {
          await game.run(`structure load ${s.name} ${s.at.x1} ${s.at.y1} ${s.at.z1}`);
          await game.run(`structure delete ${s.name}`).catch(() => {});
        }
        return `restored ${volume(last.box)} blocks; ${undoStack.length} more undo steps`;
      },
    },
  ];
}

// Runs a tool by name and always returns text, so callers never crash on a bad AI call.
export async function callTool(tools, name, args) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { error: true, text: `unknown tool: ${name}` };
  try {
    const out = await tool.run(args ?? {});
    return { error: false, text: typeof out === 'string' ? out : JSON.stringify(out) };
  } catch (e) {
    return { error: true, text: e.message };
  }
}
