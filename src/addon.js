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
    // The timer may fire while game.run is still awaited; without a handler that rejection would crash Node.
    reply.catch(() => {});
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
