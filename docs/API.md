# API — 三公遊戲 API 設計文件

## Document Control

| 欄位 | 內容 |
|------|------|
| **DOC-ID** | API-SAM-GONG-20260421 |
| **版本** | v1.0-draft |
| **狀態** | DRAFT |
| **來源** | EDD-SAM-GONG-20260421 v1.0-draft |
| **作者** | devsop-autodev |
| **日期** | 2026-04-21 |

---

## 1. Overview

### 1.1 Protocol

- **Communication**: WebSocket via Colyseus Protocol (Colyseus 0.15)
- **State Sync**: `@colyseus/schema` Differential State Sync — automatic, not request-response; clients receive only the diff (patch) of changed fields
- **Client → Server**: `room.send(type, payload)` — typed message dispatch
- **Server → Client (broadcast)**: `room.broadcast(type, payload)` — all clients in room
- **Server → Client (direct)**: `client.send(type, payload)` — single target (e.g., error responses)
- **Anti-Cheat**: Card schema filtering via `@filter` decorator; opposing players' `suit`/`rank` are never included in state patches until the reveal phase

### 1.2 Connection

```
WebSocket URL:  ws://{server}/colyseus/
Room Name:      sam_gong
Colyseus Client: new Colyseus.Client("ws://server/colyseus/")
```

> **Note**: Nginx proxies `/colyseus/` to `localhost:2567`. In local development, connect directly to `ws://localhost:2567`.

### 1.3 Room Code

The `roomId` in Colyseus is overridden at `onCreate` with a human-readable 6-character code (e.g., `A3KZ7M`). Characters are drawn from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (ambiguous chars `O`, `0`, `I`, `1` excluded).

---

## 2. Room Lifecycle API

### 2.1 Create Room

```typescript
// Client
const client = new Colyseus.Client("ws://localhost:2567");
const room = await client.create<SamGongState>("sam_gong", {
  nickname?: string   // optional display name; defaults to "P1", "P2", ...
});
// room.id === roomCode (6-char, share with friends)
```

The creator automatically becomes **host** (`isHost = true`) and occupies seat 0.

### 2.2 Join Room

```typescript
const room = await client.joinById<SamGongState>(roomCode, {
  nickname?: string
});
```

Throws if room is not found (4001) or already full at 6 players (4002).

### 2.3 Leave Room

```typescript
await room.leave();  // consented leave; no reconnect window
```

### 2.4 Reconnect After Disconnect

```typescript
// Store reconnection token before disconnection can occur
const token = room.reconnectionToken;

// On reconnect (within 60s window)
const room = await client.reconnect<SamGongState>(token);
```

The server holds a 60-second reconnection window via `allowReconnection(client, 60)`. After 60 s, the player is auto-folded (if in betting phase and not yet acted) or treated as called (if already committed chips).

---

## 3. Client → Server Messages

All messages are sent via `room.send(type, payload)`.

The server validates every message with a three-step guard:

1. **Player existence** — sender must be in `state.players`
2. **Phase check** — `state.roomPhase` must match the required phase
3. **Role check** — host-only or banker-only messages are rejected if the sender does not hold that role

On any violation the server responds with a direct `error` message to the sender (see Section 4.3) and returns without processing further.

---

### 3.1 `start_game`

```typescript
// Payload — empty object
interface StartGamePayload {} // {}

room.send("start_game", {});
```

| Field | Value |
|-------|-------|
| Valid phase | `lobby` |
| Required role | host (`isHost === true`) |
| Min players | 2 |

**Server validation rules**:
- Sender must be host → else `4003`
- `roomPhase` must be `"lobby"` → else `4004`
- `players.size >= 2` → else `4006` (invalid request: insufficient players to start)

**Success path**: Server transitions `lobby → banker_selection`, randomly selects initial banker, then immediately transitions `banker_selection → betting` and starts the 30 s betting countdown.

**Error responses**:

| Condition | Code |
|-----------|------|
| Sender is not host | 4003 |
| Wrong phase | 4004 |
| Fewer than 2 players | 4006 |

---

### 3.2 `set_bet_amount`

```typescript
interface SetBetAmountPayload {
  amount: 10 | 20 | 50 | 100;   // chips; must be in whitelist
}

room.send("set_bet_amount", { amount: 50 });
```

| Field | Value |
|-------|-------|
| Valid phase | `betting` |
| Required role | banker (`isBanker === true`) |

**Server validation rules**:
- Sender must be banker → else `4003`
- `amount` must be in `{10, 20, 50, 100}` → else `4006`
- Can only be set once per round; subsequent calls in same round are ignored

**Success path**: `state.betAmount` is updated and broadcast via state diff. Clients display the confirmed bet amount.

**Error responses**:

