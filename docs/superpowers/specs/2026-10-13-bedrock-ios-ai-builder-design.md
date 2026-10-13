# IdealCraft AI: AI builder for Minecraft Bedrock on iPhone

Date: 2026-10-13
Status: draft, awaiting review

## Goal

A player on Minecraft Bedrock for iPhone, in their own single-player world, types what they want built
in chat and an AI builds it in front of them. Any AI can drive it: any OpenAI-compatible API
(OpenAI, Anthropic, Gemini, Ollama, OpenRouter, Groq...) or any MCP agent (Claude Code, Codex, Gemini CLI...).

Reference: CRAFT AI 0.13.3 (Java-only, Claude-only, All-Rights-Reserved). Its design is used for ideas
(an MCP server of game tools driven by an agent); none of its code or prompt text is copied.

### Success criteria

1. From an iPhone single-player world, `!ai build a small cottage` produces a cottage sitting on the
   terrain in front of the player, with no install on the phone beyond one add-on.
2. The AI can see the world: the blocks in an area, the ground heights, what the player looks at.
3. `!ai undo` restores what the last build changed.
4. The VM hosting the bridge stays protected: no new public port, no access to the owner's files.
5. Swapping AI provider is a change of environment variables, not code.

## Verified facts (tested 2026-10-13 on the owner's iPhone)

- `/connect <host>:<port>/<token>` works on iOS Bedrock; the request path carries the token.
- Commands sent over `/connect` run (`tellraw`, `fill`, `structure`, `querytarget`, `scriptevent`).
- `querytarget @s` returns eye position; feet = y - 1.62. `yRot` 0 = south, 180 = north.
- Player chat arrives as `PlayerMessage` events with `type: "chat"`.
- An add-on script receives `/scriptevent` from the bridge and its replies come back:
  `runCommand("tellraw @a ...")` arrives as `type: "tell"`, sender `"Script Engine"`;
  `say` also arrives; `player.sendMessage` does **not**.
- `@minecraft/server` 1.11.0 runs; 2.0.0 did not load on this device.
- iOS suspends Minecraft when the player switches apps, which drops the `/connect` socket;
  the player must re-run `/connect` after coming back. All interaction should therefore stay in game chat.

## Architecture

```
iPhone single-player world                         Oracle VM, reached over WireGuard (10.100.0.1)
 ├─ IdealCraft add-on (behavior pack)  ◀─ /scriptevent ──┐
 │    reads blocks, terrain, biome                        │   bridge (Node)
 └─ replies via tellraw ── PlayerMessage event ───────────┼── /connect WebSocket ── tools ──┬─ chat agent (!ai), OpenAI-compatible API
                                                          │                                └─ MCP endpoint (127.0.0.1:8001/mcp)
 commands (/fill, /structure, /tellraw) ◀─────────────────┘
```

### Unit 1: bridge (`src/`, exists)

- `bedrock.js`: the WebSocket server. One game at a time, token checked at connect, at most 50 commands in flight,
  10 s timeout per command, PlayerMessage events forwarded with their type.
- `tools.js`: the tool list, shared by both AI paths. Each tool: name, description, JSON schema, `run(args)`.
- `agent.js`: the `!ai` loop over `/chat/completions` with tool calls; conversation kept until `!ai reset`.
- `mcp.js`: MCP Streamable HTTP (JSON responses), localhost only, rejects requests carrying `Origin`.
- `index.js`: wiring, settings from environment, chat commands, one owner for `!ai`.

New in this design: `addon.js`, the request/response channel to the add-on (Unit 2), and the read tools.

### Unit 2: add-on channel

Request: the bridge runs `scriptevent idealcraft:<op> <id> <json-args>`, where `<id>` is 8 random characters.

Reply: the add-on runs `tellraw` with text `§8ic <id> <seq>/<total> <json-chunk>`. Replies are cut into chunks
(chunk size decided by test; start at 1000 characters). The bridge:
- accepts a reply only when the sender is `Script Engine` **and** the id matches a pending request
  (a player cannot inject a reply: they do not know the id, and their sender name is not `Script Engine`
  unless their gamertag is exactly that, which the id check still covers);
- joins chunks by sequence, parses the JSON, resolves the request; 10 s timeout otherwise;
- returns a clear error when the add-on never answers ("the IdealCraft add-on is not active in this world").

Replies are visible: tested 2026-10-13, `tellraw` to a selector matching no player fails
("No targets matched selector") and emits no event. The add-on therefore sends replies only to the
requesting player, as short dark-grey (`§8`) lines, so other players never see them.

### Unit 3: add-on (`addon/`, new)

Behavior pack, script module `@minecraft/server` 1.11.0, no experiments. Ops:

| op | args | returns |
|---|---|---|
| `info` | none | position, facing, dimension, biome, block in crosshair (up to 64 blocks), world height |
| `inspect` | box (≤ 32×32×32) | palette of block ids with counts; optional `layout` (layers as letters) |
| `heights` | box x/z (≤ 64×64) | per column: top solid y and top block id, water flagged |

Read only. All building stays in the bridge (`/fill`, `/structure`), which is already proven.

### Tools exposed to the AI (after this design)

`player_info` (via add-on `info`, falls back to `querytarget` when the add-on is absent),
`inspect_area`, `survey_terrain` (via `heights`, plus a flattest-site search done in the bridge),
`fill`, `undo`, `say`, `run_command`.

### Unit 4: running on the VM

- A systemd service `idealcraft-bridge` under its own user, `ProtectHome=true`, `ProtectSystem=strict`,
  `NoNewPrivileges=true`, `PrivateTmp=true`; code copied to `/srv/idealcraft`.
- Settings and API key in `/etc/idealcraft.env` (root, mode 600), loaded with `EnvironmentFile`.
- Not enabled at boot; the owner runs `systemctl start|stop idealcraft-bridge`.
- Listens on `10.100.0.1:8000` (WireGuard only; ufw allows 8000/tcp on `wg0` only). MCP on `127.0.0.1:8001`.

## Error handling

- Every tool returns text; failures become `ERROR: <reason>` for the AI, never a crash.
- Game disconnects reject all pending commands with "game disconnected"; the agent stops and the player
  sees the reason after reconnecting.
- A failed fill tile reports how many tiles failed; undo still works because the area was saved first.
- AI API errors (status and first 300 characters) are shown to the player in red.

## Testing

- Unit tests (`node --test`): tiling, shells, facing, box validation, chunk join, reply id/sender checks.
- A fake-game script (WebSocket client answering commands and scriptevents) for end-to-end runs without a phone.
- Manual check on the iPhone: `!ai build a small cottage` builds on the terrain, `!ai undo` restores it.

## Out of scope

Geometry tools (roof, arch, stairs, tree, scatter, shape, clone), voice, style templates, multiplayer,
Realms, building through the add-on. Each comes as its own design after this loop works.
