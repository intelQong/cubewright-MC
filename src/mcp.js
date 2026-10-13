// MCP over Streamable HTTP (JSON responses only) so any agent CLI can build:
// Claude Code, Codex, Gemini CLI, Cursor, opencode...
import http from 'node:http';
import { callTool } from './tools.js';

export function serveMcp(tools, port, host) {
  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (req.url !== '/mcp') return reply(404, { error: 'not found' });
    // A browser page must never reach this (DNS rebinding); agent CLIs send no Origin.
    if (req.headers.origin) return reply(403, { error: 'origin not allowed' });
    if (req.method !== 'POST') return reply(405, { error: 'POST only' });

    let msg;
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      msg = JSON.parse(raw);
    } catch {
      return reply(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
    }
    if (msg.id === undefined) return reply(202); // notification
    const ok = (result) => reply(200, { jsonrpc: '2.0', id: msg.id, result });
    const fail = (code, message) => reply(200, { jsonrpc: '2.0', id: msg.id, error: { code, message } });

    switch (msg.method) {
      case 'initialize':
        return ok({
          protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'cubewright', version: '0.1.0' },
        });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case 'tools/call': {
        const out = await callTool(tools, msg.params?.name, msg.params?.arguments);
        return ok({ content: [{ type: 'text', text: out.text }], isError: out.error });
      }
      default:
        return fail(-32601, `method not found: ${msg.method}`);
    }
  });
  return server.listen(port, host);
}
