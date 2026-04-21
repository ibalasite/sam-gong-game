# PDD — 三公遊戲 Client 設計文件（Cocos Creator 4.x）

<!-- SDLC Design — Layer 3：Product Design Document -->

---

## Document Control

| 欄位 | 內容 |
|------|------|
| **DOC-ID** | PDD-SAM-GONG-20260421 |
| **版本** | v1.0-draft |
| **狀態** | DRAFT |
| **來源** | PRD-SAM-GONG-20260421 / STEP-05 自動生成 |
| **作者** | devsop-autodev |
| **日期** | 2026-04-21 |
| **對應 PRD** | PRD-SAM-GONG-20260421 v1.3-draft |

---

## 1. Design Philosophy & Visual Direction

### 1.1 Visual Style

- **風格**: 現代化東方牌桌風格（深綠桌面 + 金色邊框 + 紅黑牌色）
- **主色調**:
  - 桌面深綠：`#1B5E20`
  - 金色（邊框/強調/莊家）：`#FFD700`
  - 牌背深紅：`#8B0000`
  - 牌面白色：`#FAFAFA`
  - HUD 背景：`rgba(0, 0, 0, 0.65)`（半透明深色條）
  - 危險/警示紅：`#E53935`
  - 文字主色：`#FFFFFF`（深色背景上）/ `#212121`（牌面上）
- **字體**: 系統字體（Cocos 內建 Label），標題加粗 Bold，數字等寬
- **動畫風格**: 流暢但不浮誇，`Tween easeOut` 為主，發牌/翻牌/籌碼動畫強調物理感

### 1.2 Design Principles

1. **清晰**: 玩家隨時知道自己的狀態（輪到誰、倒計時、自己的牌點）
2. **公平感**: 視覺上的 Server-Authoritative 感（發牌從桌面中央飛出）
3. **即時反饋**: 每個操作立即有動畫與狀態文字回應
4. **安全性視覺化**: 其他玩家的牌在翻牌前永遠顯示牌背，不洩漏任何信息
5. **簡潔操作**: 押注操作區域按鈕大且對比清晰，適合 Mobile Web 手指觸控

### 1.3 Design Anti-patterns（刻意避免）

- 純灰白 UI（缺乏牌桌氛圍）
- 所有按鈕統一大小（缺乏視覺層次）
- 沒有明確的莊家/閒家視覺區分
- 翻牌前顯示其他玩家牌面（安全漏洞）

---

## 2. Scenes List（Cocos Creator Scenes）

| 場景 | 檔案名 | 說明 | 對應 US |
|------|--------|------|---------|
| 主選單 | `MainMenu.scene` | 創建/加入房間 | US-001, US-002 |
| 遊戲大廳 | `GameLobby.scene` | 等待玩家就緒、顯示房間碼 | US-003 |
| 遊戲主場景 | `GamePlay.scene` | 主要遊戲畫面（含結算 Overlay） | US-004 ~ US-013 |
| 規則說明 | 內嵌 Popup（RulesPanel.prefab） | 三公規則說明（首次遊玩彈出） | REQ-014 |

> **設計決定**: Settlement（結算）不單獨開一個 Scene，改用 GamePlay 內的 SettlementOverlay Prefab，避免 Scene 切換延遲打斷遊戲節奏。

---

## 3. Screen Designs

### 3.1 主選單畫面（MainMenu.scene）

**螢幕尺寸**: 1334 × 750（橫向）

**佈局:**

```
┌────────────────────────────────────────────┐
│                                            │
│           三  公  遊  戲                   │  ← 標題（金色大字，陰影效果）
│        Sam Gong Online                     │  ← 副標（白色小字）
│                                            │
│    ┌──────────────────────────────────┐    │
│    │        創建房間 Create Room       │    │  ← 主 CTA（金色底，黑字）
│    └──────────────────────────────────┘    │
│                                            │
│    ──────────── 或 ────────────            │  ← 分隔線
│                                            │
│    ┌──────────────────────┐  ┌────────┐   │
│    │  輸入房間碼  [      ] │  │ 加入   │   │  ← EditBox + 加入按鈕
│    └──────────────────────┘  └────────┘   │
│                                            │
│    [? 遊戲說明]              [⚙ 設定]      │  ← 底部工具列（小圖示+文字）
└────────────────────────────────────────────┘
```

