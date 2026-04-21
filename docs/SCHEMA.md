# SCHEMA — 三公遊戲 Schema 設計文件

## Document Control

| 欄位 | 內容 |
|------|------|
| **DOC-ID** | SCHEMA-SAM-GONG-20260421 |
| **版本** | v1.0-draft |
| **狀態** | DRAFT |
| **來源** | EDD-SAM-GONG-20260421 v1.0-draft |
| **作者** | devsop-autodev |
| **日期** | 2026-04-21 |

---

## 1. Overview

三公遊戲使用兩層獨立 Schema：

1. **Colyseus Runtime Schema** (`@colyseus/schema`): 記憶體內即時狀態，透過 WebSocket Differential Patch 同步至所有 Client。是遊戲進行的唯一狀態來源。
2. **SQLite Database Schema**: 持久化稽核日誌，每局結束後寫入，不作任何遊戲決策依據。

核心設計原則：
- **試算表是唯一狀態來源**：SQLite 僅記錄，從不讀取以做決策
- **反作弊**：`@filter` decorator 確保玩家牌面在翻牌前對其他人不可見
- **Immutable Updates**：每次狀態更新產生新物件，不修改現有狀態

---

## 2. Colyseus Runtime Schema (`@colyseus/schema`)

### 2.1 Complete TypeScript Definitions

```typescript
// server/src/schema/SamGongState.ts
import { Schema, type, MapSchema, ArraySchema, filter } from "@colyseus/schema";
import { Client } from "colyseus";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank =
  | "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "10" | "J" | "Q" | "K";
export type PlayerStatus =
  | "waiting" | "deciding" | "called" | "folded" | "disconnected";
export type RoomPhase =
  | "lobby" | "banker_selection" | "betting" | "dealing"
  | "reveal" | "settling" | "round_end";

export class Card extends Schema {
  @type("string") suit: Suit = "spades";
  @type("string") rank: Rank = "A";
  @type("boolean") revealed: boolean = false;
}

export class PlayerState extends Schema {
  @type("string") sessionId: string = "";
  @type("string") nickname: string = "";
  @type("string") status: PlayerStatus = "waiting";
  @type("number") chips: number = 1000;
  @type("boolean") isBanker: boolean = false;
  @type("boolean") isHost: boolean = false;
  @type("boolean") hasBet: boolean = false;
  @type("number") seatIndex: number = 0;

  // ANTI-CHEAT: @filter ensures cards are only visible to the owner before reveal phase.
  // When filter returns false → cards field is OMITTED entirely from that client's patch.
  // When filter returns true → full suit/rank is broadcast.
  @filter(function (
    this: PlayerState,
    client: Client,
    value: ArraySchema<Card>,
    _root: SamGongState
  ) {
    const isOwner = this.sessionId === client.sessionId;
    const allRevealed =
      value.length > 0 && value.toArray().every((c) => c.revealed);
    return isOwner || allRevealed;
  })
  @type([Card]) cards = new ArraySchema<Card>();
}

export class SamGongState extends Schema {
  @type("string") roomPhase: RoomPhase = "lobby";
  @type("string") roomCode: string = "";
  @type("number") betAmount: number = 0;
  @type("string") currentBankerId: string = "";
  @type("number") roundNumber: number = 0;
  @type("number") countdownSeconds: number = 0;

  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();

  // Seat order: sessionIds in join order. Used for banker rotation.
  // Players are never removed on leave (seat index stays stable for reconnection).
  @type(["string"]) bankerQueue = new ArraySchema<string>();
}
```

> **Fallback (EQ-1)**: If Colyseus 0.15 `@filter` cannot filter an `ArraySchema` as a whole
> (only individual fields), use `onBeforePatch` to blank `suit=""` and `rank=""` before
> sending the patch and restore them after. The client will see the card structure but no
> face data. This is documented in EDD §2.3.1.

---

### 2.2 Field Specifications

#### 2.2.1 `Card`

| Field | Type | Default | Description | Valid Values |
|-------|------|---------|-------------|--------------|
| `suit` | `string` | `"spades"` | Card suit | `"spades"`, `"hearts"`, `"diamonds"`, `"clubs"` |
| `rank` | `string` | `"A"` | Card rank | `"A"`, `"2"`–`"9"`, `"10"`, `"J"`, `"Q"`, `"K"` |
| `revealed` | `boolean` | `false` | Whether card face is visible to all | `true` only in `reveal`/`settling`/`round_end` phases |

#### 2.2.2 `PlayerState`

