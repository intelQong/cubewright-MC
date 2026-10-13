# Cubewright-MC

**Type a sentence in Minecraft chat. An AI builds it in front of you.**

Cubewright is an AI builder for **Minecraft: Bedrock Edition**, including **iPhone**, in your own single-player world.
It works with **any AI**: any OpenAI-compatible API (OpenRouter, OpenAI, Anthropic, Gemini, Groq, Ollama...)
or any agent that speaks MCP (Claude Code, Codex, OpenCode, Gemini CLI...).

```
!ai build a small cottage with a garden
!ai undo
```

Nothing to install on the phone except one small add-on. The AI runs on a computer you control
(a home PC or a small cloud VM), and the game connects to it with Bedrock's built-in `/connect` command.

> Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.

## How it works

```
 Your Bedrock world (iPhone, PC...)                     Your computer / VM
┌──────────────────────────────────┐                  ┌──────────────────────────────────────────┐
│ Cubewright add-on                │ ◀─ /scriptevent ─┤ bridge (Node)                            │
│   reads blocks, terrain,         │                  │   tools: player_info, survey_terrain,    │
│   what you look at               │ ── tellraw ────▶ │   inspect_area, fill, undo, say, ...     │
│                                  │                  │        │                     │           │
│ commands: /fill /structure ...   │ ◀── /connect ──▶ │   !ai chat agent       MCP endpoint      │
└──────────────────────────────────┘    WebSocket     │   (any OpenAI-         (Claude Code,     │
                                                      │    compatible API)      Codex, ...)      │
                                                      └──────────────────────────────────────────┘
```

- **The bridge** receives the game's `/connect` WebSocket, turns the AI's tool calls into Minecraft commands
  and reads your chat.
- **The add-on** lets the AI *see*: block contents of an area, ground heights, the block in your crosshair.
  It is read only; all building goes through normal commands.
- **Undo** saves each area with `/structure` before building over it, so `!ai undo` puts back exactly what was there.

## Requirements

- Minecraft: Bedrock Edition with **cheats enabled** in the world (needed for `/connect` and the build commands).
- A machine for the bridge with **Node.js 20+**. Linux, macOS or Windows; it uses about 80 MB of RAM.
- An AI: an API key for an OpenAI-compatible provider (free options exist, see below), or an MCP agent.
- The phone must be able to reach the bridge: same Wi-Fi, or a VPN such as WireGuard for a cloud VM.

## Quick start

```sh
git clone https://github.com/intelQong/cubewright-MC && cd cubewright-MC
npm install
npm run pack:addon            # builds dist/Cubewright.mcpack
```

1. **Install the add-on.** Send `dist/Cubewright.mcpack` to your phone, open it, and share it to Minecraft.
   Then edit your world → *Behavior Packs* → activate **Cubewright**. When you join you will see
   `Cubewright add-on ready`.
2. **Start the bridge** with an AI and a token (any secret string, 8 characters or more):

   ```sh
   WS_HOST=0.0.0.0 BRIDGE_TOKEN=pick-a-secret \
   AI_BASE_URL=https://openrouter.ai/api/v1 AI_API_KEY=sk-or-... \
   AI_MODEL=nvidia/nemotron-3-super-120b-a12b:free \
   npm start
   ```

