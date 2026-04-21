# EDD — 三公遊戲 Engineering Design Document

## Document Control

| 欄位 | 內容 |
|------|------|
| **DOC-ID** | EDD-SAM-GONG-20260421 |
| **版本** | v1.0-draft |
| **狀態** | DRAFT |
| **來源** | PRD-SAM-GONG-20260421 v1.3-draft / PDD-SAM-GONG-20260421 v1.0-draft / TECH_STACK v1.0 |
| **作者** | devsop-autodev |
| **日期** | 2026-04-21 |

---

## 1. System Overview

### 1.1 Architecture Pattern

- **模式**: Server-Authoritative + Client-Rendering
- **通訊**: WebSocket（Colyseus Protocol）
- **狀態同步**: @colyseus/schema Differential State Sync
- **牌局邏輯**: 100% Server-side（Client 僅 Render）

### 1.2 High-Level Architecture Diagram（文字版）

```
[Cocos Creator Client] ←→ WebSocket ←→ [Colyseus Server]
                                              ↕
                                       [SamGongRoom]
                                              ↕
                               [Game Logic Module（Pure Functions）]
                                              ↕
                                        [SQLite（稽核日誌）]
```

### 1.3 Design Principles

1. **Server-Authoritative**: 所有牌局決策（洗牌、判勝負、結算）均在 Server 執行，Client 無法偽造
2. **Pure Functions**: 牌局邏輯模組（deck.ts / evaluator.ts / settlement.ts）為純函數，無副作用，可獨立單元測試
3. **Schema Filtering**: 反作弊核心，未翻牌的其他玩家牌面永遠不下發至客戶端
4. **Immutable State**: 每次狀態更新產生新物件，不修改現有狀態
5. **Fail Fast**: 非法狀態轉換直接拋出錯誤，拒絕處理

---

## 2. Server Architecture（Colyseus）

### 2.1 Room Design

```
SamGongRoom extends Room<SamGongState>
│
├── onCreate(options): 初始化狀態，設定 maxClients=6，啟動 clock
├── onJoin(client, options): 加入玩家，派座位，驗證房間碼
├── onLeave(client, consented): 60s 重連保護（allowReconnection）
├── onDispose(): 房間清理，寫入最終稽核記錄
│
├── onMessage("start_game"): 開始遊戲（只有 host 可以）
├── onMessage("set_bet_amount"): 莊家設定底注
├── onMessage("player_action"): 跟注/棄牌
├── onMessage("ready_for_reveal"): 準備翻牌（可選）
└── onMessage("request_new_round"): 請求下一局
```

### 2.2 State Machine Implementation

```typescript
type RoomPhase =
  | "lobby"
  | "banker_selection"
  | "betting"
  | "dealing"
  | "reveal"
  | "settling"
  | "round_end";

// 轉換表（只允許以下轉換）
const VALID_TRANSITIONS: Record<RoomPhase, RoomPhase[]> = {
  lobby:             ["banker_selection"],
  banker_selection:  ["betting"],
  betting:           ["dealing", "round_end"],  // round_end = 流局（全棄牌）
  dealing:           ["reveal"],
  reveal:            ["settling"],
  settling:          ["round_end"],
  round_end:         ["betting", "lobby"],      // lobby = 解散房間
};

// 非法轉換（Server 必須拒絕）：
// lobby→dealing, lobby→settling, betting→settling,
// dealing→betting, round_end→settling

function transition(room: SamGongRoom, to: RoomPhase): void {
  const current = room.state.roomPhase as RoomPhase;
  if (!VALID_TRANSITIONS[current]?.includes(to)) {
    throw new Error(`Invalid transition: ${current} → ${to}`);
  }
  room.state.roomPhase = to;
  // 觸發對應的 phase handler
  phaseHandlers[to](room);
}
```

**莊家輪換說明：**
- 第一局：`lobby` → `banker_selection`（Server 隨機指定莊家）→ `betting`
- 第二局起：`round_end` → `betting`（莊家由 US-005 輪換機制預先決定，無需再進入 `banker_selection`）

### 2.3 Anti-Cheat: Card Schema Filtering

牌面資料流：

```
Server shuffles deck → stores full CardData in server-side array (NOT in shared state)
    ↓
For each player's own cards:
  - Set card.suit / card.rank on their PlayerState
  - card.revealed = false
    ↓ (Colyseus sends each player only their own cards with actual suit/rank)
Other players see Card objects with suit="" rank="" (blanked, revealed=false)
    ↓ (on REVEAL phase)
Server sets all cards.revealed = true, broadcasts full suit/rank to everyone
```

```typescript
// SamGongRoom.ts — Schema Filtering 實作
// Colyseus 0.15 使用 onBeforePatch / filterBy 機制
// 在 PlayerState.cards 上標記 per-player visibility

class SamGongRoom extends Room<SamGongState> {
  onCreate(options: any) {
    this.setState(new SamGongState());
    this.maxClients = 6;
    
    // 關鍵：為每個 client 的 patch 設定過濾邏輯
    this.onMessage("*", () => {}); // catch-all for safety
  }
  
  // 每次 patch 前，過濾其他玩家的未翻牌牌面
  // 確保 client 只收到自己牌的 suit/rank（其他人牌的 suit/rank 清空）
  patchedStateFor(client: Client): SamGongState {
    // 依照 sessionId 遮蔽其他玩家未 revealed 的牌
    // 回傳過濾後的 state patch（實作細節見 Section 2.3.1）
  }
}
```