| Field | Type | Default | Description | Valid Values |
|-------|------|---------|-------------|--------------|
| `sessionId` | `string` | `""` | Colyseus-assigned session ID | Non-empty string, assigned on `onJoin` |
| `nickname` | `string` | `""` | Display name (MVP: `P1`/`P2`…) | Any non-empty string, max 16 chars |
| `status` | `string` | `"waiting"` | Player's action state | See `PlayerStatus` enum below |
| `chips` | `number` | `1000` | Current chip count | Integer ≥ 0 |
| `isBanker` | `boolean` | `false` | Whether player is the current banker | Exactly one player = `true` during active round |
| `isHost` | `boolean` | `false` | First player to join; can send `start_game` | `true` for exactly one player per room |
| `hasBet` | `boolean` | `false` | Whether player has placed a bet (called) | `true` only after `player_action: call` |
| `seatIndex` | `number` | `0` | Join-order seat number (0-based) | `0`–`5` (max 6 players) |
| `cards` | `ArraySchema<Card>` | `[]` | Player's hand | Length = 0 (pre-deal) or exactly 3 (post-deal); filtered by `@filter` |

**PlayerStatus values:**

| Value | Meaning |
|-------|---------|
| `"waiting"` | Lobby or between rounds |
| `"deciding"` | Betting phase, has not acted yet |
| `"called"` | Player placed a bet |
| `"folded"` | Player folded (no chips change) |
| `"disconnected"` | Temporarily disconnected (60s reconnection window) |

#### 2.2.3 `SamGongState`

| Field | Type | Default | Description | Valid Values |
|-------|------|---------|-------------|--------------|
| `roomPhase` | `string` | `"lobby"` | Current game phase | See `RoomPhase` enum |
| `roomCode` | `string` | `""` | 6-char alphanumeric room code (= Colyseus `roomId`) | Uppercase alphanumeric, no `O/0/I/1` |
| `betAmount` | `number` | `0` | Current round bet amount set by banker | `0` (unset), `10`, `20`, `50`, `100` |
| `currentBankerId` | `string` | `""` | `sessionId` of current banker | Valid `sessionId` or `""` in lobby |
| `roundNumber` | `number` | `0` | Monotonically incrementing round counter | Integer ≥ 0 |
| `countdownSeconds` | `number` | `0` | Remaining seconds for timed phase | `0` when not in a timed phase; betting = 30s, reveal = 10s |
| `players` | `MapSchema<PlayerState>` | `{}` | All connected players, keyed by `sessionId` | Map size 1–6 |
| `bankerQueue` | `ArraySchema<string>` | `[]` | Session IDs in seat-join order, used for banker rotation | Length = number of players who ever joined (never shrinks) |

---

### 2.3 Anti-Cheat Filter Explanation

The `@filter` decorator on `PlayerState.cards` is the primary anti-cheat mechanism.

**How it works:**

Colyseus evaluates the filter function individually for each connected `Client` before
constructing that client's state patch. If the function returns `false`, the annotated
field (`cards`) is **completely omitted** from that client's binary patch — not set to
null or empty, but absent entirely. A malicious client inspecting WebSocket frames will
find no card data for other players.

**Filter logic:**

```
cards visible to client C iff:
  (C.sessionId === this.sessionId)    ← player sees their own cards always
  OR
  (all cards in hand have revealed=true) ← reveal phase: everyone sees everyone
```

**Lifecycle of `revealed`:**

| Phase | `revealed` state | `@filter` result for non-owner |
|-------|-----------------|-------------------------------|
| `dealing` | `false` | `false` → cards omitted from patch |
| `reveal` | Server sets all to `true` | `true` → full suit/rank broadcast |
| `settling` / `round_end` | `true` | `true` → full suit/rank visible |
| Next round start | Cards array cleared (length = 0) | N/A |

**Fallback (EQ-1):** If `@filter` on `ArraySchema` only works at the array level
(not per-element), use `onBeforePatch` to temporarily zero out `suit=""` `rank=""`
for non-owner clients, then restore after patch. The client sees card structure but
no face information.

---

## 3. SQLite Database Schema

### 3.1 DDL