**元件清單:**

| 元件 | 類型 | 說明 |
|------|------|------|
| `titleLabel` | Label | 「三公遊戲」金色大字 |
| `createRoomBtn` | Button | 主要 CTA，金色背景 |
| `roomCodeInput` | EditBox | 6 位數字/英文輸入 |
| `joinRoomBtn` | Button | 次要按鈕，白色邊框 |
| `rulesBtn` | Button | 開啟規則說明 Popup |
| `settingsBtn` | Button | 設定（音效等，MVP 可先 stub） |
| `errorToast` | Node | 錯誤提示 Toast（預設隱藏） |

**Cocos Prefab**: `MainMenuPanel.prefab`
**Script**: `MainMenuController.ts`

```typescript
// MainMenuController.ts（方法簽名）
export class MainMenuController extends Component {
  onCreateRoom(): Promise<void>;        // 呼叫 GameManager.createRoom()
  onJoinRoom(): Promise<void>;          // 讀取 roomCodeInput → GameManager.joinRoom(code)
  onOpenRules(): void;                  // 顯示 RulesPanel
  onOpenSettings(): void;               // 顯示設定 Panel（MVP stub）
  private showError(msg: string): void; // 顯示 errorToast
}
```

**錯誤狀態:**

- 房間碼為空 → joinRoomBtn disabled，提示「請輸入房間碼」
- 房間不存在 → Toast「找不到房間，請確認房間碼」（AC-002-2）
- 房間已滿 → Toast「房間已滿（最多 6 人）」（AC-001-4）

---

### 3.2 遊戲大廳（GameLobby.scene）

**佈局:**

```
┌────────────────────────────────────────────┐
│  ← 返回    遊戲大廳 Lobby                  │  ← 頂部列
├────────────────────────────────────────────┤
│                                            │
│  房間碼：ABC123              [複製 📋]     │  ← 房間碼顯示（大字，可點複製）
│                                            │
│  玩家列表（1-6 格，動態顯示）               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 🟢 P1   │ │ 🟢 P2   │ │ 空位     │  │  ← 已加入玩家（綠點=在線）
│  │  (你)   │ │  玩家2  │ │  ——      │  │
│  └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 空位     │ │ 空位     │ │ 空位     │  │
│  └──────────┘ └──────────┘ └──────────┘  │
│                                            │
│  等待更多玩家加入... 或                     │  ← 狀態文字（房主看到開始按鈕）
│        ┌──────────────────────────┐       │
│        │ 開始遊戲 Start Game      │       │  ← 僅房主顯示；< 2 人時 disabled
│        └──────────────────────────┘       │
└────────────────────────────────────────────┘
```

**元件清單:**

| 元件 | 類型 | 說明 |
|------|------|------|
| `roomCodeLabel` | Label | 顯示 6 位房間碼 |
| `copyCodeBtn` | Button | 複製房間碼到剪貼板 |
| `playerSlotList` | Node（6 子節點） | 玩家格（PlayerSlotComponent） |
| `startGameBtn` | Button | 僅房主可見；min 2 人才 enable |
| `statusLabel` | Label | 「等待玩家...」/ 「2 位玩家已就緒」 |
| `backBtn` | Button | 離開房間返回主選單 |

**Script**: `GameLobbyController.ts`

```typescript
export class GameLobbyController extends Component {
  onStartGame(): void;                          // 房主送 start_game 訊息
  onCopyRoomCode(): void;                       // navigator.clipboard.writeText(roomCode)
  onLeaveRoom(): void;                          // 離開房間，回到 MainMenu
  private updatePlayerSlots(players: MapSchema<PlayerState>): void;
  private updateStartButton(playerCount: number): void; // < 2 → disabled
}
```

**狀態監聽:**
- `room.state.players` onChange → 更新玩家格
- `room.state.roomPhase` 變為 `banker_selection` → 切換至 GamePlay.scene

---

### 3.3 遊戲主場景（GamePlay.scene）

**Canvas 方向**: 橫向（Landscape）1334 × 750

