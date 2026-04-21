# PRD — 三公遊戲（Sam Gong Online）

<!-- SDLC Requirements Engineering — Layer 2：Product Requirements -->

---

## Document Control
| 欄位 | 內容 |
|------|------|
| **DOC-ID** | PRD-SAM-GONG-20260421 |
| **版本** | v1.0-draft |
| **狀態** | DRAFT |
| **來源** | BRD-SAM-GONG / STEP-03 自動生成 |
| **作者** | devsop-autodev |
| **日期** | 2026-04-21 |

---

## Change Log
| 版本 | 日期 | 變更摘要 |
|------|------|---------|
| v1.0-draft | 2026-04-21 | 初稿，由 STEP-03 自動生成 |
| v1.1-draft | 2026-04-21 | STEP-04 Round 1 審查修正：牌點語意、狀態機流局路徑、SETTLING命名統一、PQ-1解答、Schema過濾機制、US-013格式、REQ-016新增、RTM補全 |

---

## 1. Product Vision & Goals

### 1.1 Product Vision
一行宣言：讓 2-6 人隨時隨地能公平地在線玩三公（Server-Authoritative，零作弊）。

### 1.2 Goals Mapping (BRD → PRD)
| BRD 目標 | PRD 交付物 | 成功指標 |
|---------|---------|---------|
| O1: 可玩的三公線上遊戲 | 完整牌局流程（創房→押注→比牌→結算） | 每局完成率 ≥ 95% |
| O2: 穩定 Beta 用戶留存 | 斷線重連（60s）+ 流暢動畫 | 7D 留存率 ≥ 20%（Beta） |
| O3: 無作弊機制 | Server-Authoritative 架構，牌不提前下發 | 牌局異常率 < 0.1% |

---

## 2. User Stories & Acceptance Criteria

### Epic 1: 房間管理
#### US-001: 創建房間
**As** 一位玩家，
**I want to** 創建一個三公遊戲房間並獲得房間碼，
**So that** 朋友可以用房間碼加入。

**Acceptance Criteria:**
- AC-001-1: 系統生成 6 位英數房間碼（唯一）
- AC-001-2: 創建者自動成為第一位玩家（非莊家，莊家輪流決定）
- AC-001-3: 房間碼顯示在畫面上，可複製
- AC-001-4: 房間最多 6 人（1 莊 + 5 閒），超過拒絕加入

#### US-002: 加入房間
**As** 一位玩家，
**I want to** 輸入房間碼加入已有的遊戲，
**So that** 可以和朋友一起玩。

**Acceptance Criteria:**
- AC-002-1: 輸入 6 位房間碼，點擊加入
- AC-002-2: 房間不存在或已滿 → 顯示錯誤訊息
- AC-002-3: 加入後顯示等待畫面，看到已在房間的玩家

#### US-003: 開始遊戲（最少人數）
**As** 房主，
**I want to** 在 2+ 名玩家就緒時開始遊戲，
**So that** 不需等到 6 人才能開始。

**Acceptance Criteria:**
- AC-003-1: 最少 2 人（含莊家）才能開始
- AC-003-2: 房主點擊「開始」後，遊戲進入莊家選擇階段
- AC-003-3: 所有玩家收到「遊戲開始」通知

### Epic 2: 莊家制（核心機制）
#### US-004: 初始莊家選擇
**As** 玩家，
**I want to** 第一局由系統隨機指定莊家，
**So that** 公平開始。

**Acceptance Criteria:**
- AC-004-1: Server 隨機從已就緒玩家中選一位為莊（Math.random()）
- AC-004-2: 莊家角色在 UI 上有明確標示（莊家標誌）
- AC-004-3: 非莊玩家（閒）顯示「等待莊家下注」狀態

#### US-005: 莊家輪換
**As** 玩家，
**I want to** 每局結束後莊家順時針輪換，
**So that** 每個人都有機會當莊。

**Acceptance Criteria:**
- AC-005-1: 每局結算完成後，莊家自動換為下一位（按座位順序）
- AC-005-2: 新莊家收到通知
- AC-005-3: 若莊家斷線超過 60s，跳過至下一玩家

### Epic 3: 押注流程
#### US-006: 莊家設定底注
**As** 莊家，
**I want to** 設定本局的底注金額，
**So that** 確立本局賭注上下限。

**Acceptance Criteria:**
- AC-006-1: 莊家從預設選項（10/20/50/100 籌碼）選擇底注
- AC-006-2: 底注設定後廣播給所有玩家
- AC-006-3: 底注不可在本局中途修改

#### US-007: 閒家押注
**As** 閒家，
**I want to** 在發牌前決定是否跟注或棄牌，
**So that** 控制本局風險。