```sql
-- Enable WAL mode for concurrent reads across 50 concurrent rooms
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Audit log for completed rounds
CREATE TABLE IF NOT EXISTS game_records (
  id                INTEGER  PRIMARY KEY AUTOINCREMENT,
  room_code         TEXT     NOT NULL,
  round_number      INTEGER  NOT NULL DEFAULT 1,
  started_at        DATETIME NOT NULL DEFAULT (datetime('now')),
  ended_at          DATETIME,
  banker_session_id TEXT,
  bet_amount        INTEGER  NOT NULL DEFAULT 0,
  -- JSON array: [{ sessionId, outcome, chipsChange, finalChips }]
  results           TEXT,
  -- true when all non-banker players folded (no card comparison)
  is_no_game        BOOLEAN  NOT NULL DEFAULT FALSE,
  player_count      INTEGER  NOT NULL DEFAULT 0,
  created_at        DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- Session-level player audit (no persistent accounts; session-based identity)
CREATE TABLE IF NOT EXISTS player_sessions (
  id            INTEGER  PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT     NOT NULL,
  room_code     TEXT     NOT NULL,
  nickname      TEXT,
  joined_at     DATETIME NOT NULL DEFAULT (datetime('now')),
  left_at       DATETIME,
  -- Chips snapshot at time of leave/disconnect
  final_chips   INTEGER,
  rounds_played INTEGER  NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_game_records_room
  ON game_records(room_code);

CREATE INDEX IF NOT EXISTS idx_game_records_round
  ON game_records(room_code, round_number);

CREATE INDEX IF NOT EXISTS idx_player_sessions_session
  ON player_sessions(session_id);

CREATE INDEX IF NOT EXISTS idx_player_sessions_room
  ON player_sessions(room_code);
```

### 3.2 Table Descriptions

#### `game_records`

| Column | Purpose |
|--------|---------|
| `room_code` | Links to Colyseus room (= roomId overridden in `onCreate`) |
| `round_number` | Monotonic counter per room; combined with `room_code` is unique |
| `started_at` | Phase transition into `betting` (round start) |
| `ended_at` | Phase transition out of `settling` or `round_end` (no-game) |
| `banker_session_id` | Who was banker; useful for audit and rotation debugging |
| `bet_amount` | Bottom bet for the round (0 if no-game / never set) |
| `results` | JSON serialization of `SettlementResult[]`; full outcome per player |
| `is_no_game` | `TRUE` when flow path was `betting → round_end` (all folded) |
| `player_count` | Snapshot of active player count at time of write |

**Write trigger**: Single `INSERT` at the end of `settling` phase (or `round_end` on forfeit). Never updated mid-round.

**Expected volume (Pilot)**: 50 rooms × ~10 rounds/hour × 8h = ~4,000 rows/day. Negligible for SQLite.

#### `player_sessions`

| Column | Purpose |
|--------|---------|
| `session_id` | Colyseus `client.sessionId`; changes per reconnection |
| `room_code` | Room the player joined |
| `nickname` | Display name at time of join |
| `joined_at` | `onJoin` timestamp |
| `left_at` | `onLeave` timestamp (consented or 60s timeout) |
| `final_chips` | Chips on leave — useful for Pilot analytics |
| `rounds_played` | Incremented each time a `game_records` row includes this session |

**Write trigger**: `INSERT` on `onJoin`; `UPDATE` on `onLeave` (sets `left_at`, `final_chips`, `rounds_played`).

### 3.3 Data Lifecycle

| Event | Action |
|-------|--------|
| `SamGongRoom.onJoin` | INSERT into `player_sessions` |
| Round `settling` completes | INSERT into `game_records` |
| Round `round_end` (no-game) | INSERT into `game_records` with `is_no_game=TRUE` |
| `SamGongRoom.onLeave` | UPDATE `player_sessions` (`left_at`, `final_chips`, `rounds_played`) |
| `SamGongRoom.onDispose` | Final UPDATE for any open `player_sessions` rows |

**Retention (Pilot)**: No automated purge. A `DELETE FROM game_records WHERE started_at < date('now','-30 days')` cron can be added before production.

**Debugging queries:**

```sql
-- Latest 10 rounds for a room
SELECT * FROM game_records WHERE room_code = 'ABCD12'
ORDER BY round_number DESC LIMIT 10;

-- All sessions for a player across rooms
SELECT * FROM player_sessions WHERE session_id = '<sid>'
ORDER BY joined_at DESC;

-- No-game rate
SELECT COUNT(*) FILTER (WHERE is_no_game) * 1.0 / COUNT(*) AS forfeit_rate
FROM game_records;
```

---

## 4. Shared Types (Client + Server)