**Section 2.3.1 — 過濾實作細節：**

由於 Colyseus 0.15 的 `filterBy` 需搭配 `@filter()` decorator，實作方式：

```typescript
// schema/SamGongState.ts
import { Schema, type, ArraySchema, filter } from "@colyseus/schema";
import { Client } from "colyseus";

export class Card extends Schema {
  @type("string") suit: string = "";
  @type("string") rank: string = "";
  @type("boolean") revealed: boolean = false;
}

export class PlayerState extends Schema {
  @type("string") sessionId: string = "";
  @type("string") status: string = "waiting";
  @type("number") chips: number = 1000;
  @type("boolean") isBanker: boolean = false;
  @type("boolean") hasBet: boolean = false;

  // @filter 讓 Colyseus 在發送 patch 時，
  // 對每個 client 個別決定 cards 欄位的內容
  @filter(function(
    this: PlayerState,
    client: Client,
    value: ArraySchema<Card>,
    root: SamGongState
  ) {
    // 牌主本人 or 已翻牌：完整發送
    return this.sessionId === client.sessionId || value.toArray().every(c => c.revealed);
  })
  @type([Card]) cards = new ArraySchema<Card>();
}
```

### 2.4 Reconnection Logic

```typescript
async onLeave(client: Client, consented: boolean) {
  const player = this.state.players.get(client.sessionId);
  if (!player) return;

  player.status = "disconnected"; // 廣播給其他玩家顯示「離線」

  if (!consented && this.state.roomPhase !== "lobby") {
    try {
      // 等待 60 秒重連（AC-012-1）
      await this.allowReconnection(client, 60);
      // 重連成功（AC-012-2）
      player.status = "deciding"; // 或依照之前狀態恢復
    } catch {
      // 60s 超時（AC-012-3）
      if (player.status === "disconnected") {
        const phase = this.state.roomPhase;
        if (phase === "betting" && !player.hasBet) {
          // 未跟注 → 自動棄牌，不扣籌碼
          player.status = "folded";
          player.hasBet = false;
        } else if (phase === "betting" && player.hasBet) {
          // 已跟注 → 以現有牌參與，Server 自動翻牌
          player.status = "called";
          // revealing 時 Server 自動處理，不需玩家操作
        }
        // 檢查是否所有人都已決策，推進狀態機
        this.checkAndAdvancePhase();
      }
    }
  }
}
```

### 2.5 Countdown Implementation（Server-side）

```typescript
// 使用 Colyseus room.clock（避免 Client 計時 drift）
startBettingCountdown(seconds: number = 30) {
  this.state.countdownSeconds = seconds;
  const interval = this.clock.setInterval(() => {
    this.state.countdownSeconds -= 1;
    if (this.state.countdownSeconds <= 0) {
      interval.clear();
      this.autoFoldPendingPlayers(); // 超時自動棄牌（AC-007-4）
      this.checkAndAdvancePhase();
    }
  }, 1000);
}
```

### 2.6 Room Code Generation

```typescript
// 生成 6 位英數房間碼（唯一，AC-001-1）
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去除易混淆字符
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}
```

---

## 3. Game Logic Module（純函數，可測試）

### 3.1 Deck & Shuffle

```typescript
// server/src/logic/deck.ts

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "J" | "Q" | "K";

export interface CardData {
  suit: Suit;
  rank: Rank;
}

export function createDeck(): CardData[] {
  const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
  const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "J", "Q", "K"];
  return suits.flatMap(suit => ranks.map(rank => ({ suit, rank })));
  // 返回新陣列（immutable）
}

// Fisher-Yates shuffle（AC-008-1）
export function shuffle(deck: CardData[]): CardData[] {
  const d = [...deck]; // 不修改原始陣列（immutable）
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// 從洗好的牌堆中發牌（每人3張）
export function dealCards(
  deck: CardData[],
  playerIds: string[]
): Map<string, CardData[]> {
  const result = new Map<string, CardData[]>();
  let idx = 0;
  for (const pid of playerIds) {
    result.set(pid, [deck[idx++], deck[idx++], deck[idx++]]);
  }
  return result;
}
```

### 3.2 Sam Gong Hand Evaluation