**佈局全覽:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  [房間: ABC123]          倒計時: 00:30 ██████░░░░          [1000 ●] │  ← 頂部 HUD（半透明黑條）
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│              P3 [頭像] 玩家3  籌碼:800                              │
│              [牌背][牌背][牌背]   狀態: 跟注                        │  ← 上方玩家區
│                                                                     │
│  P2 [頭像] 玩家2                            P4 [頭像] 玩家4        │
│  [牌背][牌背][牌背] 籌碼:600                籌碼:750 [牌背][牌背][牌背]  │  ← 左右玩家區
│                                                                     │
│              ┌─────── 桌面中央 ───────┐                             │
│              │   底注: 50 ●          │                             │
│              │   莊家: 玩家1 👑       │                             │  ← 桌面資訊區
│              │   第 3 局             │                             │
│              └───────────────────────┘                             │
│                                                                     │
│  P5 [頭像] 玩家5                            P1 👑 [頭像] 玩家1(莊) │
│  [牌背][牌背][牌背] 籌碼:900                籌碼:1200 [牌背][牌背][牌背] │  ← 左右玩家區（含莊）
│                                                                     │
│              P6(你) [頭像]  籌碼: 1000                              │
│              [♠A]  [♥7]  [♣3]   點數: 1                          │  ← 本玩家（自己的牌可見）
├─────────────────────────────────────────────────────────────────────┤
│  [跟注 Call 50 ●]   [棄牌 Fold]      phase: 押注中，等待你決定      │  ← 底部操作區
└─────────────────────────────────────────────────────────────────────┘
```

**頂部 HUD 元件（`HUDPanel.prefab`）:**

| 元件 | 說明 |
|------|------|
| `roomCodeLabel` | 房間碼顯示 |
| `countdownTimer` | `CountdownComponent`：數字 + 進度條 |
| `myChipsLabel` | 自己當前籌碼（金色數字） |

**桌面中央元件（`TableCenterPanel.prefab`）:**

| 元件 | 說明 |
|------|------|
| `betAmountLabel` | 底注金額 |
| `bankerNameLabel` | 當前莊家名稱 |
| `roundNumberLabel` | 第 N 局 |
| `phaseStatusLabel` | 當前遊戲階段文字 |

**底部操作區元件（`BettingPanel.prefab`）:**

| 元件 | 說明 |
|------|------|
| `callBtn` | 跟注按鈕（顯示底注金額）；籌碼不足時 disabled |
| `foldBtn` | 棄牌按鈕 |
| `actionStatusLabel` | 「等待其他玩家」/ 「輪到你決定」 |
| `insufficientChipsLabel` | 籌碼不足提示（AC-013-1） |

**Scripts:**

- `GamePlayController.ts`: 主控制器，監聽 Colyseus state，分發 UI 更新
- `CardComponent.ts`: 單張牌的顯示邏輯（正面/背面/翻牌動畫）
- `PlayerSlotComponent.ts`: 玩家位置組件（頭像/名稱/籌碼/狀態/莊家標誌）
- `BettingPanelComponent.ts`: 押注操作 Panel（跟注/棄牌/禁用邏輯）
- `CountdownComponent.ts`: 倒計時顯示（數字 + 進度條 + 最後 5s 紅色閃爍）
- `TableCenterComponent.ts`: 桌面中央資訊區

---

### 3.4 玩家座位佈局（PlayerSlotComponent）

**PlayerSlot 顯示內容:**

```
┌──────────────────────┐
│  [頭像/頭字母]  👑    │  ← 頭像區（有莊家時顯示金冠）
│  玩家名稱            │  ← 名稱 Label
│  籌碼: 1000 ●        │  ← 籌碼數（金色）
│  [牌背][牌背][牌背]   │  ← 3 張 CardComponent
│  ● 跟注              │  ← 狀態 Badge（顏色依狀態）
└──────────────────────┘
```

**玩家狀態 Badge 顏色:**

| status | 顯示文字 | 顏色 |
|--------|----------|------|
| `waiting` | 等待中 | 灰色 |
| `deciding` | 決策中 | 黃色（倒計時配合） |
| `called` | 跟注 ✓ | 綠色 |
| `folded` | 棄牌 | 暗紅，半透明 |
| `disconnected` | 離線 ⚠ | 深灰，閃爍圖示 |

**莊家標示:**
- PlayerSlot 右上角顯示金色皇冠 Sprite（`icon_banker_crown.png`）
- 莊家 Slot 邊框顏色：金色 `#FFD700`（vs 普通玩家白色 `#FFFFFF`）