3. **Connect from the game** (replace the address with your bridge machine's):

   ```
   /connect 192.168.1.20:8000/pick-a-secret
   ```

   You will see `Cubewright connected`.
4. **Build:** `!ai build a small stone tower`.

## Chat commands

| Command | What it does |
|---|---|
| `!ai <request>` | The AI builds or answers. It remembers the conversation, so `!ai make it taller` works. |
| `!ai undo` | Restores the blocks from before the last fill. Repeat to go further back. |
| `!ai reset` | Forgets the conversation. |

Only the player who ran `/connect` can use `!ai` (or the player named in `PLAYER`), so other players on
the same world cannot spend your AI credits.

## Choosing an AI

The built-in `!ai` agent speaks the OpenAI-compatible chat API, so switching provider is a settings change.
The model must support tool calling.

| Provider | `AI_BASE_URL` | Notes |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | Has free models: pick one ending in `:free` that lists `tools` |
| OpenAI | *(default)* | |
| Anthropic | `https://api.anthropic.com/v1/` | |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | Free tier available |
| Groq | `https://api.groq.com/openai/v1` | |
| Ollama (local) | `http://localhost:11434/v1` | No key needed |

**MCP agents.** The bridge also serves its tools over MCP at `http://127.0.0.1:8001/mcp` (localhost only).
Point any agent at it and ask it to build, for example with Claude Code:

```sh
claude mcp add --transport http cubewright http://127.0.0.1:8001/mcp
```

## Tools the AI gets

| Tool | Purpose |
|---|---|
| `player_info` | Your position, facing, dimension, the block in your crosshair, world height |
| `survey_terrain` | Ground heights and surface blocks over up to 64×64; finds the flattest dry spot for a footprint |
| `inspect_area` | Exact blocks in a box (up to 32×32×32), as counts or as layer drawings |
| `fill` | Solid, hollow, outline or keep-mode boxes of any block; large boxes are split automatically |
| `undo` | Restores the area of the last fill |
| `say` | Shows a message in your chat |
| `run_command` | Any other command (time, weather, give, tp...) |

Without the add-on the bridge still builds, but the AI is nearly blind: `player_info` falls back to
`/querytarget` and the read tools report that the add-on is not active.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `WS_HOST` | `127.0.0.1` | Address the game connects to. Use your LAN or VPN address (or `0.0.0.0`) for a phone |
| `WS_PORT` | `8000` | Port for `/connect` |
| `BRIDGE_TOKEN` | *(none)* | Secret at the end of the `/connect` address. Required unless `WS_HOST` is localhost |
| `MCP_PORT` | `8001` | MCP endpoint port (always localhost) |
| `AI_MODEL` | *(none)* | Model for `!ai`. Unset = `!ai` off, MCP agents only |
| `AI_BASE_URL` | OpenAI | OpenAI-compatible API base URL |
| `AI_API_KEY` | *(none)* | API key for that provider |
| `PLAYER` | player who ran `/connect` | Gamertag allowed to use `!ai` |
| `DEBUG` | *(off)* | Set to `1` to log every raw message to and from the game |

## Running on a Linux server (sandboxed service)

For a VM that stays up, `deploy/install.sh` installs the bridge as a systemd service under its own user,
with your home directories hidden from it (`ProtectHome`) and the rest of the system read only.

```sh
sudo deploy/install.sh                  # once, and again after every update
sudo nano /etc/cubewright.env           # settings and API key (root only)
sudo systemctl start cubewright-bridge  # on
sudo systemctl stop cubewright-bridge   # off
journalctl -u cubewright-bridge -f      # log: connections, chat, every AI tool call
```

It never starts at boot unless you run `systemctl enable cubewright-bridge`.

**Reaching a cloud VM from an iPhone:** put the phone on a WireGuard VPN with the VM and set `WS_HOST` to the
VM's VPN address. The bridge is then reachable only from your own devices, with no public port opened.

## Security notes

- The `/connect` token is checked before a game can attach; without it, the bridge refuses public addresses.
- The MCP endpoint listens on localhost only and rejects browser requests (`Origin` header).
- The AI only has Minecraft tools: no shell and no file access. The worst it can do is build badly, and builds can be undone.
- `run_command` runs as you, with your in-game permissions. Its changes cannot be undone.
- Only the owner's chat starts the AI; everything else in the log is treated as untrusted data.
- Keep API keys in the env file, never in the repository or in chat.

## Development

```sh
npm test               # unit tests and an end-to-end test over a real WebSocket with a fake game
npm run pack:addon     # build the add-on
DEBUG=1 npm start      # log raw game traffic
```

```
src/        bridge: bedrock.js (game socket), addon.js (add-on channel), tools.js, terrain.js,
            agent.js (!ai loop), mcp.js (MCP endpoint), index.js (wiring)
addon/      behavior pack: scripts/main.js (Script API), ops.js (read operations), protocol.js (reply format)
deploy/     systemd unit and installer
docs/       design spec and implementation plans
```

## Roadmap

- **Geometry tools:** roofs, shapes, arches, stairs, palettes and weathering, mirrored copies.
- **A better build prompt** and a self-review loop that looks at the build from every side.
- **Faster building** through the add-on, and undo per request instead of per fill.
- **A benchmark** of fixed prompts across models, to measure build quality instead of guessing.

## Credits

Inspired by [CRAFT AI](https://www.craftai.world), a Java Edition mod that builds with Claude Code.
Cubewright is an independent implementation for Bedrock; no CRAFT AI code or prompts are used.
