import { Bedrock } from './bedrock.js';
import { makeTools, callTool } from './tools.js';
import { makeAgent } from './agent.js';
import { serveMcp } from './mcp.js';
import { AddonChannel } from './addon.js';

const env = process.env;
const WS_PORT = Number(env.WS_PORT ?? 8000);
const WS_HOST = env.WS_HOST ?? '127.0.0.1'; // set 0.0.0.0 when Minecraft runs on another machine
const MCP_PORT = Number(env.MCP_PORT ?? 8001);

const game = new Bedrock();
const addon = new AddonChannel(game);
game.onDisconnect = () => addon.rejectAll(new Error('game disconnected'));
const tools = makeTools(game, addon);

const TOKEN = env.BRIDGE_TOKEN ?? '';
const local = WS_HOST === '127.0.0.1' || WS_HOST === 'localhost';
if (!local && TOKEN.length < 8) {
  console.error('Refusing to listen publicly without BRIDGE_TOKEN (8+ chars). Generate one: openssl rand -hex 16');
  process.exit(1);
}

game.listen(WS_PORT, WS_HOST, TOKEN);
serveMcp(tools, MCP_PORT, '127.0.0.1');
console.log(`[game] in Minecraft run: /connect ${local ? 'localhost' : '<this-ip>'}:${WS_PORT}${TOKEN && '/<BRIDGE_TOKEN>'}`);
console.log(`[mcp]  http://127.0.0.1:${MCP_PORT}/mcp`);

// Chat agent is optional: without AI_MODEL only MCP agents can build.
const agent = env.AI_MODEL && makeAgent({ baseUrl: env.AI_BASE_URL ?? 'https://api.openai.com/v1', apiKey: env.AI_API_KEY, model: env.AI_MODEL }, tools);
console.log(agent ? `[chat] !ai uses ${env.AI_MODEL} at ${env.AI_BASE_URL ?? 'OpenAI'}` : '[chat] off (set AI_MODEL to enable !ai)');

// Only one player drives the AI: PLAYER, else the player who ran /connect. The bridge's welcome
// `tellraw @s` echoes back as a tell from "External" whose receiver is that player.
let owner = env.PLAYER;
let busy = false;
game.onChat = async (sender, message, type, receiver) => {
  if (addon.handle(sender, message)) return;
  if (!owner && type === 'tell' && sender === 'External' && receiver) owner = receiver, console.log(`[chat] owner: ${owner}`);
  // MCP agents read the player through this log. JSON-escaped so a message can't forge extra lines;
  // only lines marked (owner) are the player's own words, everything else is untrusted data.
  console.log(`[${type}] <${JSON.stringify(String(sender))}${sender === owner ? ' (owner)' : ''}> ${JSON.stringify(String(message))}`);
  if (type !== 'chat') return;
  const m = /^!ai\b\s*(.*)$/is.exec(message.trim());
  if (!m) return;
  if (sender !== owner) return;
  const text = m[1].trim();
  if (text === 'undo') return game.say((await callTool(tools, 'undo')).text);
  if (!agent) return game.say('§cNo AI_MODEL set on the bridge. Use an MCP agent, or restart the bridge with AI_MODEL.');
  if (text === 'reset') return agent.reset(), game.say('Conversation cleared.');
  if (!text) return game.say('Usage: !ai <what to build> | !ai undo | !ai reset');
  if (busy) return game.say('§eStill working on the last request.');

  busy = true;
  game.say(`§7Thinking: ${text}`);
  try {
    const answer = await agent.ask(text, (tool, out) => console.log(`[chat] ${tool} -> ${out.error ? 'ERROR ' : ''}${out.text.slice(0, 120)}`));
    await game.say(answer);
  } catch (e) {
    console.error(e);
    await game.say(`§c${e.message.slice(0, 200)}`);
  } finally {
    busy = false;
  }
};