**座位佈局規則（依人數動態調整）:**

| 人數 | 佈局方式 |
|------|----------|
| 2 人 | 上方1 + 下方1（自己） |
| 3 人 | 上方1 + 左1 + 下方1（自己） |
| 4 人 | 上方1 + 左1 + 右1 + 下方1（自己） |
| 5 人 | 上方1 + 左2 + 右1 + 下方1（自己） |
| 6 人 | 上方1 + 左2 + 右2 + 下方1（自己） |

---

### 3.5 翻牌動畫設計（REVEAL Phase）

**翻牌序列流程:**

```
1. Server 廣播 state：所有玩家 cards.revealed = true，suit/rank 數據下發
2. Client 收到 onStateChange → GamePlayController 觸發 RevealSequence
3. 依玩家座位順序，依序為每位玩家播放翻牌動畫
4. 每張牌播放 flipCard() Tween（0.6s/張）
5. 翻牌完成 → 顯示每位玩家點數 Label
6. 所有牌翻完 → 進入比牌結果高亮
   - WIN（閒贏）：金色光暈 + Scale pulse
   - LOSE（莊贏）：灰色半透明 overlay
   - BANKER WINS（平局莊佔優）：莊家皇冠閃爍
7. 籌碼流動動畫（贏家籌碼數字 lerp++, 輸家籌碼數字 lerp--）
```

**CardComponent 翻牌 Tween 實作:**

```typescript
// CardComponent.ts
import { Component, Node, Vec3, tween } from 'cc';

export class CardComponent extends Component {
  async flipCard(cardData: { suit: string; rank: string }) {
    // 1. 旋轉至 90 度（牌面消失）
    await new Promise<void>(resolve => {
      tween(this.node)
        .to(0.3, { eulerAngles: new Vec3(0, 90, 0) }, { easing: 'quadIn' })
        .call(() => {
          this.showCardFace(cardData); // 切換為正面 Sprite
          resolve();
        })
        .start();
    });
    // 2. 從 90 度轉回 0 度（顯示牌面）
    await new Promise<void>(resolve => {
      tween(this.node)
        .to(0.3, { eulerAngles: new Vec3(0, 0, 0) }, { easing: 'quadOut' })
        .call(() => resolve())
        .start();
    });
  }

  showCardBack() { /* 切換至牌背 Sprite */ }
  showCardFace(cardData: { suit: string; rank: string }) { /* 切換至對應牌面 Sprite */ }
}
```

---

### 3.6 發牌動畫設計（DEALING Phase）

**發牌序列:**

1. Server 設定 roomPhase = `dealing`，Client 觸發 DealAnimation
2. 從桌面中央虛擬「牌堆」位置（桌面中心點）依序為每位跟注玩家飛出 3 張牌
3. 每張牌：`tween position from center → player slot`（easeOut，0.4s/張）
4. 自己的牌飛到位後直接翻面顯示（接收到的是明牌）；其他玩家的牌保持牌背
5. 全部發牌完成 → roomPhase 轉入 `reveal`

**Tween 示意:**

```typescript
// 發牌動畫（GamePlayController.ts）
async dealCardToPlayer(cardNode: Node, targetPos: Vec3) {
  cardNode.setPosition(tableCenterPos);  // 從中央出發
  await new Promise<void>(resolve => {
    tween(cardNode)
      .to(0.4, { position: targetPos }, { easing: 'quadOut' })
      .call(() => resolve())
      .start();
  });
}
```

---

### 3.7 結算 Overlay（SettlementOverlay）

**觸發時機**: roomPhase = `settling` → `round_end`

**佈局（疊加在 GamePlay 場景上）:**