| Condition | Code |
|-----------|------|
| Sender is not banker | 4003 |
| Wrong phase | 4004 |
| `amount` not in whitelist | 4006 |

---

### 3.3 `player_action`

```typescript
interface PlayerActionPayload {
  action: "call" | "fold";
}

room.send("player_action", { action: "call" });
```

| Field | Value |
|-------|-------|
| Valid phase | `betting` |
| Required role | non-banker player |
| Prerequisite | `player.status === "deciding"` |

**Server validation rules**:
- Sender must not be banker → else `4003`
- `player.status` must be `"deciding"` (prevents double-submit)
- For `"call"`: `player.chips >= state.betAmount` → else `4005`
- `action` must be `"call"` or `"fold"` → else `4007`

**Success path**:
- `"call"`: `player.chips -= betAmount`, `player.hasBet = true`, `player.status = "called"`
- `"fold"`: `player.hasBet = false`, `player.status = "folded"`
- After each action the server checks if all non-banker players have acted; if so it advances phase to `dealing`.
- If all players fold → flows to `round_end` (forfeit path) without dealing.

**Error responses**:

| Condition | Code |
|-----------|------|
| Sender is banker | 4003 |
| Wrong phase | 4004 |
| Insufficient chips to call | 4005 |
| Invalid action string | 4007 |

---

### 3.4 `ready_for_reveal`

```typescript
// Payload — empty object
interface ReadyForRevealPayload {} // {}

room.send("ready_for_reveal", {});
```

| Field | Value |
|-------|-------|
| Valid phase | `dealing` |
| Required role | any player who has called (`hasBet === true`) |

**Server validation rules**:
- `roomPhase` must be `"dealing"` → else `4004`
- Sender must have `hasBet === true`

**Success path**: This is an optional optimization. Once all called players have sent `ready_for_reveal`, the server can advance to `reveal` immediately rather than waiting for the 10 s timeout. If not all players send it, the server auto-advances after the reveal countdown expires.

---

### 3.5 `request_new_round`

```typescript
// Payload — empty object
interface RequestNewRoundPayload {} // {}

room.send("request_new_round", {});
```

| Field | Value |
|-------|-------|
| Valid phase | `round_end` |
| Required role | any player in room |

**Success path**: The first player to send this triggers the next round. Server rotates banker (clockwise by seat order) and transitions `round_end → betting`, resets all player statuses to `"deciding"`, and starts a fresh 30 s countdown.

---

## 4. Server → Client Events

### 4.1 State Sync (Automatic Differential Patch)

Colyseus automatically sends state patches to all clients whenever `SamGongState` changes. Clients subscribe with:

```typescript
room.onStateChange((state: SamGongState) => {
  // Fired on every server-side state mutation
  // state is the full deserialized state (not just the diff)
});
```

Key fields to watch:

| Field | Type | When it changes |
|-------|------|----------------|
| `roomPhase` | `string` | Phase transitions |
| `countdownSeconds` | `number` | Every second during active countdowns |
| `betAmount` | `number` | After banker sets bet |
| `currentBankerId` | `string` | At round start / rotation |
| `players` (MapSchema) | `PlayerState` | Any player attribute update |

**Anti-cheat**: The `cards` field on `PlayerState` is decorated with `@filter`. Each client receives only its own cards' `suit`/`rank`. Other players' cards appear as absent from the patch until `revealed = true` is set server-side during the reveal phase.

---

### 4.2 `game_result` Event

Broadcast by server at the end of `settling` phase, before transitioning to `round_end`.

```typescript
interface CardResult {
  suit: "spades" | "hearts" | "diamonds" | "clubs";
  rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
}

interface PlayerResult {
  sessionId: string;
  outcome: "win" | "lose" | "no_game";  // no_game = folded
  chipsChange: number;                   // positive = gain, negative = loss, 0 = folded
  finalChips: number;                    // chips after settlement
  cards: CardResult[];                   // 3-card hand (empty if folded)
  points: number;                        // 1-9 = normal, 10 = 公牌 (Sam Gong)
}

interface GameResultPayload {
  results: PlayerResult[];
  isForfeit: boolean;   // true = all players folded (流局)
  bankerId: string;
  betAmount: number;
}

// Client listens:
room.onMessage("game_result", (data: GameResultPayload) => {
  // Render settlement overlay
});
```

---

### 4.3 `error` Event

Sent directly to the offending client only (not broadcast).

```typescript
interface ErrorPayload {
  code: number;
  message: string;   // Human-readable, English (UI should map to localized string)
}

room.onMessage("error", (data: ErrorPayload) => {
  console.error(`[Server Error] ${data.code}: ${data.message}`);
  // Map code to user-facing toast/alert (see Section 5)
});
```

---

## 5. Error Codes Reference