**Acceptance Criteria:**
- AC-007-1: 每位閒家有 30 秒決定（倒計時顯示）
- AC-007-2: 選擇「跟注（Call）」→ 扣除對應籌碼，進入等待發牌
- AC-007-3: 選擇「棄牌（Fold）」→ 本局不參與比牌，不扣籌碼
- AC-007-4: 超時自動「棄牌」
- AC-007-5: 至少 1 位閒家跟注才發牌

### Epic 4: 發牌與比牌（核心邏輯）
#### US-008: Server 洗牌發牌
**As** 系統，
**I want to** 在 Server 端安全洗牌並發牌，
**So that** 防止客戶端作弊。

**Acceptance Criteria:**
- AC-008-1: Server 使用 Fisher-Yates shuffle（Math.random 種子）
- AC-008-2: 每位跟注玩家（含莊）發 3 張牌
- AC-008-3: **只將自己的 3 張牌發送給對應玩家**，其他玩家的牌不下發
- AC-008-4: 棄牌玩家不發牌
- AC-008-5: 發牌動畫時間 ≤ 1.5 秒（Cocos 動畫）

#### US-009: 三公牌點計算
**As** 系統，
**I want to** 正確計算三公牌點（sum mod 10），
**So that** 判斷勝負。

**Acceptance Criteria:**
- AC-009-1: 牌點計算：A=1, 2-9=面值, J/Q/K=10點（三張合計取個位數後，10點貢獻0）
- AC-009-2: 三張牌點加總 mod 10 = 最終點數（0-9）
- AC-009-3: 合計為 10 的倍數（個位數=0）稱「公牌/三公」，為最強牌型；三張牌合計為10倍數者即為公牌，不存在「普通0點」的情況
- AC-009-4: 公牌（三公）> 9 > 8 > ... > 2 > 1（點數越大越優；公牌最強）
- AC-009-5: 實作要點：判斷公牌時先檢查 sum % 10 === 0，若是則為公牌（最高）；否則以 sum % 10 的值（1-9）比大小

#### US-010: 翻牌與比牌
**As** 玩家，
**I want to** 在所有玩家都翻牌後看到比牌結果，
**So that** 知道勝負。

**Acceptance Criteria:**
- AC-010-1: 倒計時結束（或所有人確認）→ Server 廣播所有人的牌
- AC-010-2: 每位閒家與莊家獨立比牌
- AC-010-3: 閒 > 莊 → 閒贏（莊賠），閒 < 莊 → 莊贏（閒賠），同點 → 莊贏（平局莊佔優）
- AC-010-4: 翻牌動畫依序播放（Cocos Tween）
- AC-010-5: 結果明確標示（WIN/LOSE/BANKER WINS）

#### US-011: 籌碼結算
**As** 玩家，
**I want to** 在比牌後籌碼自動結算，
**So that** 不需手動計算。

**Acceptance Criteria:**
- AC-011-1: 贏家籌碼增加 = 底注金額
- AC-011-2: 輸家籌碼減少 = 底注金額
- AC-011-3: 籌碼變動有動畫效果
- AC-011-4: 本局結算完成後顯示所有玩家籌碼

### Epic 5: 斷線重連
#### US-012: 60 秒重連窗口
**As** 意外斷線的玩家，
**I want to** 在 60 秒內重新連接並繼續遊戲，
**So that** 不會因網路問題輸掉籌碼。

**Acceptance Criteria:**
- AC-012-1: 玩家斷線後，Server 保留其房間位置 60 秒
- AC-012-2: 60 秒內重連 → 恢復牌局狀態（自己的牌、籌碼、進度）
- AC-012-3: 60 秒後未重連 → 自動棄牌或以最低操作繼續
- AC-012-4: 其他玩家看到斷線玩家的「離線」狀態

### Epic 6: 錯誤處理
#### US-013: 籌碼不足保護
**As** 籌碼不足的閒家，
**I want to** 在籌碼不足時收到明確提示，
**So that** 避免誤操作導致負籌碼。

**Acceptance Criteria:**
- AC-013-1: 籌碼不足以跟注 → 禁止押注，提示不足
- AC-013-2: 玩家可選擇棄牌

---

## 3. Feature Requirements (REQ-IDs)