```
┌──── 結算 ─────────────────────────────────┐
│   本局底注：50 ●                           │
│                                           │
│  玩家名稱    牌面         點數  結果  變動  │
│  ─────────────────────────────────────── │
│  玩家1(莊)  [♠A][♥7][♣3]  1    🏆莊  +50 │
│  玩家2(閒)  [♦9][♣2][♥Q]  1    LOSE  -50 │
│  玩家3(閒)  [♣K][♠5][♥J]  5    WIN  +50  │
│  玩家6(你)  [♥2][♦6][♣8]  6    WIN  +50  │
│                                           │
│       [繼續下一局]  [離開房間]             │
└───────────────────────────────────────────┘
```

**元件**: `SettlementOverlay.prefab`
**Script**: `SettlementController.ts`

---

### 3.8 規則說明 Popup（RulesPanel）

**觸發時機**: 
- 點擊 [? 遊戲說明] 按鈕
- 首次遊玩自動彈出（localStorage 記錄）

**內容:**

```
┌──── 三公玩法說明 ────────────────────────────┐
│                                             │
│ 1. 每位玩家（含莊家）發 3 張牌               │
│ 2. 三張牌點加總取個位數                      │
│    A=1, 2-9=面值, J/Q/K=10（計為0）         │
│ 3. 合計為 10 的倍數 = 「公牌（三公）」        │
│    公牌最強，勝所有點數                      │
│ 4. 其餘以點數比大小（9 > 8 > ... > 1）       │
│ 5. 各閒家與莊家獨立比牌                      │
│ 6. 平局：莊家勝                             │
│                                             │
│  牌點範例：♠A + ♥7 + ♣3 = 1+7+3 = 11 → 1點 │
│           ♣5 + ♥5 + ♦K = 5+5+10 = 20 → 公牌│
│                                             │
│                      [知道了]               │
└─────────────────────────────────────────────┘
```

---

## 4. Colyseus 連線架構（Client 側）

### 4.1 GameManager（Singleton）

```typescript
// scripts/managers/GameManager.ts
import * as Colyseus from 'colyseus.js';
import { SamGongState } from '../schema/SamGongState';

export class GameManager {
  private static _instance: GameManager;
  private client: Colyseus.Client;
  private _room: Colyseus.Room<SamGongState> | null = null;

  static get instance(): GameManager {
    return this._instance ||= new GameManager();
  }

  async connect(serverUrl: string): Promise<void> {
    this.client = new Colyseus.Client(serverUrl);
  }

  async createRoom(): Promise<void> {
    this._room = await this.client.create<SamGongState>("sam_gong");
    this.setupListeners();
  }

  async joinRoom(roomCode: string): Promise<void> {
    this._room = await this.client.joinById<SamGongState>(roomCode);
    this.setupListeners();
  }

  private setupListeners(): void {
    if (!this._room) return;
    this._room.onStateChange((state) => {
      GameEventEmitter.emit('stateChange', state);
    });
    this._room.onError((code, msg) => {
      console.error('[GameManager] Room error:', code, msg);
      GameEventEmitter.emit('roomError', { code, msg });
    });
    this._room.onLeave((code) => {
      GameEventEmitter.emit('roomLeave', { code });
    });
    this._room.onMessage('game_result', (data) => {
      GameEventEmitter.emit('gameResult', data);
    });
  }

  sendMessage(type: string, data?: unknown): void {
    this._room?.send(type, data);
  }

  get room(): Colyseus.Room<SamGongState> | null {
    return this._room;
  }

  async leaveRoom(): Promise<void> {
    await this._room?.leave();
    this._room = null;
  }
}
```

### 4.2 GameEventEmitter

```typescript
// scripts/managers/GameEventEmitter.ts
// 簡易 EventEmitter，供各 Controller 訂閱 state 變化
export const GameEventEmitter = {
  _handlers: new Map<string, Function[]>(),
  on(event: string, handler: Function): void { /* ... */ },
  off(event: string, handler: Function): void { /* ... */ },
  emit(event: string, data?: unknown): void { /* ... */ },
};
```

### 4.3 客戶端訊息送出（Client → Server）