```typescript
// server/src/logic/evaluator.ts

const RANK_VALUE: Record<Rank, number> = {
  "A": 1,  "2": 2,  "3": 3,  "4": 4,  "5": 5,
  "6": 6,  "7": 7,  "8": 8,  "9": 9,
  "J": 10, "Q": 10, "K": 10
};

/**
 * 計算三公點數
 * - 三張牌面值加總，取個位數（sum mod 10）
 * - 如果 sum % 10 === 0（即10的倍數）→ 公牌（三公），最強牌型（AC-009-3）
 * - 否則點數為 sum % 10（1-9），越大越強（AC-009-4）
 *
 * 實作要點（AC-009-5）：
 * - 先檢查 sum % 10 === 0 → 公牌（回傳特殊值 10 以區分普通0）
 * - 否則回傳 sum % 10（1-9）
 *
 * 注意：3張牌最低總和 = 1+1+1 = 3，不可能出現普通0點（AC-009-3 確認）
 */
export function calculatePoints(cards: CardData[]): number {
  const sum = cards.reduce((acc, c) => acc + RANK_VALUE[c.rank], 0);
  return sum % 10 === 0 ? 10 : sum % 10; // 10 = 公牌（三公）
}

/**
 * 比較閒 vs 莊（AC-010-3）
 * - 閒 > 莊 → 閒贏（"player"）
 * - 閒 < 莊 → 莊贏（"banker"）
 * - 同點（含雙方均為公牌）→ 莊贏（"banker"）（平局莊佔優）
 */
export function compareHands(
  playerCards: CardData[],
  bankerCards: CardData[]
): "player" | "banker" {
  const playerPts = calculatePoints(playerCards);  // 10 = 公牌
  const bankerPts = calculatePoints(bankerCards);  // 10 = 公牌

  if (playerPts > bankerPts) return "player";
  return "banker"; // 包含同點（平局）→ 莊贏
}

/**
 * 取得點數顯示文字（UI 用）
 */
export function getPointsDisplay(points: number): string {
  return points === 10 ? "公牌" : String(points);
}
```

### 3.3 Settlement Calculation

```typescript
// server/src/logic/settlement.ts

export interface PlayerInput {
  cards: CardData[];
  hasBet: boolean;    // false = 棄牌（不參與結算）
  isBanker: boolean;
  chips: number;
}

export interface SettlementResult {
  sessionId: string;
  outcome: "win" | "lose" | "no_game";  // no_game = 棄牌
  chipsChange: number;
  finalChips: number;
}

export function settle(
  players: Map<string, PlayerInput>,
  bankerId: string,
  betAmount: number
): SettlementResult[] {
  const banker = players.get(bankerId)!;
  const results: SettlementResult[] = [];
  let bankerChipsChange = 0;

  for (const [sid, player] of players) {
    if (sid === bankerId) continue; // 莊家最後統一計算

    if (!player.hasBet) {
      // 棄牌：無結算（AC-007-3）
      results.push({
        sessionId: sid,
        outcome: "no_game",
        chipsChange: 0,
        finalChips: player.chips,
      });
      continue;
    }

    const outcome = compareHands(player.cards, banker.cards);
    const chipsChange = outcome === "player" ? betAmount : -betAmount;
    bankerChipsChange -= chipsChange; // 莊家的盈虧 = 閒家的反向

    results.push({
      sessionId: sid,
      outcome: outcome === "player" ? "win" : "lose",
      chipsChange,
      finalChips: player.chips + chipsChange,
    });
  }

  // 莊家結算（AC-011-1 / AC-011-2）
  results.push({
    sessionId: bankerId,
    outcome: bankerChipsChange >= 0 ? "win" : "lose",
    chipsChange: bankerChipsChange,
    finalChips: banker.chips + bankerChipsChange,
  });

  return results;
}

/**
 * 流局結算（AC-007-6）：所有閒家棄牌，底注退回莊家，無盈虧
 */
export function settleForfeit(
  players: Map<string, PlayerInput>,
  _bankerId: string
): SettlementResult[] {
  return Array.from(players.entries()).map(([sid, player]) => ({
    sessionId: sid,
    outcome: "no_game",
    chipsChange: 0,
    finalChips: player.chips,
  }));
}
```

### 3.4 Banker Rotation

```typescript
// server/src/logic/banker.ts

/**
 * 初始隨機莊家（AC-004-1）
 */
export function selectInitialBanker(playerIds: string[]): string {
  const idx = Math.floor(Math.random() * playerIds.length);
  return playerIds[idx];
}

/**
 * 下一位莊家（順時針輪換，AC-005-1）
 * seatOrder: 玩家加入順序（座位順序）
 */
export function getNextBanker(
  seatOrder: string[],
  currentBankerId: string
): string {
  const currentIdx = seatOrder.indexOf(currentBankerId);
  const nextIdx = (currentIdx + 1) % seatOrder.length;
  return seatOrder[nextIdx];
}
```

---

## 4. Client Architecture（Cocos Creator 4.x）

### 4.1 Core Pattern: Event-Driven State Update

```typescript
// Server 狀態變更 → GameEventEmitter → UI 組件自動更新
// UI 組件只負責渲染，不直接持有遊戲狀態（遵循 Container/Presentational 分離）

GameManager.instance.room.onStateChange((state) => {
  GameEventEmitter.emit("phase_changed", state.roomPhase);
  GameEventEmitter.emit("players_updated", state.players);
  GameEventEmitter.emit("countdown_updated", state.countdownSeconds);
  GameEventEmitter.emit("bet_amount_updated", state.betAmount);
  GameEventEmitter.emit("banker_changed", state.currentBankerId);
});
```

### 4.2 Scene Architecture

| 場景 | 檔案 | 用途 |
|------|------|------|
| 主選單 | `MainMenu.scene` | 創建/加入房間 |
| 遊戲大廳 | `GameLobby.scene` | 等待玩家，顯示房間碼 |
| 遊戲主場景 | `GamePlay.scene` | 牌局進行（含所有 Overlay） |

> 結算（SettlementOverlay）不單獨開 Scene，內嵌於 GamePlay.scene 作為 Overlay，避免 Scene 切換延遲。

### 4.3 Key Script Dependencies