| REQ-ID | 功能描述 | MoSCoW | 對應 US | BRD 目標 |
|--------|---------|--------|---------|---------|
| REQ-001 | 房間創建（6 位碼） | Must | US-001 | O1 |
| REQ-002 | 房間加入 | Must | US-002 | O1 |
| REQ-003 | 最少 2 人開局 | Must | US-003 | O1 |
| REQ-004 | 初始隨機莊家 | Must | US-004 | O1 |
| REQ-005 | 莊家輪換 | Must | US-005 | O1 |
| REQ-006 | 底注設定 | Must | US-006 | O1 |
| REQ-007 | 閒家押注/棄牌（30s 限時） | Must | US-007 | O1 |
| REQ-008 | Server-Authoritative 洗牌發牌 | Must | US-008 | O1+O3 |
| REQ-009 | 三公牌點計算引擎 | Must | US-009 | O1+O3 |
| REQ-010 | 翻牌 + 閒 vs 莊比牌 | Must | US-010 | O1+O3 |
| REQ-011 | 籌碼結算 | Must | US-011 | O1 |
| REQ-012 | 60s 斷線重連 | Must | US-012 | O2 |
| REQ-013 | 籌碼不足保護 | Must | US-013 | O1 |
| REQ-014 | 房間碼分享功能 | Should | - | O2 |
| REQ-015 | 遊戲歷史紀錄（本場） | Should | - | O2 |
| REQ-016 | 玩家暱稱設定 | Should | - | O2 |
| REQ-017 | 多桌（同時多個房間） | Could | - | O2 |
| REQ-018 | 帳號系統（持久籌碼） | Won't（MVP） | - | Out of scope |

---

## 4. Game Flow (State Machine)

```
LOBBY（等待）
  ↓ [最少2人就緒，房主開始]
BANKER_SELECTION（莊家選擇）
  ↓ [Server隨機/輪換指定莊]
BETTING（押注）
  莊家設定底注 → 閒家依序跟注/棄牌（30s 限時）
  ↓ [至少1閒跟注]        ↓ [所有閒家棄牌 → 流局]
DEALING（發牌）          ROUND_END（流局，莊家不贏不輸）
  Server洗牌 → 各自發3張（僅自己可見）
  ↓ [發牌完成]
REVEAL（翻牌）
  倒計時結束 → Server廣播所有牌
  ↓
SETTLING（結算）
  閒 vs 莊逐一比牌 → 籌碼結算 → 動畫
  ↓
ROUND_END（本局結束）
  顯示結果 → 莊家輪換 → 回到 BETTING（或返回 LOBBY）
```

> **非法狀態轉換（Server 必須拒絕）：** LOBBY→DEALING、LOBBY→SETTLING、BETTING→SETTLING、DEALING→BETTING、ROUND_END→SETTLING

---

## 5. Non-Functional Requirements

### 5.1 Performance
| 指標 | 目標 |
|------|------|
| 玩家操作響應延遲 | < 300ms（P95） |
| 發牌完成時間 | < 2s |
| 服務器 CPU（空閒） | < 20%（50 concurrent）|
| 服務器記憶體 | < 512MB（50 concurrent）|
| WebSocket 連接建立 | < 1s |

### 5.2 Reliability
| 指標 | 目標 |
|------|------|
| 服務可用性 | ≥ 99.5%（Pilot 版）|
| 牌局完成率 | ≥ 95% |
| 數據一致性 | 每局結算結果 100% 準確 |

### 5.3 Security
| 要求 | 說明 |
|------|------|
| 反作弊 | 其他玩家牌面不下發至客戶端（Schema filtering）|
| 速率限制 | 每個 WebSocket 連接操作 ≤ 10 次/秒 |
| 房間隔離 | 不同房間的玩家無法互相看到狀態 |
| 無真實金錢 | 僅虛擬籌碼，無支付功能 |

### 5.4 Usability
| 要求 | 說明 |
|------|------|
| 平台 | Web（PC + Mobile Web），Chrome / Safari / Firefox |
| 遊戲說明 | 首次遊玩顯示三公規則說明 |
| 倒計時顯示 | 押注、翻牌等有時限操作必須有可見倒計時 |

---

## 6. Colyseus State Schema Design

```typescript
// server/src/schema/SamGongState.ts

import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Card extends Schema {
  @type("string") suit: string = "";    // "spades" | "hearts" | "diamonds" | "clubs"
  @type("string") rank: string = "";    // "A" | "2"-"9" | "J" | "Q" | "K"
  @type("boolean") revealed: boolean = false;
}

export class PlayerState extends Schema {
  @type("string") sessionId: string = "";
  @type("string") status: string = "waiting"; // waiting | betting | folded | ready | disconnected
  @type("number") chips: number = 1000;
  @type("boolean") isBanker: boolean = false;
  @type("boolean") hasBet: boolean = false;
  // SECURITY: cards are filtered per-player via Colyseus onBeforePatch override or custom toJSON.
  // Before REVEAL phase: only the owning player receives suit/rank data.
  // Other players receive Card objects with suit="" and rank="" (blanked), only revealed:boolean is visible.
  // After REVEAL phase: Server sets revealed=true and broadcasts full card data to all players.
  @type([Card]) cards = new ArraySchema<Card>();
}

export class SamGongState extends Schema {
  @type("string") roomPhase: string = "lobby";
  // "lobby" | "banker_selection" | "betting" | "dealing" | "reveal" | "settling" | "round_end"
  @type("number") betAmount: number = 0;
  @type("string") currentBankerId: string = "";
  @type("number") roundNumber: number = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("number") countdownSeconds: number = 0;
}
```