| 送出時機 | 呼叫方式 |
|---------|---------|
| 房主開始遊戲 | `GameManager.instance.sendMessage('start_game')` |
| 莊家設定底注 | `GameManager.instance.sendMessage('set_bet_amount', { amount: 50 })` |
| 閒家跟注 | `GameManager.instance.sendMessage('player_action', { action: 'call' })` |
| 閒家棄牌 | `GameManager.instance.sendMessage('player_action', { action: 'fold' })` |
| 準備翻牌 | `GameManager.instance.sendMessage('ready_for_reveal')` |
| 請求下一局 | `GameManager.instance.sendMessage('request_new_round')` |

---

## 5. Animation & Sound Design

### 5.1 動畫清單

| 動畫名稱 | 觸發時機 | 時長 | Tween 效果 |
|---------|---------|------|-----------|
| 發牌動畫 | `DEALING` phase | 1.5s（6人×3張並行） | 從中央飛出，quadOut |
| 翻牌動畫 | `REVEAL` phase | 0.6s/張（序列播放） | rotateY 0→90→0，quadIn+quadOut |
| 勝利光暈 | 結算贏家 | 1.0s | Scale 1→1.1→1 pulse + glow Sprite |
| 敗北遮罩 | 結算輸家 | 0.5s | Alpha 0→0.4（灰色遮罩） |
| 籌碼流動數字 | 結算 | 1.0s | 數字 lerp（整數每幀+/-） |
| 倒計時閃爍 | 剩餘 ≤ 5s | 0.5s/flash | Label 顏色紅色 blink |
| 莊家皇冠落下 | 莊家輪換 | 0.5s | 從上方 Y+50 落下 bounce easeOut |
| 斷線 Overlay 淡入 | 玩家斷線 | 0.3s | Alpha 0→0.85 |
| Toast 淡入/淡出 | 錯誤/提示 | 0.3s in + 1.5s wait + 0.3s out | Alpha tween |

### 5.2 音效設計（MVP Optional）

| 音效 | 觸發時機 | 檔案 |
|------|---------|------|
| 發牌音效 | 每張牌飛出 | `sfx_deal.mp3` |
| 翻牌音效 | 翻牌動畫完成 | `sfx_flip.mp3` |
| 勝利音效 | WIN 結算 | `sfx_win.mp3` |
| 失敗音效 | LOSE 結算 | `sfx_lose.mp3` |
| 倒計時嘀嗒 | 最後 5s，每秒一次 | `sfx_tick.mp3` |
| 按鈕點擊 | 所有按鈕 onPointerDown | `sfx_click.mp3` |

> MVP 可先不實作音效，`AudioManager.ts` 建好接口即可（play 方法 stub）。

---

## 6. Responsive Design（Mobile Web）

### 6.1 Canvas 設定

| 設定項 | 值 |
|--------|-----|
| 設計尺寸 | 1334 × 750（橫向） |
| Fit Mode | `Fit Height`（Cocos Canvas Component） |
| 最小支援寬度 | 667px（iPhone SE 橫向） |
| 最小支援高度 | 375px |

### 6.2 Safe Area 處理

- 底部操作區（BettingPanel）加入 `env(safe-area-inset-bottom)` 等效的 Cocos padding
- 使用 `sys.getSafeAreaEdge()` 動態調整底部 padding（避免 iPhone Home Bar 遮蓋）

### 6.3 Touch 互動

- 所有按鈕 hit area 最小 44×44 pt（iOS HIG 建議）
- 跟注/棄牌按鈕放大至 100×60 dp（底部操作區主要按鈕）

### 6.4 玩家人數佈局自適應

- `PlayerLayoutManager.ts` 依 `players.size` 動態計算各 PlayerSlot 的 position
- 不同人數使用不同佈局預設（2/3/4/5/6 人各一組 position 常數）

---

## 7. Accessibility

| 需求 | 實作方式 |
|------|---------|
| 牌面文字+圖示雙重表達 | 每張牌同時顯示花色文字（♠/♥/♦/♣）+ 數字/字母（A/2-9/J/Q/K） |
| WIN/LOSE 多重表達 | 除顏色外同時有文字標籤（WIN / LOSE / 平局）和圖示 |
| 倒計時多重表達 | 數字 + 進度條（雙重） |
| 色盲友善 | 勝負不僅靠紅綠，WIN 用金色+✓，LOSE 用灰色+✗ |

