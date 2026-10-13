// The game side: Bedrock connects to us with `/connect host:port` and we send it commands.
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const MAX_IN_FLIGHT = 50; // Bedrock drops commands past ~100 pending
const TIMEOUT_MS = 10_000;

export class Bedrock {
  socket = null;
  pending = new Map();
  waiters = [];
  onChat = () => {};
  onDisconnect = () => {};

  // token: the game must connect to host:port/<token>; anyone else is refused before they can take the slot.
  listen(port, host, token) {
    const wss = new WebSocketServer({
      port, host,
      verifyClient: ({ req }) => !token || req.url.replace(/^\//, '') === token,
    });
    wss.on('connection', (socket) => {
      this.socket?.close(); // one game at a time
      this.socket = socket;
      console.log('[game] connected');
      socket.on('message', (raw) => this.#receive(raw));
      socket.on('close', () => {
        if (this.socket !== socket) return;
        this.socket = null;
        for (const p of this.pending.values()) p.reject(new Error('game disconnected'));
        this.pending.clear();
        this.onDisconnect();
        console.log('[game] disconnected');
      });
      this.#send('subscribe', { eventName: 'PlayerMessage' });
      this.say('§aCubewright connected. Type §e!ai <what to build>§a, §e!ai stop§a, §e!ai undo§a or §e!ai reset§a.');
    });
    return wss;
  }

  // Runs one command and resolves with Bedrock's response body; rejects when the command fails.
  async run(commandLine) {
    if (!this.socket) throw new Error('Minecraft is not connected: run /connect in the game first');
    while (this.pending.size >= MAX_IN_FLIGHT) await new Promise((r) => this.waiters.push(r));
    return new Promise((resolve, reject) => {
      const id = this.#send('commandRequest', {
        version: 1,
        commandLine: commandLine.replace(/^\//, ''),
        origin: { type: 'player' },
      });
      const timer = setTimeout(() => this.#settle(id, null, new Error(`timed out: ${commandLine}`)), TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (body) => (clearTimeout(timer), resolve(body)),
        reject: (err) => (clearTimeout(timer), reject(err)),
      });
    });
  }

  say(text) {
    return this.run(`tellraw @s ${JSON.stringify({ rawtext: [{ text }] })}`).catch(() => {});
  }

  #send(purpose, body) {
    const requestId = randomUUID();
    const messageType = 'commandRequest';
    if (process.env.DEBUG) console.log('[game] ->', purpose, JSON.stringify(body).slice(0, 200));
    this.socket.send(JSON.stringify({ header: { version: 1, requestId, messageType, messagePurpose: purpose }, body }));
    return requestId;
  }

  #settle(id, body, err) {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    this.waiters.shift()?.();
    if (err) p.reject(err);
    else if (body.statusCode < 0) p.reject(new Error(body.statusMessage || `command failed (${body.statusCode})`));
    else p.resolve(body);
  }

  #receive(raw) {
    if (process.env.DEBUG) console.log('[game] <-', String(raw).slice(0, 500));
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { header = {}, body = {} } = msg;
    if (header.messagePurpose === 'commandResponse') this.#settle(header.requestId, body);
    else if (header.messagePurpose === 'error') this.#settle(header.requestId, null, new Error(body.statusMessage || 'error'));
    else if (header.eventName === 'PlayerMessage') this.onChat(body.sender, body.message, body.type, body.receiver);
  }
}
