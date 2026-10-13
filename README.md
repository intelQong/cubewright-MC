# Cubewright-MC

**Type a sentence in Minecraft chat. An AI builds it in front of you.**

![Platform](https://img.shields.io/badge/Minecraft-Bedrock%20Edition-3c8527) ![iOS](https://img.shields.io/badge/works%20on-iPhone-black) ![Node](https://img.shields.io/badge/node-%E2%89%A520-339933) ![AI](https://img.shields.io/badge/AI-any%20OpenAI--compatible%20%7C%20MCP-6f42c1) ![Tests](https://img.shields.io/badge/tests-30%20passing-brightgreen)

**Highlights**

- Natural-language building in your own Bedrock world, including iPhone and other mobile devices
- Provider-agnostic: OpenRouter, Gemini, OpenAI, Anthropic, Groq, Ollama, or any MCP agent, with automatic model fallback
- World-aware: a lightweight add-on lets the AI read terrain and blocks before it builds
- Safe by design: exact undo, owner-only control, token-protected connection, sandboxed service

**Contents:** [For players](#for-players) · [For developers](#for-developers) · [Settings](#settings) · [Security notes](#security-notes) · [Roadmap](#roadmap)

```
!ai build a small cottage with a garden
```

Cubewright works in **Minecraft: Bedrock Edition**, including on **iPhone**, in your own world.
You can use almost any AI, including free ones.

> Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.

---

# For players

## What you need

1. **Minecraft Bedrock** (iPhone, iPad, Android, Windows or console with a keyboard).
2. **A computer that stays on while you play.** It runs the small Cubewright program (the "bridge").
   A home PC or Mac works, or a cheap cloud server. It needs [Node.js](https://nodejs.org) and [Git](https://git-scm.com) installed.
3. **An AI key.** The easiest free option: create an account on [OpenRouter](https://openrouter.ai),
   then *Keys → Create key*. Copy the key (it starts with `sk-or-`).

Your phone and the computer must be on the **same Wi-Fi**. (Using a cloud server instead? See *Running on a Linux server* in the developer section.)

## Installation (one-time, about 10 minutes)

**On the computer**, open a terminal and paste these lines one by one:

```sh
git clone https://github.com/intelQong/cubewright-MC
cd cubewright-MC
npm install
npm run pack:addon
```

This creates the add-on file `dist/Cubewright.mcpack`.

**On the phone**, install the add-on:

1. Send `Cubewright.mcpack` to your phone (AirDrop, email, cloud drive...) and open it. Choose **Minecraft**.
2. In Minecraft, edit your world: turn **Cheats on**, then go to **Behavior Packs** and activate **Cubewright**.

## Play

**1. Start Cubewright on the computer.** Replace the two parts in capitals, then paste:

```sh
WS_HOST=0.0.0.0 BRIDGE_TOKEN=MYSECRET123 \
AI_BASE_URL=https://openrouter.ai/api/v1 AI_API_KEY=YOUR-OPENROUTER-KEY \
AI_MODEL=nvidia/nemotron-3-super-120b-a12b:free npm start
```

`MYSECRET123` is a password you make up (at least 8 characters). Keep the window open while you play.
On Windows, paste the commands into **Git Bash** (installed with Git), not Command Prompt.

**2. Join your world on the phone.** You will see *Cubewright add-on ready*.

**3. Connect.** Type this in chat, using your computer's address (on a Mac: *System Settings → Wi-Fi → Details*;
on Windows: `ipconfig`) and your password:

```
/connect 192.168.1.20:8000/MYSECRET123
```

You will see *Cubewright connected*.

**4. Start building.**

| Type in chat | What happens |
|---|---|
| `!ai build a stone tower` | The AI builds it in front of you |
| `!ai make it taller` | It remembers what you asked before |
| `!ai stop` | Stops the AI after its current step |
| `!ai undo` | Puts back exactly what was there before the last build step |
| `!ai reset` | Starts a fresh conversation |

## Usage notes

- **Switching apps disconnects the game** (on iPhone). When you come back, type the `/connect` line again.
- **Free AI models can be slow or busy.** If nothing happens, wait a minute and try again.
- **Only you can use `!ai`**, even if friends join your world.
- **Back up worlds you care about.** Builds can be undone, but other commands the AI runs (like changing the time) cannot.
- **Keep your AI key private.** Never post it in chats or screenshots.

## Troubleshooting

| Problem | Fix |
|---|---|
| `/connect` says it could not connect | Check the address and password, that the computer program is running, and that both are on the same Wi-Fi |
| No *Cubewright add-on ready* message | The add-on isn't active: edit the world → Behavior Packs → activate Cubewright |
| `!ai` says *No AI_MODEL set* | Start the bridge with the `AI_MODEL`, `AI_BASE_URL` and `AI_API_KEY` settings (step 1) |
| The AI builds in strange places | Stand on open ground, look where you want the build, and ask again |

---

# For developers

Everything below is the technical reference: architecture, every setting, MCP agents, the sandboxed service,
security and development.

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
| `AI_MODEL` | *(none)* | Model for `!ai`, or a fallback list like `gemini-3.8-flash,gemini-flash-lite-latest` (each step moves to the next model when one is overloaded or rate-limited). Unset = `!ai` off, MCP agents only |
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