```
GameManager（Singleton）
├── 持有 Colyseus.Room<SamGongState> 實例
├── 所有 sendMessage() 在此集中
├── reconnect() 斷線重連（每5s一次）
└── onStateChange → GameEventEmitter

GameEventEmitter（Event Bus）
├── 解耦 GameManager 與各 UI Controller
└── 使用 on/off/emit 訂閱模型

GamePlayController（主控器）
├── 監聽 GameEventEmitter 所有事件
├── 控制 Panel/Overlay 顯示/隱藏（依 roomPhase）
├── 協調 PlayerSlotComponent[] 更新
├── showBankerSelectionOverlay() / hideBankerSelectionOverlay()
└── RevealSequence 翻牌序列協調

CardComponent（per-card）
├── 顯示牌面（Sprite）或牌背
├── flipCard(cardData) — Tween rotateY 0→90→0（0.6s）
└── 收到 revealed=true 時自動翻面（onStateChange 觸發）

PlayerSlotComponent（per-player seat）
├── 顯示頭像/名稱/籌碼/狀態 Badge
├── 莊家標識（皇冠 Sprite）
└── 斷線狀態 UI（灰色頭像 + ⚠ 閃爍）

BettingPanelComponent
├── showBankerView()：4 個底注選項 + 確認按鈕（AC-006-1）
├── showPlayerView()：Call/Fold 按鈕（AC-007-1）
└── showWaitingView()：所有按鈕 disabled

CountdownComponent
├── 數字倒計時 Label
├── ProgressBar 視覺進度
└── 剩餘 ≤ 5s → 紅色閃爍（AC-007-1）

SettlementController
├── showNormalSettlement(results)：正常結算（有比牌）
└── showForfeitSettlement(bankerName, betAmount)：流局結算（AC-007-6）
```

### 4.4 GameManager Singleton

```typescript
// client/assets/scripts/managers/GameManager.ts
import * as Colyseus from 'colyseus.js';
import { SamGongState } from '../schema/SamGongState';

export class GameManager {
  private static _instance: GameManager;
  private client: Colyseus.Client;
  private _room: Colyseus.Room<SamGongState> | null = null;

  static get instance(): GameManager {
    return this._instance ||= new GameManager();
  }

  /** App 啟動時呼叫一次（MainMenuController.onLoad） */
  async connect(serverUrl: string): Promise<void> {
    this.client = new Colyseus.Client(serverUrl);
  }

  async createRoom(): Promise<void> {
    this._room = await this.client.create<SamGongState>("sam_gong");
    this.setupListeners();
  }

  async joinRoom(roomCode: string): Promise<void> {
    // joinById 用房間碼（Colyseus 預設 roomId = roomCode for custom lobby）
    this._room = await this.client.joinById<SamGongState>(roomCode);
    this.setupListeners();
  }

  private setupListeners(): void {
    if (!this._room) return;
    this._room.onStateChange(state => GameEventEmitter.emit('stateChange', state));
    this._room.onError((code, msg) => GameEventEmitter.emit('roomError', { code, msg }));
    this._room.onLeave(code => GameEventEmitter.emit('roomLeave', { code }));
    this._room.onMessage('game_result', data => GameEventEmitter.emit('gameResult', data));
    this._room.onMessage('error', data => GameEventEmitter.emit('serverError', data));
  }

  sendMessage(type: string, data?: unknown): void {
    this._room?.send(type, data);
  }

  get room(): Colyseus.Room<SamGongState> | null { return this._room; }

  async leaveRoom(): Promise<void> {
    await this._room?.leave();
    this._room = null;
  }

  /** 斷線重連（AC-012-2）：每 5s 嘗試一次，在 ReconnectOverlay 倒計時期間呼叫 */
  async reconnect(): Promise<boolean> {
    if (!this._room) return false;
    try {
      this._room = await this.client.reconnect(this._room.reconnectionToken);
      this.setupListeners();
      return true;
    } catch {
      return false;
    }
  }
}
```

### 4.5 roomPhase → UI 對應

| roomPhase | GamePlayController 行為 | 操作區狀態 |
|-----------|------------------------|-----------|
| `lobby` | 顯示 GameLobby 場景 | N/A |
| `banker_selection` | 切換至 GamePlay，顯示 BankerSelectionOverlay | 所有按鈕 disabled |
| `betting` | 隱藏 Overlay，BettingPanel 顯示 | 莊家：showBankerView()；閒家：showPlayerView() |
| `dealing` | 播放發牌動畫（0.4s/張，從中央飛出） | 所有按鈕 disabled |
| `reveal` | 播放翻牌序列（0.6s/張，rotateY） | 所有按鈕 disabled |
| `settling` | 比牌高亮 + 籌碼 lerp 動畫 | 所有按鈕 disabled |
| `round_end`（正常） | SettlementOverlay（含牌面表格） | [繼續] / [離開] |
| `round_end`（流局） | SettlementOverlay（流局訊息，無牌面） | [繼續] / [離開] |

---

## 5. Database Design（SQLite）

### 5.1 Tables