---

## 8. Error State UI

| 錯誤狀態 | 觸發條件 | UI 表現 |
|---------|---------|---------|
| 房間不存在 | joinRoom 失敗 | Toast「找不到房間，請確認房間碼」3s |
| 房間已滿 | joinRoom 失敗（已達 6 人） | Toast「房間已滿（最多 6 人）」3s |
| 籌碼不足 | `chips < betAmount` | `callBtn` disabled + `insufficientChipsLabel` 顯示（AC-013-1） |
| 玩家斷線（他人） | `player.status = 'disconnected'` | PlayerSlot 顯示「離線 ⚠」+ 頭像灰色 |
| 自己斷線 | `room.onLeave` 觸發 | 全螢幕半透明遮罩 + 「重新連線中... 00:60」倒計時 |
| 60s 後仍斷線 | 重連逾時 | Toast「已離開房間」→ 自動返回 MainMenu |
| WebSocket 錯誤 | `room.onError` | Toast 顯示錯誤代碼 + 建議動作 |
| 操作超時（30s） | 押注倒計時歸零 | 自動棄牌（AC-007-4），提示「操作超時，已自動棄牌」|

**重連流程 UI:**

```
1. 偵測斷線 → 顯示全螢幕 ReconnectOverlay（半透明黑色底）
2. 顯示「重新連線中...」+ 60 秒倒計時
3. 背景自動嘗試 reconnect（GameManager.reconnect()，每 5s 一次）
4a. 重連成功 → 隱藏 Overlay，恢復正常遊戲畫面（AC-012-2）
4b. 60s 超時 → 顯示「連線失敗」+ [返回主選單] 按鈕（AC-012-3）
```

---

## 9. Prefab Structure

```
assets/
├── prefabs/
│   ├── ui/
│   │   ├── MainMenuPanel.prefab         ← 主選單
│   │   ├── GameLobbyPanel.prefab        ← 遊戲大廳
│   │   ├── GamePlayPanel.prefab         ← 遊戲主場景（含 HUD）
│   │   ├── HUDPanel.prefab              ← 頂部 HUD（房間碼/倒計時/籌碼）
│   │   ├── BettingPanel.prefab          ← 底部押注操作區
│   │   ├── TableCenterPanel.prefab      ← 桌面中央資訊
│   │   ├── SettlementOverlay.prefab     ← 結算 Overlay（疊加在 GamePlay 上）
│   │   ├── ReconnectOverlay.prefab      ← 斷線重連 Overlay
│   │   ├── RulesPanel.prefab            ← 規則說明 Popup
│   │   └── ToastMessage.prefab          ← 通用 Toast 提示
│   ├── game/
│   │   ├── CardComponent.prefab         ← 單張牌（正面/背面切換）
│   │   ├── PlayerSlot.prefab            ← 玩家格（頭像/籌碼/牌/狀態）
│   │   └── ChipCounter.prefab           ← 籌碼數字動畫元件
│   └── common/
│       ├── CountdownTimer.prefab        ← 倒計時（數字+進度條）
│       └── BankerCrown.prefab           ← 莊家皇冠圖示（動畫版）
├── scripts/
│   ├── managers/
│   │   ├── GameManager.ts              ← Colyseus 連線 Singleton
│   │   ├── GameEventEmitter.ts         ← 事件總線
│   │   ├── AudioManager.ts             ← 音效管理（MVP stub）
│   │   └── PlayerLayoutManager.ts      ← 玩家座位動態佈局
│   ├── ui/
│   │   ├── MainMenuController.ts       ← 主選單邏輯
│   │   ├── GameLobbyController.ts      ← 大廳邏輯
│   │   ├── GamePlayController.ts       ← 遊戲主場景邏輯（最複雜）
│   │   └── SettlementController.ts     ← 結算顯示邏輯
│   ├── components/
│   │   ├── CardComponent.ts            ← 單張牌顯示邏輯
│   │   ├── PlayerSlotComponent.ts      ← 玩家格組件
│   │   ├── CountdownComponent.ts       ← 倒計時組件
│   │   ├── BettingPanelComponent.ts    ← 押注面板組件
│   │   └── ChipCounterComponent.ts     ← 籌碼數字 lerp 動畫
│   └── schema/
│       └── SamGongState.ts             ← Colyseus Schema（與 Server 共用或同步）
├── resources/
│   ├── sprites/
│   │   ├── cards/                      ← 52 張牌面 Sprite（命名：card_A_spades.png 等）
│   │   ├── card_back.png               ← 牌背（深紅 #8B0000）
│   │   ├── icon_banker_crown.png       ← 莊家皇冠圖示
│   │   ├── icon_chip.png               ← 籌碼圖示
│   │   └── table_bg.png                ← 桌面背景（深綠紋理）
│   └── audio/
│       ├── sfx_deal.mp3
│       ├── sfx_flip.mp3
│       ├── sfx_win.mp3
│       ├── sfx_lose.mp3
│       ├── sfx_tick.mp3
│       └── sfx_click.mp3
└── scenes/
    ├── MainMenu.scene
    ├── GameLobby.scene
    └── GamePlay.scene
```