---

## 7. API Requirements (High-Level)

### Colyseus Room Messages (Client → Server)

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `set_bet_amount` | `{ amount: number }` | 莊家設定底注 |
| `player_action` | `{ action: "call" \| "fold" }` | 閒家跟注/棄牌 |
| `ready_for_reveal` | `{}` | 玩家準備翻牌 |
| `request_new_round` | `{}` | 請求開始下一局 |

### Colyseus Room Events (Server → Client)

| Event | Payload | Description |
|-------|---------|-------------|
| State sync | `SamGongState` diff | 自動差分同步（@colyseus/schema）|
| `error` | `{ code, message }` | 錯誤通知 |
| `game_result` | `{ results: PlayerResult[] }` | 本局結果 |

---

## 8. Data Model

### Room (In-Memory, Colyseus)
- roomId, roomCode (6-char), phase, betAmount, playerIds[], bankerQueue[]

### Player (In-Memory + SQLite audit)
- sessionId, chips, cards (filtered), status

### GameRecord (SQLite)
- id, roomId, roundNumber, timestamp, bankerSessionId, results (JSON), chipsChange (JSON)

---

## 9. Out of Scope (MVP)

| 功能 | 原因 | 計畫版本 |
|------|------|---------|
| 帳號/登入系統 | 增加複雜度，MVP 用 sessionId | v2.0 |
| 持久化籌碼 | 需要帳號系統 | v2.0 |
| 觀戰模式 | 非核心 MVP | v1.5 |
| 真實金錢 | 法規限制（ROC §266） | 永不 |
| Native App | 非 MVP 平台 | v2.0 |
| 多語言 | 僅繁中 MVP | v1.5 |
| 玩家頭像 | 依賴帳號系統 | v2.0 |

---

## 10. Requirements Traceability Matrix

| REQ-ID | BRD 目標 | User Story | 測試 BDD | 狀態 |
|--------|---------|---------|---------|------|
| REQ-001 | O1 | US-001 | S-001 | 待實作 |
| REQ-002 | O1 | US-002 | S-002 | 待實作 |
| REQ-003 | O1 | US-003 | S-003 | 待實作 |
| REQ-004 | O1 | US-004 | S-004 | 待實作 |
| REQ-005 | O1 | US-005 | S-005 | 待實作 |
| REQ-006 | O1 | US-006 | S-006 | 待實作 |
| REQ-007 | O1 | US-007 | S-007 | 待實作 |
| REQ-008 | O1+O3 | US-008 | S-008 | 待實作 |
| REQ-009 | O1+O3 | US-009 | S-009 | 待實作 |
| REQ-010 | O1+O3 | US-010 | S-010 | 待實作 |
| REQ-011 | O1 | US-011 | S-011 | 待實作 |
| REQ-012 | O2 | US-012 | S-012 | 待實作 |
| REQ-013 | O1 | US-013 | S-013 | 待實作 |
| REQ-014 | O2 | - | 待定義（Should） | 待實作 |
| REQ-015 | O2 | - | 待定義（Should） | 待實作 |
| REQ-016 | O2 | - | 待定義（Should） | 待實作 |

---

## 11. Open Questions (PRD Level)

| # | 問題 | 影響 | 截止 | 狀態 |
|---|------|------|------|------|
| PQ-1 | 「公牌」點=0 勝所有點數，還是只勝點9？ | 三公規則變體，影響比牌邏輯 | EDD前確認 | **RESOLVED**：公牌勝所有1-9點，依 AC-009-4 實作（公牌 > 9 > 8 > ... > 1）|
| PQ-2 | 同點（非公牌）平局規則？莊贏 or 退注？ | 結算邏輯 | EDD前確認 | OPEN |
| PQ-3 | 斷線超 60s 的玩家籌碼如何處理？ | 重連邏輯 | 實作前 | OPEN |

---

## 12. Acceptance Definition (Done)

整個 PRD 達成 "Done" 的條件：

- [ ] 所有 REQ-001 ~ REQ-013（Must Have）均有對應測試通過
- [ ] 三公比牌引擎：1000 組隨機測試案例 100% 正確
- [ ] 斷線重連：模擬測試 10 次，10/10 在 60s 內恢復
- [ ] 無真實金錢交易
- [ ] Server 拒絕非法狀態轉換（Lobby→Settle 直跳等）