```sql
-- SQLite Pilot 版本（WAL 模式支援 concurrent 讀取）
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 牌局記錄（稽核用）
CREATE TABLE IF NOT EXISTS game_records (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code      TEXT    NOT NULL,
  round_number   INTEGER NOT NULL,
  started_at     DATETIME NOT NULL DEFAULT (datetime('now')),
  ended_at       DATETIME,
  banker_session_id TEXT,
  bet_amount     INTEGER,
  results        JSON,             -- SettlementResult[] JSON 陣列
  is_no_game     BOOLEAN NOT NULL DEFAULT FALSE, -- 流局
  created_at     DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- 玩家 Session 記錄（無持久帳號，session-based）
CREATE TABLE IF NOT EXISTS player_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     TEXT    NOT NULL,
  room_code      TEXT    NOT NULL,
  joined_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  left_at        DATETIME,
  final_chips    INTEGER,          -- 離開時的籌碼數
  created_at     DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_game_records_room_code ON game_records(room_code);
CREATE INDEX IF NOT EXISTS idx_player_sessions_session_id ON player_sessions(session_id);
```

### 5.2 SQLite Write Strategy

- **僅作稽核日誌**：不作決策依據（試算表設計哲學）
- **每局結束後寫入** game_records（結算完成才 INSERT，不在牌局中途更新）
- **Pilot 版使用 SQLite**；Production 遷移至 PostgreSQL（透過 Prisma ORM migration）

---

## 6. API & Message Protocol

### 6.1 Colyseus Room Messages

| Direction | Type | Payload | 驗證條件 | Phase |
|-----------|------|---------|---------|-------|
| C→S | `start_game` | `{}` | 只有 host（第一個加入的玩家）可發送 | lobby |
| C→S | `set_bet_amount` | `{ amount: 10\|20\|50\|100 }` | 只有莊家，amount 必須在白名單 | betting |
| C→S | `player_action` | `{ action: "call"\|"fold" }` | 只有非莊閒家，status 必須為 deciding | betting |
| C→S | `ready_for_reveal` | `{}` | 所有已跟注玩家（可選，倒計時結束自動觸發） | dealing |
| C→S | `request_new_round` | `{}` | 任意玩家（UI 上的「繼續下一局」） | round_end |
| S→C | State Diff | `SamGongState` diff | 自動（@colyseus/schema） | all |
| S→C | `game_result` | `SettlementResult[]` | Server 廣播（settling phase 結束時） | settling |
| S→C | `error` | `{ code: number, message: string }` | 所有錯誤情況 | any |

### 6.2 Error Codes

| Code | Description | HTTP 等效 |
|------|------------|---------|
| 4001 | 房間不存在 | 404 |
| 4002 | 房間已滿（已達 6 人） | 409 |
| 4003 | 非法操作（無權限，如非莊家發 set_bet_amount） | 403 |
| 4004 | 非法狀態轉換（當前 phase 不支援此操作） | 422 |
| 4005 | 籌碼不足（AC-013-1）| 400 |
| 4006 | 無效參數（betAmount 不在白名單）| 400 |

### 6.3 Message Validation（All handlers）

```typescript
// 所有 onMessage handler 的前置驗證
function validateAction(
  room: SamGongRoom,
  client: Client,
  requiredPhase: RoomPhase,
  requiredRole?: "banker" | "player"
): void {
  // 1. 玩家身份驗證
  const player = room.state.players.get(client.sessionId);
  if (!player) {
    room.send(client, "error", { code: 4003, message: "Unknown player" });
    throw new Error("Unknown player");
  }

  // 2. Phase 驗證
  if (room.state.roomPhase !== requiredPhase) {
    room.send(client, "error", { code: 4004, message: `Wrong phase: ${room.state.roomPhase}` });
    throw new Error(`Wrong phase: ${room.state.roomPhase}`);
  }

  // 3. 角色驗證（可選）
  if (requiredRole === "banker" && !player.isBanker) {
    room.send(client, "error", { code: 4003, message: "Not banker" });
    throw new Error("Not banker");
  }
  if (requiredRole === "player" && player.isBanker) {
    room.send(client, "error", { code: 4003, message: "Banker cannot call/fold" });
    throw new Error("Banker cannot call/fold");
  }
}
```

---

## 7. Security Design

### 7.1 Card Data Flow（Anti-Cheat）

```
1. Server.shuffle() → 牌組存於 SamGongRoom 私有屬性（非 Schema state）
2. 發牌時，依每位玩家 sessionId 寫入其 PlayerState.cards（suit/rank）
3. @filter decorator → 其他玩家收到的 Card patch 中 suit="" rank=""（反作弊）
4. revealed = false 期間：開發者工具無法看到他人牌面
5. 翻牌（REVEAL）：Server 將所有 cards.revealed = true → 廣播完整牌面
```

### 7.2 Rate Limiting

```typescript
// 每個 WebSocket 連接操作 ≤ 10 次/秒（PRD §5.3）
// 在 Colyseus Room 層面實作 per-session rate limiter

class RateLimiter {
  private counts = new Map<string, { count: number; resetAt: number }>();
  
  check(sessionId: string, limit = 10): boolean {
    const now = Date.now();
    const entry = this.counts.get(sessionId) ?? { count: 0, resetAt: now + 1000 };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + 1000;
    }
    entry.count++;
    this.counts.set(sessionId, entry);
    return entry.count <= limit;
  }
}
```

### 7.3 Input Validation

