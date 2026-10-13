// addon/scripts/main.js
// Script API side: answers /scriptevent cubewright:<op> <id> <json> with tellraw reply lines.
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
  if (!e.id.startsWith('cubewright:')) return;
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
    const op = e.id.slice('cubewright:'.length);
    if (op === 'info') payload = info(player);
    else if (op === 'inspect') payload = inspect(view, args);
    else if (op === 'heights') {
      const { min, max } = dim.heightRange;
      payload = heights(view, { top: feet + 40, bottom: feet - 40, ...args, minY: min, maxY: max - 1 });
    }
    else payload = { error: `unknown op ${op}` };
  } catch (err) {
    payload = { error: String(err?.message ?? err) };
  }

  const target = `@a[name=${JSON.stringify(player.name)}]`;
  for (const line of toLines(id, payload)) {
    player.dimension.runCommand(`tellraw ${target} ${JSON.stringify({ rawtext: [{ text: line }] })}`);
  }
});

system.runTimeout(() => world.sendMessage('§8Cubewright add-on ready'), 100);
