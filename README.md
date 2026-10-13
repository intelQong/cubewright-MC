<div align="center">

# ⛏️ Cubewright-MC

### Say it in chat. Watch it rise.

**An AI builder for Minecraft: Bedrock Edition — on iPhone, Android, Windows and console.**

![Platform](https://img.shields.io/badge/Minecraft-Bedrock%20Edition-3c8527) ![iOS](https://img.shields.io/badge/works%20on-iPhone-black) ![Node](https://img.shields.io/badge/node-%E2%89%A520-339933) ![AI](https://img.shields.io/badge/AI-any%20OpenAI--compatible%20%7C%20MCP-6f42c1) ![Tests](https://img.shields.io/badge/tests-30%20passing-brightgreen)

[**Quick start**](#-quick-start) · [**Commands**](#-in-game-commands) · [**Choose your AI**](#-choose-your-ai) · [**Under the hood**](#-under-the-hood) · [**Roadmap**](#-roadmap)

</div>

---

```
<Steve> !ai build a small cottage with a garden, facing the lake
<Cubewright> Surveying the ground ahead...
<Cubewright> Found a flat spot 9 blocks north. Laying the foundation.
<Cubewright> Walls, door, windows... roof... flower beds.
<Cubewright> Done: a spruce cottage with a fenced garden. !ai undo removes it.
```

You stand in your world, type one sentence, and blocks start appearing in front of you.
The AI looks at the terrain first, picks a flat dry spot, and builds piece by piece while you watch.
Change your mind? `!ai undo` puts back exactly what was there.

> Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.

## ✨ Why Cubewright

| | |
|---|---|
| 📱 **Plays where you play** | Bedrock on iPhone, iPad, Android, Windows and console. No mods, no jailbreak. |
| 🧠 **Any AI you like** | Gemini, OpenRouter, OpenAI, Anthropic, Groq, local Ollama, or agents like Claude Code over MCP. Free options included. |
| 👀 **It sees before it builds** | A small add-on lets the AI read ground heights and blocks, so builds sit on the land instead of floating in it. |
| ↩️ **Every block undoable** | The area is saved before each build step. Undo restores it exactly. |
| 🔒 **Yours only** | Password-protected connection, only you can command it, and the AI gets Minecraft tools only: no files, no shell. |

---

## 🚀 Quick start

About 10 minutes, once. You need:

- **Minecraft Bedrock** on any device
- **A computer that stays on while you play** (PC, Mac or a small cloud server) with [Node.js](https://nodejs.org) and [Git](https://git-scm.com)
- **An AI key.** Free and easy: sign up at [OpenRouter](https://openrouter.ai) → *Keys* → *Create key* (starts with `sk-or-`)

### 1 · Get Cubewright on the computer

```sh
git clone https://github.com/intelQong/cubewright-MC
cd cubewright-MC
npm install
```

### 2 · Add it to your world

1. On your phone, download **Cubewright.mcpack** from the [latest release](https://github.com/intelQong/cubewright-MC/releases/latest) and open it with **Minecraft**.
2. Edit your world: turn **Cheats on**, open **Behavior Packs** and activate **Cubewright**.

### 3 · Start the bridge

Pick a password and paste your key, then run:

```sh
WS_HOST=0.0.0.0 BRIDGE_TOKEN=MYSECRET123 \
AI_BASE_URL=https://openrouter.ai/api/v1 AI_API_KEY=YOUR-OPENROUTER-KEY \
AI_MODEL=nvidia/nemotron-3-super-120b-a12b:free npm start
```

Keep the window open while you play. On Windows, use **Git Bash** (comes with Git).

### 4 · Connect from the game

Join your world (you'll see *Cubewright add-on ready*), then type, with your computer's address and your password:

```
/connect 192.168.1.20:8000/MYSECRET123
```

Find the address on a Mac in *System Settings → Wi-Fi → Details*, on Windows with `ipconfig`.
Phone and computer must be on the same Wi-Fi (for a cloud server, see [Running on a server](#running-on-a-server)).

**🟢 *Cubewright connected* — you're ready to build.**

---

## 🎮 In-game commands

| Type in chat | What happens |
|---|---|
| `!ai build a stone tower` | Builds it in front of you |
| `!ai build it over there` | Builds where you're looking |
| `!ai make it taller` | Remembers the conversation |
| `!ai stop` | Stops after the current step |
| `!ai undo` | Restores the last build step; repeat to go further back |
| `!ai reset` | Starts a fresh conversation |

**Tips for great builds**

- Stand on open ground and face where you want it.
- Be specific: *"a two-floor oak house with a balcony and a dark roof"* beats *"a house"*.
- Build big things in steps: the castle first, then *"add towers at each corner"*.

**Good to know**

- On iPhone, leaving the app drops the connection. Back in the game, type the `/connect` line again.
- Free AI models are sometimes busy. Wait a minute and try again.
- Only the player who connected can use `!ai`, even with friends in the world.
- Back up worlds you care about: builds undo, but commands like changing the weather don't.
- Keep your AI key private. Never post it in chat or screenshots.

<details>
<summary><b>🛠️ Something not working?</b></summary>

| Problem | Fix |
|---|---|
| `/connect` could not connect | Check the address and password, that the bridge is running, and that both are on the same Wi-Fi |
| No *Cubewright add-on ready* | Edit the world → Behavior Packs → activate Cubewright (Cheats on) |
| `!ai` says *No AI_MODEL set* | Start the bridge with `AI_MODEL`, `AI_BASE_URL` and `AI_API_KEY` (step 3) |
| Builds land in strange places | Stand on open ground, look at the spot, and ask again |

</details>

---

## 🧠 Choose your AI

Cubewright talks to any OpenAI-compatible API, so switching provider is a settings change. The model must support tool calling.

| Provider | `AI_BASE_URL` | Notes |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | Free models: pick one ending in `:free` that lists `tools` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | Free tier |
| OpenAI | *(default)* | |
| Anthropic | `https://api.anthropic.com/v1/` | |
| Groq | `https://api.groq.com/openai/v1` | |
| Ollama (local) | `http://localhost:11434/v1` | No key needed |

Busy free models? Give a fallback list: `AI_MODEL=gemini-3.8-flash,gemini-flash-lite-latest` moves to the next model whenever one is overloaded or rate-limited.

**Prefer an agent?** The bridge also serves its tools over MCP at `http://127.0.0.1:8001/mcp`. For example with Claude Code:

```sh
claude mcp add --transport http cubewright http://127.0.0.1:8001/mcp
```

---

## 🔧 Under the hood

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

- **The bridge** accepts the game's `/connect` WebSocket, turns AI tool calls into Minecraft commands and reads your chat.
- **The add-on** gives the AI eyes: blocks in an area, ground heights, the block in your crosshair. It only reads; building uses normal commands.
- **Undo** saves each area with `/structure` before building over it.

<details>
<summary><b>Tools the AI gets</b></summary>

| Tool | Purpose |
|---|---|
| `player_info` | Your position, facing, dimension, the block in your crosshair, world height |
| `survey_terrain` | Ground heights and surface blocks over up to 64×64; finds the flattest dry spot for a footprint |
| `inspect_area` | Exact blocks in a box (up to 32×32×32), as counts or layer drawings |
| `fill` | Solid, hollow, outline or keep-mode boxes; large boxes split automatically |
| `undo` | Restores the area of the last build step |
| `say` | Shows a message in your chat |
| `run_command` | Any other command (time, weather, give, tp...) |

Without the add-on the bridge still builds, but nearly blind: `player_info` falls back to `/querytarget` and the read tools say the add-on is missing.

</details>

<details>
<summary><b>All settings</b></summary>

| Variable | Default | Meaning |
|---|---|---|
| `WS_HOST` | `127.0.0.1` | Address the game connects to. Your LAN or VPN address (or `0.0.0.0`) for a phone |
| `WS_PORT` | `8000` | Port for `/connect` |
| `BRIDGE_TOKEN` | *(none)* | Password at the end of the `/connect` address. Required unless `WS_HOST` is localhost |
| `MCP_PORT` | `8001` | MCP endpoint port (always localhost) |
| `AI_MODEL` | *(none)* | Model for `!ai`, or a comma-separated fallback list. Unset = `!ai` off, MCP only |
| `AI_BASE_URL` | OpenAI | OpenAI-compatible API base URL |
| `AI_API_KEY` | *(none)* | API key for that provider |
| `PLAYER` | who ran `/connect` | Gamertag allowed to use `!ai` |
| `DEBUG` | *(off)* | `1` logs every raw message to and from the game |

</details>

<details id="running-on-a-server">
<summary><b>Running on a server (sandboxed service)</b></summary>

`deploy/install.sh` installs the bridge as a systemd service under its own user, with home directories hidden (`ProtectHome`) and the rest of the system read only.

```sh
sudo deploy/install.sh                  # once, and after every update
sudo nano /etc/cubewright.env           # settings and API key (root only)
sudo systemctl start cubewright-bridge  # on
sudo systemctl stop cubewright-bridge   # off
journalctl -u cubewright-bridge -f      # connections, chat, every AI tool call
```

It never starts at boot unless you run `systemctl enable cubewright-bridge`.

**From an iPhone to a cloud VM:** join both to a WireGuard VPN and set `WS_HOST` to the VM's VPN address. Only your own devices can reach it; no public port is opened.

</details>

<details>
<summary><b>Security</b></summary>

- The `/connect` password is checked before a game can attach; without one, the bridge refuses public addresses.
- The MCP endpoint listens on localhost only and rejects browser requests (`Origin` header).
- The AI has Minecraft tools only: no shell, no files. The worst it can do is build badly, and builds undo.
- `run_command` runs with your in-game permissions; its changes cannot be undone.
- Only the owner's chat starts the AI; everything else in the log is treated as untrusted.
- API keys belong in the env file, never in the repository or in chat.

</details>

<details>
<summary><b>Development</b></summary>

```sh
npm test               # unit tests + an end-to-end test over a real WebSocket with a fake game
npm run pack:addon     # build dist/Cubewright.mcpack; publish with gh release create
DEBUG=1 npm start      # log raw game traffic
```

```
src/      bridge: bedrock.js (game socket), addon.js (add-on channel), tools.js, terrain.js,
          agent.js (!ai loop), mcp.js (MCP endpoint), index.js (wiring)
addon/    behavior pack: scripts/main.js (Script API), ops.js (reads), protocol.js (reply format)
deploy/   systemd unit and installer
docs/     design specs and implementation plans
```

</details>

---

## 🗺️ Roadmap

- [x] Build from chat on Bedrock, iPhone included
- [x] Any OpenAI-compatible AI, MCP agents, automatic model fallback
- [x] Terrain-aware site picking, exact undo, sandboxed server
- [ ] **Geometry tools** *(in progress)*: pitched roofs, round towers, domes, weathered walls, mirrored wings
- [ ] A smarter build prompt and a self-review that checks the build from every side
- [ ] Faster building through the add-on, undo per request
- [ ] A benchmark of fixed prompts across models, to measure build quality

## 🙏 Credits

Inspired by [CRAFT AI](https://www.craftai.world), a Java Edition mod that builds with Claude Code.
Cubewright is an independent implementation for Bedrock; no CRAFT AI code or prompts are used.