```typescript
const VALID_BET_AMOUNTS = new Set([10, 20, 50, 100]);

// set_bet_amount handler
this.onMessage("set_bet_amount", (client, data) => {
  validateAction(this, client, "betting", "banker");
  if (!VALID_BET_AMOUNTS.has(data?.amount)) {
    this.send(client, "error", { code: 4006, message: "Invalid bet amount" });
    return;
  }
  // 繼續處理...
});

// player_action handler
this.onMessage("player_action", (client, data) => {
  validateAction(this, client, "betting", "player");
  if (!["call", "fold"].includes(data?.action)) {
    this.send(client, "error", { code: 4006, message: "Invalid action" });
    return;
  }
  const player = this.state.players.get(client.sessionId)!;
  if (data.action === "call" && player.chips < this.state.betAmount) {
    this.send(client, "error", { code: 4005, message: "Insufficient chips" });
    return;
  }
  // 繼續處理...
});
```

---

## 8. Performance Considerations

### 8.1 Colyseus State Optimization

- 使用 `@type("number")` 而非 `@type("float64")` 節省 bandwidth（籌碼/底注為整數）
- `cards` ArraySchema 最多 3 張，Schema diff 開銷極小（< 100 bytes/patch）
- 最多 6 玩家，每次 state diff < 1KB（正常操作）
- `countdownSeconds` 每秒 1 次 diff，無 burst

### 8.2 Client-side Rendering Optimization

- `CardComponent` 使用 Sprite Atlas（52 張牌面 + 牌背 = 1 Atlas），減少 draw call
- 翻牌動畫使用 `tween`（Cocos 內建），執行於 render thread，不阻塞 JS
- `PlayerLayoutManager` 布局計算在 Scene 載入時完成（非每幀），不產生 GC 壓力

### 8.3 SQLite Concurrent Write

```sql
-- WAL 模式允許多讀單寫，適合 50 concurrent 房間（PRD §5.1）
PRAGMA journal_mode = WAL;
-- 寫操作在 round_end（低頻），不影響牌局進行中的 read
```

### 8.4 NFR 達成確認

| 指標 | 目標 | 實現方式 |
|------|------|---------|
| 操作響應延遲 | < 300ms P95 | Colyseus diff patch 通常 < 50ms，WebSocket RTT 主導 |
| 發牌完成時間 | < 2s | 動畫 1.5s（AC-008-5），發牌動畫並行執行 |
| Server CPU（空閒） | < 20%（50 concurrent）| Colyseus Node.js 單進程，50 房間 × 6 人 = 300 connections，Node.js 可輕鬆承載 |
| Server 記憶體 | < 512MB（50 concurrent） | 每房間 state < 10KB，50 房間 < 1MB |
| WebSocket 建立 | < 1s | 在同區域 VPS 通常 < 100ms |

---

## 9. Deployment Architecture（Pilot）

```
Internet
    ↓
[Nginx: 80/443]
    ├── /ws → upstream colyseus:2567 (WebSocket proxy)
    └── / → /var/www/sam-gong/（Cocos Build Output）
            
[Colyseus: Node.js process（pm2 管理）]
    PORT=2567
    └── [SQLite File: ./data/game.db（WAL mode）]
```

### 9.1 Nginx WebSocket Configuration

```nginx
# /etc/nginx/sites-available/sam-gong
server {
  listen 80;
  server_name game.example.com;

  # WebSocket 代理（Colyseus）
  location /ws {
    proxy_pass http://localhost:2567;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s; # 長連接
  }

  # 靜態檔案（Cocos Build）
  location / {
    root /var/www/sam-gong;
    index index.html;
    try_files $uri $uri/ /index.html;
  }
}
```

### 9.2 Environment Variables

```
# .env（Server）
NODE_ENV=production
PORT=2567
SQLITE_PATH=./data/game.db
MAX_CLIENTS_PER_ROOM=6
RECONNECTION_TIMEOUT=60
COUNTDOWN_BETTING=30
COUNTDOWN_REVEAL=10
LOG_LEVEL=info
```

### 9.3 Process Management（pm2）

```bash
pm2 start dist/index.js --name sam-gong-server \
  --instances 1 \          # Colyseus 單進程（無 cluster mode 需求）
  --restart-delay 1000 \   # 崩潰後 1s 重啟
  --max-restarts 10
```

---

## 10. File Structure（Implementation Reference）