```typescript
// shared/types.ts — imported by both client and server

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank =
  | "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "10" | "J" | "Q" | "K";
export type RoomPhase =
  | "lobby" | "banker_selection" | "betting" | "dealing"
  | "reveal" | "settling" | "round_end";
export type PlayerStatus =
  | "waiting" | "deciding" | "called" | "folded" | "disconnected";

export interface CardData {
  suit: Suit;
  rank: Rank;
}

export interface SettlementResult {
  sessionId: string;
  outcome: "win" | "lose" | "no_game";
  chipsChange: number;
  finalChips: number;
  isBanker: boolean;
}

/** Allowed bet amounts (whitelist enforced server-side) */
export const BET_AMOUNTS = [10, 20, 50, 100] as const;
export type BetAmount = (typeof BET_AMOUNTS)[number];

/** Starting chip count for every new session */
export const INITIAL_CHIPS = 1000;

/** Max players per room */
export const MAX_PLAYERS = 6;

/** Server-authoritative error codes (sent as S→C "error" messages) */
export const ERROR_CODES = {
  ROOM_NOT_FOUND:       4001,  // joinById with unknown room code
  ROOM_FULL:            4002,  // room already has MAX_PLAYERS
  UNAUTHORIZED:         4003,  // non-host sending start_game; non-banker sending set_bet_amount
  WRONG_PHASE:          4004,  // message sent in incorrect RoomPhase
  INSUFFICIENT_CHIPS:   4005,  // chips < betAmount when calling
  INVALID_BET:          4006,  // betAmount not in BET_AMOUNTS whitelist
  INVALID_ACTION:       4007,  // player_action not "call"|"fold"
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Countdown durations (seconds) — mirrors server .env defaults */
export const COUNTDOWN = {
  BETTING: 30,
  REVEAL: 10,
} as const;
```

---

## 5. State Transitions Table

| Current Phase | Valid Next Phases | Trigger Condition |
|--------------|-------------------|-------------------|
| `lobby` | `banker_selection` | Host sends `start_game`; `players.size >= 2` |
| `banker_selection` | `betting` | Server selects initial banker (random) and sets `currentBankerId` |
| `betting` | `dealing` | Banker sends `set_bet_amount`; at least 1 non-banker player called |
| `betting` | `round_end` | All non-banker players folded (forfeit / no-game path) |
| `dealing` | `reveal` | All active players' cards distributed; `ready_for_reveal` or countdown expires |
| `reveal` | `settling` | Reveal countdown (10s) expires or all called players mark ready |
| `settling` | `round_end` | Settlement calculated, chips updated, `game_records` row inserted |
| `round_end` | `betting` | Any player sends `request_new_round`; banker rotates (next in `bankerQueue`) |
| `round_end` | `lobby` | All players leave room or host explicitly disbands |

**Explicitly forbidden transitions (server throws on attempt):**

- `lobby` → `dealing`, `settling`, `reveal`, `round_end`
- `betting` → `settling`, `reveal`
- `dealing` → `betting`, `lobby`
- `round_end` → `settling`, `reveal`, `dealing`

---

## 6. Invariants (Must Always Be True)

The following conditions must hold at all times in a valid `SamGongState`. Any code
path that would violate an invariant must throw before writing to state.

1. **Card count**: `player.cards.length` is `0` (before dealing) or exactly `3` (after dealing). Intermediate lengths are never persisted.

2. **Exactly one banker**: During any phase other than `lobby`, exactly one player has `isBanker = true`. In `lobby`, all players have `isBanker = false`.

3. **Host uniqueness**: Exactly one player has `isHost = true` per room for the lifetime of the room. If the host disconnects permanently, the `isHost` flag is transferred to the next seat (implementation detail; not transferred in Pilot MVP — host loss ends game).

4. **Chips non-negative**: `player.chips >= 0` at all times. The `INSUFFICIENT_CHIPS` error (4005) must be thrown before any deduction that would result in negative chips.

5. **bankerQueue monotonicity**: `bankerQueue` only grows (appended on join). Session IDs are never removed, even on leave, to maintain stable seat indices for rotation.

6. **countdownSeconds is 0 outside timed phases**: `state.countdownSeconds === 0` whenever `roomPhase` is not `"betting"` or `"reveal"`. The clock interval must be cleared on every phase transition.

7. **betAmount whitelist**: `state.betAmount` is one of `{0, 10, 20, 50, 100}`. `0` means not yet set (before `set_bet_amount`).

8. **hasBet semantics**: `player.hasBet = true` implies `player.status === "called"` and `player.isBanker === false`. A banker never has `hasBet = true`.

9. **currentBankerId references a live player**: When `roomPhase !== "lobby"`, `state.players.has(state.currentBankerId)` must be `true`.

10. **Revealed consistency**: Within a single player's `cards` array, all three cards transition from `revealed = false` to `revealed = true` atomically (server sets all three in a single state mutation before the next patch is emitted).
