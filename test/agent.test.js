import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAgent } from '../src/agent.js';

// A fake OpenAI-compatible API that always asks for one more player_info call, i.e. never finishes.
function endlessApi() {
  let n = 0;
  return async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: `c${++n}`, type: 'function', function: { name: 'player_info', arguments: '{}' } }] } }] }),
  });
}

test('stop() ends a running request after the current step', async (t) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = endlessApi();
  t.after(() => { globalThis.fetch = realFetch; });
  let steps = 0;
  const tools = [{ name: 'player_info', description: '', inputSchema: { type: 'object' }, run: async () => ({ ok: true }) }];
  const agent = makeAgent({ baseUrl: 'http://fake/v1', apiKey: 'k', model: 'm' }, tools);
  const answer = agent.ask('build', () => { if (++steps === 3) agent.stop(); });
  assert.match(await answer, /stopped/i);
  assert.equal(steps, 3);
});