```
sam-gong-game/
├── server/
│   ├── src/
│   │   ├── index.ts                    # Colyseus Server 入口
│   │   ├── rooms/
│   │   │   └── SamGongRoom.ts          # Room 實作（State Machine + handlers）
│   │   ├── schema/
│   │   │   └── SamGongState.ts         # @colyseus/schema 定義（Card / PlayerState / SamGongState）
│   │   ├── logic/                      # 純函數，可獨立單元測試
│   │   │   ├── deck.ts                 # createDeck, shuffle, dealCards
│   │   │   ├── evaluator.ts            # calculatePoints, compareHands, getPointsDisplay
│   │   │   ├── settlement.ts           # settle, settleForfeit
│   │   │   └── banker.ts               # selectInitialBanker, getNextBanker
│   │   ├── db/
│   │   │   └── sqlite.ts               # SQLite 稽核日誌 wrapper
│   │   └── utils/
│   │       ├── roomCode.ts             # generateRoomCode
│   │       └── rateLimiter.ts          # RateLimiter class
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── deck.test.ts
│   │   │   ├── evaluator.test.ts       # 1000 組隨機牌局測試（PRD §12）
│   │   │   ├── settlement.test.ts
│   │   │   └── banker.test.ts
│   │   └── integration/
│   │       └── samGongRoom.test.ts     # Colyseus Testing 框架
│   └── package.json
│
├── client/
│   ├── assets/
│   │   ├── scripts/
│   │   │   ├── managers/
│   │   │   │   ├── GameManager.ts
│   │   │   │   ├── GameEventEmitter.ts
│   │   │   │   ├── AudioManager.ts          # MVP stub
│   │   │   │   └── PlayerLayoutManager.ts
│   │   │   ├── ui/
│   │   │   │   ├── MainMenuController.ts
│   │   │   │   ├── GameLobbyController.ts
│   │   │   │   ├── GamePlayController.ts    # 主控器（最複雜）
│   │   │   │   └── SettlementController.ts
│   │   │   ├── components/
│   │   │   │   ├── CardComponent.ts
│   │   │   │   ├── PlayerSlotComponent.ts
│   │   │   │   ├── CountdownComponent.ts
│   │   │   │   ├── BettingPanelComponent.ts
│   │   │   │   └── ChipCounterComponent.ts
│   │   │   └── schema/
│   │   │       └── SamGongState.ts          # 與 Server 同步的 Schema 定義
│   │   ├── prefabs/
│   │   │   ├── ui/                          # HUD / BettingPanel / SettlementOverlay 等
│   │   │   ├── game/                        # CardComponent / PlayerSlot / ChipCounter
│   │   │   └── common/                      # CountdownTimer / BankerCrown
│   │   ├── resources/
│   │   │   ├── sprites/cards/               # 52 張牌面 Sprite（Atlas）
│   │   │   └── audio/                       # sfx_deal / flip / win / lose / tick / click
│   │   └── scenes/
│   │       ├── MainMenu.scene
│   │       ├── GameLobby.scene
│   │       └── GamePlay.scene
│   └── package.json
│
├── shared/
│   └── types.ts                             # 共用型別（SettlementResult 等）
│
├── docs/
│   ├── PRD.md
│   ├── PDD.md
│   ├── TECH_STACK.md
│   └── EDD.md                              # 本文件
│
├── infra/
│   └── nginx.conf
│
├── docker-compose.yml
└── package.json                            # Monorepo root
```

---

## 11. Implementation Order（Development Phases）

### Phase A: Server Core（無 UI，純邏輯）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| A1 | `logic/deck.ts` | createDeck, shuffle, dealCards（無依賴，先做）|
| A2 | `logic/evaluator.ts` | calculatePoints, compareHands + Jest 測試 |
| A3 | `logic/settlement.ts` | settle, settleForfeit + Jest 測試 |
| A4 | `logic/banker.ts` | selectInitialBanker, getNextBanker |
| A5 | `schema/SamGongState.ts` | @colyseus/schema 定義（Card / PlayerState / SamGongState）|
| A6 | `rooms/SamGongRoom.ts` | Room 實作：State Machine + all message handlers |
| A7 | `db/sqlite.ts` | SQLite 稽核日誌 wrapper |

> A1-A4 可並行開發（純函數，相互無依賴）；A5 完成後才能開發 A6。

### Phase B: Client Core

| 步驟 | 檔案 | 說明 |
|------|------|------|
| B1 | `GameManager.ts` + `GameEventEmitter.ts` | Colyseus 連線 + 事件系統 |
| B2 | `MainMenuController.ts` + `MainMenu.scene` | 創建/加入房間 |
| B3 | `GameLobbyController.ts` + `GameLobby.scene` | 大廳等待 |
| B4 | `CardComponent.ts` | 翻牌 Tween 動畫 |
| B5 | `PlayerSlotComponent.ts` | 玩家格組件 |
| B6 | `BettingPanelComponent.ts` | 押注面板（莊/閒視圖切換）|
| B7 | `GamePlayController.ts` + `GamePlay.scene` | 主場景（整合所有組件）|
| B8 | `SettlementController.ts` | 結算 Overlay（正常 + 流局）|

### Phase C: Integration

| 步驟 | 說明 |
|------|------|
| C1 | End-to-end 牌局流程（本機測試，2 瀏覽器視窗）|
| C2 | 斷線重連測試（網路限流工具模擬斷線）|
| C3 | Anti-cheat 驗證（DevTools Network 確認他人牌面不洩露）|
| C4 | 流局路徑測試（所有閒家棄牌 → round_end 直跳）|

### Phase D: Testing & Hardening

| 步驟 | 說明 |
|------|------|
| D1 | Jest server unit tests（1000 組牌局隨機測試，AC-009-1~5 全覆蓋）|
| D2 | Playwright E2E（主要流程：創房→押注→比牌→結算）|
| D3 | 壓力測試（50 concurrent 房間，K6 或 Artillery）|
| D4 | Mobile Web 測試（iPhone SE 橫向最小寬度 667px）|

---

## 12. Testing Strategy

### 12.1 Server Unit Tests（Jest）

