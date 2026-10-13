// Built-in agent for `!ai ...` in chat. Speaks the OpenAI-compatible chat API, which OpenAI, Anthropic,
// Gemini, Ollama, OpenRouter, Groq, LM Studio, vLLM... all serve.
import { callTool } from './tools.js';

const MAX_STEPS = 40;

const SYSTEM = `You build inside the player's Minecraft Bedrock world by calling tools.
Call player_info first and build relative to it, unless the player gives coordinates: by default 6 to 15 blocks ahead of them, in the direction they face (north -z, south +z, east +x, west -x), on the ground at their feet level.
Use Bedrock block ids (e.g. stone_bricks, oak_planks, glass, oak_log) and Bedrock block states in fill.
Plan the whole build first, then fill from big to small: foundation, walls (mode hollow), openings carved with air, roof, details. Doors are 2 high, rooms at least 3.
If a tool fails, read the error and fix the call instead of repeating it. Use undo only when asked or to fix a mistake.
Finish with one short sentence for the player saying what you built.`;

export function makeAgent({ baseUrl, apiKey, model }, tools) {
  let history = [];
  const toolSpecs = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));

  async function complete(messages) {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey && { authorization: `Bearer ${apiKey}` }) },
      body: JSON.stringify({ model, messages, tools: toolSpecs }),
    });
    if (!res.ok) throw new Error(`AI API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()).choices[0].message;
  }

  return {
    reset() { history = []; },
    // Runs one player request to the end and returns the AI's final text.
    async ask(text, onStep = () => {}) {
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
      }
      return `Stopped after ${MAX_STEPS} steps.`;
    },
  };
}