| Code | Name | Description | Client Action |
|------|------|-------------|---------------|
| 4001 | ROOM_NOT_FOUND | Room code does not exist | Show "找不到房間" toast; return to main menu |
| 4002 | ROOM_FULL | 6-player cap reached | Show "房間已滿（最多6人）" toast |
| 4003 | UNAUTHORIZED | Sender lacks required role (not host / not banker) | Silent ignore; log to console |
| 4004 | WRONG_PHASE | Action not permitted in current phase | Silent ignore; log to console |
| 4005 | INSUFFICIENT_CHIPS | `player.chips < betAmount` when calling | Show "籌碼不足，無法跟注" toast; disable Call button |
| 4006 | INVALID_BET | `betAmount` not in `{10, 20, 50, 100}` | Silent ignore; revert UI to previous selection |
| 4007 | INVALID_ACTION | Unknown `action` string in `player_action` | Silent ignore; log to console |

---

## 6. State Schema Reference

Full TypeScript definitions matching `server/src/schema/SamGongState.ts`.

### 6.1 `Card`

```typescript
import { Schema, type } from "@colyseus/schema";

class Card extends Schema {
  @type("string") suit: string = "";
  // "spades" | "hearts" | "diamonds" | "clubs"
  // Empty string ("") when filtered (other player's hidden card)

  @type("string") rank: string = "";
  // "A" | "2"–"9" | "10" | "J" | "Q" | "K"
  // Empty string ("") when filtered

  @type("boolean") revealed: boolean = false;
  // false = face-down; true = face-up (reveal phase)
}
```

### 6.2 `PlayerState`

```typescript
import { Schema, type, ArraySchema, filter } from "@colyseus/schema";

class PlayerState extends Schema {
  @type("string") sessionId: string = "";
  // Colyseus-assigned session identifier

  @type("string") nickname: string = "";
  // Display name; defaults to seat-based "P1", "P2", etc.

  @type("string") status: string = "waiting";
  // "waiting"       — in lobby, not yet playing
  // "deciding"      — betting phase, awaiting action
  // "called"        — committed betAmount chips
  // "folded"        — opted out for this round
  // "disconnected"  — WebSocket dropped, reconnect window open

  @type("number") chips: number = 1000;
  // Current chip count; starts at 1000 each session

  @type("number") seatIndex: number = 0;
  // Immutable seat number (0-5); determines banker rotation order

  @type("boolean") isBanker: boolean = false;
  // True for exactly one player per round

  @type("boolean") isHost: boolean = false;
  // True for the first player who created the room; can send start_game

  @type("boolean") hasBet: boolean = false;
  // True after "call" action; false after "fold" or at round start

  // Anti-cheat: each client receives only its own cards' suit/rank.
  // The @filter decorator causes Colyseus to omit the cards field
  // entirely from other clients' patches until revealed = true.
  @filter(function(this: PlayerState, client, value, root) {
    return this.sessionId === client.sessionId
      || value.toArray().every((c: Card) => c.revealed);
  })
  @type([Card]) cards = new ArraySchema<Card>();
  // Always 3 cards after dealing; empty array in lobby/betting phases
}
```

### 6.3 `SamGongState`

```typescript
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

class SamGongState extends Schema {
  @type("string") roomPhase: string = "lobby";
  // Valid values: "lobby" | "banker_selection" | "betting" | "dealing"
  //               | "reveal" | "settling" | "round_end"

  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  // Key: sessionId; max 6 entries

  @type(["string"]) bankerQueue = new ArraySchema<string>();
  // sessionIds in join order; used for banker rotation
  // Entries are NOT removed when players leave (seat stability)

  @type("string") currentBankerId: string = "";
  // sessionId of current banker; "" in lobby

  @type("number") betAmount: number = 0;
  // Set by banker via set_bet_amount; 0 = not yet set

  @type("number") countdownSeconds: number = 0;
  // Server-driven countdown; 0 when no active timer
  // Decrements 1/s via room.clock

  @type("number") roundNumber: number = 0;
  // Increments each round; 0 in lobby
}
```

---

## 7. Client Integration Example

Complete example using `colyseus.js` (browser or Node.js):