```typescript
// server/tests/unit/evaluator.test.ts

describe("calculatePoints", () => {
  test("公牌（三公）：5+5+K = 5+5+10 = 20 → 公牌（回傳10）", () => {
    const cards = [
      { suit: "clubs", rank: "5" },
      { suit: "hearts", rank: "5" },
      { suit: "diamonds", rank: "K" },
    ] as CardData[];
    expect(calculatePoints(cards)).toBe(10); // 10 = 公牌
  });

  test("一般點數：A+7+3 = 1+7+3 = 11 → 1點", () => {
    const cards = [
      { suit: "spades", rank: "A" },
      { suit: "hearts", rank: "7" },
      { suit: "clubs", rank: "3" },
    ] as CardData[];
    expect(calculatePoints(cards)).toBe(1);
  });

  test("1000 組隨機牌局：結果必須在 {1..9, 10} 範圍內", () => {
    const deck = shuffle(createDeck());
    for (let i = 0; i < 1000; i++) {
      const hand = [deck[i * 3 % 52], deck[(i * 3 + 1) % 52], deck[(i * 3 + 2) % 52]];
      const pts = calculatePoints(hand as CardData[]);
      expect(pts).toBeGreaterThanOrEqual(1);
      expect(pts).toBeLessThanOrEqual(10); // 10 = 公牌
    }
  });
});

describe("compareHands", () => {
  test("平局（同點非公牌）→ 莊贏（AC-010-3）", () => {
    // 兩手牌都是1點
    expect(compareHands(/* 1pt cards */, /* 1pt cards */)).toBe("banker");
  });

  test("雙方均為公牌 → 莊贏（AC-010-3）", () => {
    const gongHand = [{ suit:"clubs", rank:"5" }, { suit:"hearts", rank:"5" }, { suit:"diamonds", rank:"K" }] as CardData[];
    expect(compareHands(gongHand, gongHand)).toBe("banker");
  });
});
```

### 12.2 Playwright E2E

```typescript
// server/tests/e2e/gameplay.spec.ts

test("完整牌局流程：創房 → 加入 → 押注 → 比牌 → 結算", async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  // 玩家1創房
  await page1.goto("http://localhost:8080");
  await page1.click('[data-testid="create-room-btn"]');
  const roomCode = await page1.textContent('[data-testid="room-code-label"]');

  // 玩家2加入
  await page2.goto("http://localhost:8080");
  await page2.fill('[data-testid="room-code-input"]', roomCode!);
  await page2.click('[data-testid="join-room-btn"]');

  // 玩家1開始遊戲
  await page1.click('[data-testid="start-game-btn"]');

  // 等待進入押注階段
  await page1.waitForSelector('[data-testid="betting-panel"]');
  // ... 後續操作
});
```

### 12.3 Coverage Requirements

| 層次 | 目標覆蓋率 |
|------|-----------|
| `logic/` 純函數（unit） | ≥ 90% |
| `rooms/SamGongRoom.ts`（integration）| ≥ 80% |
| Client Controllers（E2E 補充）| 主要流程 100% |

---

## 13. Feasibility Assessment

| 技術點 | 可行性 | 風險 | 緩解方案 |
|--------|--------|------|---------|
| Colyseus 0.15 + Cocos Creator 4.x 整合 | ✅ 高 | SDK 版本相容性 | @colyseus/cocos-sdk 官方維護，已有社群案例 |
| Schema Filtering（@filter decorator 反作弊）| ✅ 高 | 實作細節需仔細驗證 | Colyseus 官方文件有 @filter 範例，Phase D 驗證 |
| 60s 重連（allowReconnection）| ✅ 高 | 無 | Colyseus 內建 API，文件完整 |
| 三公邏輯正確性（公牌邊界）| ✅ 高 | 公牌判斷邏輯 | 1000 組 Jest 隨機測試 + AC-009 全覆蓋 |
| Mobile Web 橫向（Cocos Fit Height）| ✅ 中 | Safari WebSocket 長連接限制 | 已知問題，使用 ping/keepalive workaround |
| SQLite 50 concurrent 房間 | ✅ 高 | Write contention | WAL 模式 + 僅 round_end 寫入（低頻），無問題 |
| 純函數 Game Logic 可測試性 | ✅ 高 | 無 | 設計即確保無副作用，Jest 直接測試 |
| 流局路徑（BETTING→ROUND_END）| ✅ 高 | 狀態機邊界 | VALID_TRANSITIONS 明確定義，integration test 覆蓋 |

---

## 14. Open Engineering Questions

| # | 問題 | 影響 | 截止 | 狀態 |
|---|------|------|------|------|
| EQ-1 | Colyseus 0.15 `@filter` decorator 是否支援 `ArraySchema` 內個別元素過濾，還是只能整個 ArraySchema 過濾？ | 反作弊實作複雜度 | Phase A 實作前 | 待確認（備案：onBeforePatch 手動清空 suit/rank）|
| EQ-2 | `request_new_round` 需要所有在場玩家都送，還是任意一人送即可觸發？ | UX 流暢度 | Phase B 實作前 | 建議：任意一人送即可（Host 或第一個按的人）|
| EQ-3 | 玩家暱稱（REQ-016）：MVP 用 `P1/P2...`（座位號）還是 Session 前綴？ | GameLobby UI | Phase B 實作前 | DQ-1 未決，建議 MVP 用座位號（最簡單）|
| EQ-4 | Pilot 版 SQLite 路徑：容器內掛 volume 還是本機絕對路徑？ | 部署設定 | Phase D 前 | Docker volume 較佳（資料持久化）|
