// Built-in agent for `!ai ...` in chat. Speaks the OpenAI-compatible chat API, which OpenAI, Anthropic,
// Gemini, Ollama, OpenRouter, Groq, LM Studio, vLLM... all serve.
import { callTool } from './tools.js';

const MAX_STEPS = 40;

const SYSTEM = `You build inside the player's Minecraft Bedrock world by calling tools.
Call player_info first and build relative to it, unless the player gives coordinates: by default 6 to 15 blocks ahead of them, in the direction they face (north -z, south +z, east +x, west -x).
Before building anything bigger than a hut, call survey_terrain over the area ahead with site set to the footprint, and build on the site it returns. Use inspect_area to see what is already there and to check your work.
If the player says "there", "over there" or "that spot", build at player_info.looking_at (the block they are looking at); if it is null, ask them to look at the spot.
Look efficiently: one survey_terrain over the whole area ahead, then build on its site. Never probe single blocks one at a time; use one inspect_area box with layout=true instead.
If the site is null or uneven, build a foundation from the lowest ground up to the floor level instead of searching again.
Aim to finish within about 25 tool calls: build in big pieces first, then details.
Use Bedrock block ids (e.g. stone_bricks, oak_planks, glass, oak_log) and Bedrock block states in fill.
Plan the whole build first, then fill from big to small: foundation, walls (mode hollow), openings carved with air, roof, details. Doors are 2 high, rooms at least 3.
If a tool fails, read the error and fix the call instead of repeating it. Use undo only when asked or to fix a mistake.
Finish with one short sentence for the player saying what you built.`;

export function makeAgent({ baseUrl, apiKey, model }, tools) {
  let history = [];
  let stopped = false;
  const toolSpecs = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));

  // model may be a list ("a,b"): each step tries them in order, moving on when one is overloaded or rate-limited.
  const models = String(model).split(',').map((m) => m.trim()).filter(Boolean);

  async function complete(messages) {
    let lastError;
    for (const m of models) {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(apiKey && { authorization: `Bearer ${apiKey}` }) },
        body: JSON.stringify({ model: m, messages, tools: toolSpecs }),
      });
      if (res.ok) return (await res.json()).choices[0].message;
      lastError = new Error(`AI API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (res.status !== 429 && res.status !== 503) throw lastError;
    }
    throw lastError;
  }

  return {
    reset() { history = []; },
    // Ends the running request after its current step (the blocks placed so far stay).
    stop() { stopped = true; },
    // Runs one player request to the end and returns the AI's final text.
    async ask(text, onStep = () => {}) {
      stopped = false;
      history.push({ role: 'user', content: text });
      for (let step = 0; step < MAX_STEPS; step++) {
        const msg = await complete([{ role: 'system', content: SYSTEM }, ...history]);
        history.push(msg);
        if (!msg.tool_calls?.length) return msg.content || 'Done.';
        for (const call of msg.tool_calls) {
          let args;
          try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = null; }
          const out = args ? await callTool(tools, call.function.name, args) : { error: true, text: 'arguments were not valid JSON' };
          onStep(call.function.name, out);
          history.push({ role: 'tool', tool_call_id: call.id, content: out.error ? `ERROR: ${out.text}` : out.text });
        }
        if (stopped) return 'Stopped. What is built so far stays; !ai undo removes it piece by piece.';
      }
      return `Stopped after ${MAX_STEPS} steps.`;
    },
  };
}
