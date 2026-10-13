# IdealCraft AI

Any AI builds in your Minecraft Bedrock world. A small Node app ("the bridge") talks to the game over
Bedrock's built-in `/connect` WebSocket, so nothing is installed in the game.

## Run

```sh
npm install
AI_MODEL=gpt-5 AI_API_KEY=sk-... npm start      # or leave AI_MODEL unset to use an MCP agent only
```

In Minecraft (cheats on): `/connect localhost:8000`, then type `!ai build a small stone tower` in chat.
`!ai undo` reverts the last fill, `!ai reset` clears the conversation.

## Pick any AI

Chat agent (`!ai`), any OpenAI-compatible API:

| Provider   | AI_BASE_URL                                               |
|------------|-----------------------------------------------------------|
| OpenAI     | (default)                                                 |
| Anthropic  | `https://api.anthropic.com/v1/`                           |
| Gemini     | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| OpenRouter | `https://openrouter.ai/api/v1`                            |
| Ollama     | `http://localhost:11434/v1` (no key)                      |

Agent CLIs over MCP at `http://127.0.0.1:8001/mcp`, e.g.
`claude mcp add --transport http idealcraft http://127.0.0.1:8001/mcp`, then ask it to build.

## Settings

`WS_PORT` (8000), `WS_HOST` (127.0.0.1; use 0.0.0.0 if Minecraft runs on another machine), `MCP_PORT` (8001),
`PLAYER` (who may use `!ai`; default: first player who types it).

## Run on the VM (sandboxed service)

```sh
sudo deploy/install.sh                 # once, and again after updates
sudo systemctl start idealcraft-bridge # on
sudo systemctl stop idealcraft-bridge  # off
journalctl -u idealcraft-bridge -f     # log (player chat appears here)
```

Settings and API keys: `/etc/idealcraft.env` (root only). The service never starts at boot unless you `enable` it.
The add-on: `npm run pack:addon` builds `dist/IdealCraft.mcpack`; import it on the phone and activate it in the world.