---

## 10. State → UI 對應表（roomPhase）

| roomPhase | GamePlayController 行為 | 操作區狀態 |
|-----------|------------------------|-----------|
| `lobby` | 顯示 GameLobby 場景 | N/A |
| `banker_selection` | 切換至 GamePlay，顯示「選擇莊家中...」 | 所有按鈕 disabled |
| `betting` | 顯示底注，BettingPanel 顯示 | 莊家：顯示底注選項；閒家：顯示跟注/棄牌 |
| `dealing` | 播放發牌動畫 | 所有按鈕 disabled |
| `reveal` | 播放翻牌動畫序列 | 所有按鈕 disabled |
| `settling` | 顯示比牌結果高亮，籌碼動畫 | 所有按鈕 disabled |
| `round_end` | 顯示 SettlementOverlay | [繼續] / [離開房間] |

---

## 11. REQ → UI Element 對應（需求追溯）

| REQ-ID | 對應 UI 元件 |
|--------|-------------|
| REQ-001 | GameLobby `roomCodeLabel` + `copyCodeBtn` |
| REQ-002 | MainMenu `roomCodeInput` + `joinRoomBtn` + Toast |
| REQ-003 | GameLobby `startGameBtn`（< 2 人 disabled） |
| REQ-004 | GamePlay 莊家皇冠 + `PlayerSlotComponent.isBanker` |
| REQ-005 | SettlementOverlay 結束後莊家皇冠切換動畫 |
| REQ-006 | BettingPanel 底注選項（莊家視圖） |
| REQ-007 | BettingPanel `callBtn` / `foldBtn` + `CountdownComponent` |
| REQ-008 | `CardComponent` 牌背顯示（DEALING phase 隱藏他人牌） |
| REQ-009 | PlayerSlot 點數 Label（自己） + SettlementOverlay 點數欄 |
| REQ-010 | `CardComponent.flipCard()` + 勝負結果高亮 |
| REQ-011 | `ChipCounterComponent` 籌碼 lerp 動畫 |
| REQ-012 | `ReconnectOverlay` 60s 倒計時 |
| REQ-013 | BettingPanel `callBtn` disabled + `insufficientChipsLabel` |

---

## 12. Open Design Questions

| # | 問題 | 影響 | 截止 | 狀態 |
|---|------|------|------|------|
| DQ-1 | 玩家暱稱：MVP 用 sessionId 前綴（P1/P2...）還是要求輸入？ | 玩家識別 UX，對應 REQ-016 | EDD 前確認 | 待定 |
| DQ-2 | 莊家設定底注用「4 格固定選項」還是「自由輸入」？ | BettingPanel 設計 | 實作前 | 待定（PRD AC-006-1 指定4選項，設計遵循）|
| DQ-3 | 籌碼初始值（1000）是否顯示在主選單（讓玩家知道）？ | 首次遊戲期望管理 | 低優先 | 待定 |
| DQ-4 | 結算後是否顯示「本場歷史局記錄」入口（REQ-015）？ | UX 複雜度 | MVP 後 | 後續版本實作 |