```typescript
import * as Colyseus from "colyseus.js";
import { SamGongState } from "./schema/SamGongState";  // mirrored schema

const SERVER_URL = "ws://localhost:2567";

// ─── 1. Connect + Create Room ────────────────────────────────────────────────
const client = new Colyseus.Client(SERVER_URL);
let room: Colyseus.Room<SamGongState>;

async function createRoom(nickname: string) {
  room = await client.create<SamGongState>("sam_gong", { nickname });
  console.log("Room created:", room.id);  // 6-char room code
  setupRoomListeners();
}

async function joinRoom(roomCode: string, nickname: string) {
  try {
    room = await client.joinById<SamGongState>(roomCode, { nickname });
    setupRoomListeners();
  } catch (err) {
    console.error("Join failed:", err);
    // err.code: 4001 (not found) or 4002 (full)
  }
}

// ─── 2. State Change Listener ─────────────────────────────────────────────────
function setupRoomListeners() {
  room.onStateChange((state: SamGongState) => {
    handlePhaseChange(state.roomPhase);
    updateCountdown(state.countdownSeconds);
    updatePlayerSlots(state.players);
    updateBetAmount(state.betAmount);
  });

  // ─── 4. Handle game_result ─────────────────────────────────────────────────
  room.onMessage("game_result", (data) => {
    showSettlementOverlay(data);
  });

  // Handle server errors
  room.onMessage("error", (data) => {
    handleServerError(data.code, data.message);
  });

  // ─── 5. Handle disconnection + reconnect ───────────────────────────────────
  const reconnectionToken = room.reconnectionToken;

  room.onLeave((code) => {
    console.log("Left room, code:", code);
    if (code !== 1000) {
      // Unexpected disconnect — attempt reconnect
      attemptReconnect(reconnectionToken);
    }
  });
}

async function attemptReconnect(token: string) {
  const MAX_ATTEMPTS = 12;   // 12 × 5s = 60s
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      room = await client.reconnect<SamGongState>(token);
      setupRoomListeners();
      console.log("Reconnected successfully");
      return;
    } catch {
      await delay(5000);
    }
  }
  console.warn("Reconnect window expired");
  redirectToMainMenu();
}

// ─── 3. Send Player Action ────────────────────────────────────────────────────
function sendPlayerAction(action: "call" | "fold") {
  room.send("player_action", { action });
}

function sendStartGame() {
  room.send("start_game", {});
}

function sendBetAmount(amount: 10 | 20 | 50 | 100) {
  room.send("set_bet_amount", { amount });
}

// ─── Phase Handler (drives UI transitions) ────────────────────────────────────
function handlePhaseChange(phase: string) {
  switch (phase) {
    case "lobby":             showLobbyScreen(); break;
    case "banker_selection":  showBankerSelectionOverlay(); break;
    case "betting":           showBettingPanel(); break;
    case "dealing":           playDealingAnimation(); break;
    case "reveal":            playRevealAnimation(); break;
    case "settling":          highlightWinnersAndLosers(); break;
    case "round_end":         showContinueButton(); break;
  }
}

// ─── Error → Toast ────────────────────────────────────────────────────────────
function handleServerError(code: number, message: string) {
  const toasts: Record<number, string> = {
    4001: "找不到房間",
    4002: "房間已滿（最多6人）",
    4005: "籌碼不足，無法跟注",
  };
  const text = toasts[code];
  if (text) showToast(text);
  else console.warn(`[Server Error ${code}] ${message}`);
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
```

---

## 8. Timing Constraints

| Phase | Countdown | Server Behavior on Timeout |
|-------|-----------|---------------------------|
| `betting` | 30 s | Auto-fold all players with `status === "deciding"`; then check if anyone called — if yes advance to `dealing`, else to `round_end` (forfeit) |
| `dealing` / `reveal` | 10 s | Server forces reveal: sets all `cards[*].revealed = true` and transitions to `settling` |
| Reconnection window | 60 s | If still `"disconnected"` after 60 s: auto-fold if not yet acted in betting; treated as called if chips already committed |

Countdown is server-driven via `room.clock.setInterval`. `state.countdownSeconds` is decremented each second and broadcast as a state diff. Clients display `countdownSeconds` directly — no client-side timer drift.

---

## 9. Rate Limiting

- Maximum **10 messages per second** per WebSocket connection
- Implemented via a per-session `RateLimiter` inside `SamGongRoom`
- Messages exceeding the limit are silently dropped; the violation is logged server-side
- Repeated abuse (>100 excess messages/minute) triggers connection close with WebSocket code `4008`

```typescript
// Server-side enforcement (inside each onMessage handler):
if (!rateLimiter.check(client.sessionId)) {
  // drop message silently
  return;
}
```

---

## 10. Phase → Valid Messages Matrix

| Phase | `start_game` | `set_bet_amount` | `player_action` | `ready_for_reveal` | `request_new_round` |
|-------|:---:|:---:|:---:|:---:|:---:|
| `lobby` | ✅ host | — | — | — | — |
| `banker_selection` | — | — | — | — | — |
| `betting` | — | ✅ banker | ✅ non-banker | — | — |
| `dealing` | — | — | — | ✅ called players | — |
| `reveal` | — | — | — | — | — |
| `settling` | — | — | — | — | — |
| `round_end` | — | — | — | — | ✅ any |

Any message sent outside its valid phase returns error code `4004`.
