// addon/scripts/protocol.js
// Reply lines from the add-on to the bridge. Shared by both sides; no @minecraft imports so Node can test it.
export const CHUNK = 1000;

export function toLines(id, payload, size = CHUNK) {
  const text = JSON.stringify(payload);
  const total = Math.max(1, Math.ceil(text.length / size));
  const lines = [];
  for (let i = 0; i < total; i++) lines.push(`§8cw ${id} ${i + 1}/${total} ${text.slice(i * size, (i + 1) * size)}`);
  return lines;
}

export function parseLine(text) {
  const m = /^§8cw ([0-9a-f]{8}) (\d+)\/(\d+) (.*)$/s.exec(text);
  return m && { id: m[1], seq: Number(m[2]), total: Number(m[3]), chunk: m[4] };
}
