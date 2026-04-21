# TEST_PLAN — 三公遊戲測試計畫

## Document Control

| 欄位 | 內容 |
|------|------|
| **DOC-ID** | TEST-SAM-GONG-20260421 |
| **版本** | v1.0 |
| **狀態** | DRAFT |
| **來源** | PRD-SAM-GONG-20260421 v1.3-draft / EDD-SAM-GONG-20260421 v1.0-draft |
| **作者** | devsop-autodev |
| **日期** | 2026-04-21 |

---

## 1. Test Strategy Overview

| 測試層 | 框架 | 覆蓋目標 | 執行環境 |
|--------|------|---------|---------|
| Unit（Server Game Logic） | Jest | 100% branches on game logic | CI (Node.js) |
| Unit（Client Components） | Jest + Cocos Mock | Key components | CI |
| Integration（Colyseus Room） | Jest + Colyseus Test SDK | Room lifecycle + message flow | CI |
| E2E（Full Game Flow） | Playwright | Critical user flows | CI (headless Chrome) |
| Performance | k6 | 50 concurrent rooms | Manual/staging |

---

## 2. Unit Test Plan — Game Logic (Server)

### 2.1 deck.ts Tests

| Test ID | Test Description | Input | Expected Output |
|---------|---------|-------|----------------|
| UT-DECK-001 | createDeck returns 52 cards | - | deck.length === 52 |
| UT-DECK-002 | All suits present | deck | 4 suits × 13 ranks |
| UT-DECK-003 | "10" rank is present | deck | deck includes rank="10" |
| UT-DECK-004 | shuffle returns 52 cards | 52-card deck | shuffled.length === 52 |
| UT-DECK-005 | shuffle is immutable | original deck | original array unchanged |
| UT-DECK-006 | shuffle produces different order | run 10x | not always same order (statistical) |
| UT-DECK-007 | dealCards distributes correctly | 52 deck, 6 players | each gets 3, 34 remain in deck |
| UT-DECK-008 | dealCards is deterministic given same deck | same deck, same players | same distribution |
| UT-DECK-009 | All 13 ranks present per suit | deck | A,2-9,10,J,Q,K × 4 suits |

### 2.2 evaluator.ts Tests

| Test ID | Test Description | Input | Expected |
|---------|---------|-------|---------|
| UT-EVAL-001 | A + A + A = 3 (1+1+1) | [A,A,A] | 3 |
| UT-EVAL-002 | J + Q + K = 公牌 (10+10+10=30, 30 mod 10=0) | [J,Q,K] | 10 (公牌) |
| UT-EVAL-003 | 7 + 8 + 9 = 4 (24 mod 10) | [7,8,9] | 4 |
| UT-EVAL-004 | 5 + 5 + K = 公牌 (5+5+10=20, 20 mod 10=0) | [5,5,K] | 10 (公牌) |
| UT-EVAL-005 | A + 7 + 3 = 1 (1+7+3=11, 11 mod 10=1) | [A,7,3] | 1 |
| UT-EVAL-006 | 9 + 9 + 9 = 7 (27 mod 10) | [9,9,9] | 7 |
| UT-EVAL-007 | 10 + J + Q = 公牌 (10+10+10=30, mod 10=0) | [10,J,Q] | 10 (公牌) |
| UT-EVAL-008 | compareHands: player wins (9 vs 5) | playerPts=9, bankerPts=5 | "player" |
| UT-EVAL-009 | compareHands: banker wins (5 vs 9) | playerPts=5, bankerPts=9 | "banker" |
| UT-EVAL-010 | compareHands: tie → banker wins (AC-010-3) | playerPts=5, bankerPts=5 | "banker" |
| UT-EVAL-011 | compareHands: 公牌 player (10) vs 9 banker | playerPts=10, bankerPts=9 | "player" |
| UT-EVAL-012 | compareHands: 9 player vs 公牌 banker (10) | playerPts=9, bankerPts=10 | "banker" |
| UT-EVAL-013 | compareHands: 公牌 vs 公牌 → banker wins (AC-010-3) | both pts=10 | "banker" |
| UT-EVAL-014 | 1000 random hands: result always in {1..9, 10} | random 1000 hands | all pts in valid range |
| UT-EVAL-015 | All 13 ranks have correct RANK_VALUE | A=1, 2-9=face, 10/J/Q/K=10 | match RANK_VALUE map |
| UT-EVAL-016 | getPointsDisplay: 公牌 shows "公牌" | pts=10 | "公牌" |
| UT-EVAL-017 | getPointsDisplay: normal point shows number | pts=7 | "7" |

### 2.3 settlement.ts Tests

| Test ID | Description | Scenario | Expected |
|---------|------------|---------|---------|
| UT-SETTLE-001 | Player wins | player 9 > banker 5 | player +betAmount, banker -betAmount |
| UT-SETTLE-002 | Banker wins | player 5 < banker 9 | player -betAmount, banker +betAmount |
| UT-SETTLE-003 | Tie → banker wins (AC-010-3) | player 5 = banker 5 | player -betAmount, banker +betAmount |
| UT-SETTLE-004 | Folded player excluded | player.hasBet=false | outcome="no_game", chipsChange=0 |
| UT-SETTLE-005 | Multiple players: 2 lose, 1 win | 3 players vs banker | banker net = 1 × betAmount |
| UT-SETTLE-006 | Banker profit = sum of player losses | 2 players lose, 1 wins | bankerChipsChange = 1 × betAmount |
| UT-SETTLE-007 | finalChips calculated correctly | player chips=1000, wins betAmount=50 | finalChips=1050 |
| UT-SETTLE-008 | settleForfeit: no game, no chip change | all folded | all chipsChange=0, outcome="no_game" |
| UT-SETTLE-009 | settleForfeit returns all players | 3 players | 3 results, all no_game |
| UT-SETTLE-010 | settle: 公牌 player beats 9 banker | player pts=10, banker pts=9 | player wins |

### 2.4 banker.ts Tests

| Test ID | Description | Input | Expected |
|---------|------------|-------|---------|
| UT-BANK-001 | selectInitialBanker returns valid player | playerIds=["A","B","C"] | one of the IDs |
| UT-BANK-002 | selectInitialBanker is within range | 100 runs | always a valid sessionId |
| UT-BANK-003 | getNextBanker rotates P1→P2 | seatOrder=["P1","P2","P3"], current="P1" | "P2" |
| UT-BANK-004 | getNextBanker rotates P3→P1 (wrap) | seatOrder=["P1","P2","P3"], current="P3" | "P1" |
| UT-BANK-005 | getNextBanker with 2 players | seatOrder=["A","B"], current="B" | "A" |
| UT-BANK-006 | getNextBanker with 6 players completes cycle | rotate 6 times from P1 | returns to P1 |

---

## 3. Integration Test Plan — Colyseus Room

### 3.1 Room Lifecycle Tests

| Test ID | Description | Steps | Expected |
|---------|------------|-------|---------|
| IT-ROOM-001 | Create room | client.create("sam_gong") | roomCode is 6-char alphanumeric |
| IT-ROOM-002 | Room code uses safe charset | create 100 rooms | no O, 0, I, 1 in any code |
| IT-ROOM-003 | Join room by code | client.joinById(roomCode) | player added to state.players |
| IT-ROOM-004 | Room max 6 players | join 7th player | 7th rejected with error 4002 |
| IT-ROOM-005 | Start game with 2 players | host sends start_game | phase → banker_selection |
| IT-ROOM-006 | Non-host cannot start | non-host sends start_game | error 4003 |
| IT-ROOM-007 | Start with 1 player | host sends start_game | error (insufficient players, code 4006) |
| IT-ROOM-008 | First player is host | join room | player.isHost === true for first joiner |
| IT-ROOM-009 | Room not found | joinById("XXXXXX") | error 4001 |

### 3.2 State Machine Tests

| Test ID | Description | Steps | Expected |
|---------|------------|-------|---------|
| IT-SM-001 | LOBBY→BANKER_SELECTION valid | host start_game | phase transitions correctly |
| IT-SM-002 | BANKER_SELECTION→BETTING valid | after banker selected | phase = betting |
| IT-SM-003 | BETTING→DEALING valid (1 caller) | 1 player calls | phase = dealing |
| IT-SM-004 | BETTING→ROUND_END on all fold (流局) | all players fold | phase = round_end |
| IT-SM-005 | DEALING→REVEAL valid | dealing completes | phase = reveal |
| IT-SM-006 | REVEAL→SETTLING valid | all cards revealed | phase = settling |
| IT-SM-007 | SETTLING→ROUND_END valid | settlement done | phase = round_end |
| IT-SM-008 | ROUND_END→BETTING valid (next round) | request_new_round | phase = betting |
| IT-SM-009 | Illegal: LOBBY→DEALING rejected | send direct to dealing | error 4004 |
| IT-SM-010 | Illegal: LOBBY→SETTLING rejected | send direct to settling | error 4004 |
| IT-SM-011 | Illegal: BETTING→SETTLING rejected | skip dealing/reveal | error 4004 |
| IT-SM-012 | Illegal: DEALING→BETTING rejected | try to go back | error 4004 |
| IT-SM-013 | Illegal: ROUND_END→SETTLING rejected | skip directly | error 4004 |

### 3.3 Game Flow Integration Tests

| Test ID | Description | Steps | Expected |
|---------|------------|-------|---------|
| IT-FLOW-001 | Full happy path | create→join→start→bet→deal→reveal→settle | complete without error |
| IT-FLOW-002 | Banker sets bet amount from whitelist | banker sends set_bet_amount({amount:50}) | state.betAmount=50 |
| IT-FLOW-003 | Invalid bet amount rejected | banker sends set_bet_amount({amount:30}) | error 4006 |
| IT-FLOW-004 | Non-banker cannot set bet | player sends set_bet_amount | error 4003 |
| IT-FLOW-005 | Player calls | player sends player_action({action:"call"}) | status="called", hasBet=true |
| IT-FLOW-006 | Player folds | player sends player_action({action:"fold"}) | status="folded" |
| IT-FLOW-007 | Player cannot call/fold in wrong phase | send player_action in lobby | error 4004 |
| IT-FLOW-008 | Banker cannot call/fold | banker sends player_action | error 4003 |
| IT-FLOW-009 | Insufficient chips rejected (AC-013-1) | player chips=10, betAmount=50, call | error 4005 |
| IT-FLOW-010 | All fold → no-game, forfeit settlement | all players fold | phase=round_end, all chipsChange=0 |
| IT-FLOW-011 | 30s countdown auto-folds pending players | wait 30s without action | deciding players auto-folded |
| IT-FLOW-012 | Countdown visible in state | enter betting phase | state.countdownSeconds decrements |
| IT-FLOW-013 | Banker rotates after round_end | complete 2 rounds | second round has different banker |
| IT-FLOW-014 | Second round skips BANKER_SELECTION | after first round_end, request_new_round | phase → betting (not banker_selection) |
| IT-FLOW-015 | Rate limiter: >10 ops/s rejected | send 11 messages in 1s | 11th returns error or dropped |

### 3.4 Anti-Cheat: Card Isolation Tests

| Test ID | Description | Steps | Expected |
|---------|------------|-------|---------|
| IT-CHEAT-001 | Player only receives own cards before reveal | P1 and P2 in dealing phase | P1 state has no suit/rank for P2's cards |
| IT-CHEAT-002 | Cards revealed on REVEAL phase | transition to reveal | all players see all cards |
| IT-CHEAT-003 | revealed=false during dealing | check P1's own cards | revealed=false before reveal phase |
| IT-CHEAT-004 | revealed=true after reveal | check all cards after reveal | all cards.revealed===true |

### 3.5 Reconnection Integration Tests

| Test ID | Description | Steps | Expected |
|---------|------------|-------|---------|
| IT-RECON-001 | Reconnect within 60s | disconnect → reconnect (5s later) | state restored, status restored |
| IT-RECON-002 | State preserved on reconnect | disconnect mid-game → reconnect | see current game state |
| IT-RECON-003 | Other players see disconnected status | P2 disconnects | P1 sees P2.status="disconnected" |
| IT-RECON-004 | 60s timeout: undecided player auto-folds | disconnect in betting, no bet → wait 65s | player.status="folded" |
| IT-RECON-005 | 60s timeout: decided player participates | disconnect after call → wait 65s | player.status="called", participates in settle |
| IT-RECON-006 | Game advances when disconnected player auto-folds | all remaining decide, 1 timeout | phase advances normally |

---

## 4. E2E Test Plan (Playwright)

### 4.1 Critical User Flows

| Test ID | Flow | Steps | Pass Criteria |
|---------|------|-------|--------------|
| E2E-001 | Create & Join Room | Open game → click Create Room → copy code → open new tab → enter code → Join | Both players shown in lobby |
| E2E-002 | Full Game Round | E2E-001 → Start Game → Banker sets bet (50) → Both call → Cards dealt → Reveal → See results | Settlement overlay displayed with correct win/lose |
| E2E-003 | Player Fold | Enter betting → P2 clicks Fold → Continue to reveal/settle with P1 only | P2 excluded from settlement results |
| E2E-004 | All Fold (流局) | Enter betting → all players fold | Forfeit settlement overlay shown, no chip change |
| E2E-005 | Room Code Copy | Create room → click copy button | Room code copied to clipboard (navigator.clipboard) |
| E2E-006 | Error: Wrong Room Code | Enter "XXXXXX" → click Join | Error message/toast displayed |
| E2E-007 | Error: Room Full | Create room with 6 players → 7th tries to join | Error "房間已滿" displayed |
| E2E-008 | Countdown Timer | Enter betting phase | 30s countdown visible and decrementing |
| E2E-009 | Countdown ≤ 5s turns red | Wait until 5s remain | Countdown label/bar shows red color |
| E2E-010 | Non-host Cannot Start | P2 (non-host) tries to click start | Button disabled or error shown |
| E2E-011 | Insufficient Chips Protection | P2 chips=10, betAmount=50, clicks Call | Error toast "籌碼不足" shown, chips unchanged |
| E2E-012 | Reconnect Flow | During betting phase, P2 refreshes page → rejoin within 60s | Game state restored for P2 |
| E2E-013 | Banker Crown Indicator | After banker selected | Banker player slot shows crown/banker icon |
| E2E-014 | Chip Change Animation | After settlement | Chip counters animate to new values |

### 4.2 Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox',  use: { browserName: 'firefox' } },
    { name: 'webkit',   use: { browserName: 'webkit' } },  // Safari
    {
      name: 'mobile-safari',
      use: {
        browserName: 'webkit',
        viewport: { width: 667, height: 375 },  // iPhone SE 橫向（AC-D4）
      },
    },
  ],
});
```

---

## 5. Performance Test Plan (k6)

### 5.1 Load Test Scenarios

```javascript
// tests/perf/load.js
import ws from 'k6/ws';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    steady_state: {
      executor: 'constant-vus',
      vus: 150,        // 50 rooms × 3 players avg
      duration: '5m',
    },
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 150 },
        { duration: '3m', target: 150 },
        { duration: '1m', target: 0 },
      ],
    },
    spike: {
      executor: 'constant-vus',
      vus: 300,        // sudden spike to 300
      duration: '1m',
      startTime: '6m',
    },
  },
  thresholds: {
    'ws_connecting':    ['p(95)<1000'],  // WS connect < 1s (PRD §5.1)
    'ws_msgs_received': ['rate>10'],     // msg throughput
    'checks':           ['rate>0.99'],   // 99% success
    'ws_session_duration': ['p(95)<300000'], // session < 5min
  },
};

export default function () {
  const url = 'ws://localhost:2567';
  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'create', room: 'sam_gong' }));
    });
    socket.on('message', (msg) => {
      const data = JSON.parse(msg);
      check(data, { 'has valid phase': (d) => !!d.state?.roomPhase });
    });
    socket.setTimeout(() => socket.close(), 30000);
  });
  check(res, { 'WS connected': (r) => r && r.status === 101 });
  sleep(1);
}
```

### 5.2 Performance Targets

| Metric | Target | Test Method |
|--------|--------|------------|
| WS 連接建立 | < 1s (P95) | k6 ws_connecting |
| 操作響應延遲 | < 300ms (P95) | measure msg RTT |
| Server CPU | < 20% (50 rooms) | system metrics (pm2 monit) |
| Server Memory | < 512MB (50 rooms) | Node.js heap (process.memoryUsage) |
| Concurrent rooms | 50 with 3+ players | k6 steady load |
| State diff size | < 1KB per patch | Colyseus debug log |

---

## 6. UAT (User Acceptance Test) Checklist

| # | 驗收項目 | 驗收方式 | 判定標準 |
|---|---------|---------|---------|
| UAT-001 | 三公規則正確 | 10 局手動驗證 | 每局勝負判定正確 |
| UAT-002 | 公牌判斷正確 | 特意製造公牌場景（5+5+K=公牌）| 公牌必勝所有 1-9 點 |
| UAT-003 | 公牌 vs 公牌 → 莊贏 | 雙方均持公牌 | 莊家勝出（平局莊佔優）|
| UAT-004 | 莊家輪換 | 玩 4 局 | 每局莊家正確順時針輪換 |
| UAT-005 | 第二局起不再顯示「莊家選擇」動畫 | 玩第二局 | 直接進入押注 |
| UAT-006 | 斷線重連（60s內）| 遊戲中手動斷網 → 60s 內回復 | 牌局狀態完整恢復 |
| UAT-007 | 防作弊 | DevTools Network 在翻牌前檢查 | 他人牌面 (suit/rank) 未在 patch 中出現 |
| UAT-008 | 流局（全棄牌）| 所有閒家棄牌 | 流局畫面正確，無籌碼扣減 |
| UAT-009 | 籌碼不足提示 | 籌碼低於底注，嘗試跟注 | 清晰提示「籌碼不足」，無法跟注 |
| UAT-010 | 手機 Web（Safari Mobile）| iPhone/iPad Safari 實機測試 | 操作正常，無版面破版，WebSocket 連接穩定 |
| UAT-011 | 多瀏覽器兼容 | Chrome / Firefox / Safari | 三瀏覽器遊戲流程均完整 |
| UAT-012 | 30s 倒計時超時自動棄牌 | 不操作等待 30s | 玩家自動棄牌，遊戲繼續 |

---

## 7. Test Coverage Targets

| Module | Target Coverage | Method |
|--------|----------------|--------|
| server/src/logic/deck.ts | 100% branches | Jest unit |
| server/src/logic/evaluator.ts | 100% branches | Jest unit + 1000 random cases |
| server/src/logic/settlement.ts | 100% branches | Jest unit |
| server/src/logic/banker.ts | 100% branches | Jest unit |
| server/src/rooms/SamGongRoom.ts | ≥ 85% | Jest + Colyseus Test SDK |
| server/src/utils/rateLimiter.ts | ≥ 90% | Jest unit |
| client/assets/scripts/managers/ | ≥ 70% | Jest + Cocos Mock |
| Overall server | ≥ 80% | Jest --coverage |

---

## 8. PRD Requirements Traceability (Test → REQ)

| REQ-ID | 功能 | 覆蓋測試 |
|--------|------|---------|
| REQ-001 | 房間創建（6位碼）| IT-ROOM-001, IT-ROOM-002, E2E-001 |
| REQ-002 | 房間加入 | IT-ROOM-003, E2E-001, E2E-006 |
| REQ-003 | 最少2人開局 | IT-ROOM-007, E2E-010 |
| REQ-004 | 初始隨機莊家 | UT-BANK-001, UT-BANK-002, IT-SM-001 |
| REQ-005 | 莊家輪換 | UT-BANK-003, UT-BANK-004, IT-FLOW-013, UAT-004 |
| REQ-006 | 底注設定 | IT-FLOW-002, IT-FLOW-003, IT-FLOW-004, E2E-002 |
| REQ-007 | 閒家押注/棄牌（30s限時）| IT-FLOW-005~011, E2E-003, E2E-008, E2E-009, UAT-012 |
| REQ-008 | Server-Authoritative 洗牌發牌 | UT-DECK-001~009, IT-CHEAT-001~004 |
| REQ-009 | 三公牌點計算引擎 | UT-EVAL-001~017, UAT-001, UAT-002 |
| REQ-010 | 翻牌 + 閒vs莊比牌 | UT-EVAL-008~013, UT-SETTLE-001~003, IT-FLOW-001, E2E-002 |
| REQ-011 | 籌碼結算 | UT-SETTLE-001~010, E2E-002, E2E-014 |
| REQ-012 | 60s斷線重連 | IT-RECON-001~006, E2E-012, UAT-006 |
| REQ-013 | 籌碼不足保護 | IT-FLOW-009, E2E-011, UAT-009 |

---

## 9. Test Execution Order

1. **Unit Tests** (fastest, run first — no external deps):
   ```bash
   npm test -- server/tests/unit/deck.test.ts
   npm test -- server/tests/unit/evaluator.test.ts
   npm test -- server/tests/unit/settlement.test.ts
   npm test -- server/tests/unit/banker.test.ts
   ```

2. **Integration Tests** (requires Colyseus test harness):
   ```bash
   npm test -- server/tests/integration/samGongRoom.test.ts
   ```

3. **E2E Tests** (requires running server + client build):
   ```bash
   npx playwright test
   ```

4. **Performance Tests** (manual, on staging env):
   ```bash
   k6 run tests/perf/load.js
   ```

5. **UAT** — Manual, conducted by QA team before GA release

---

## 10. Special Test Cases: Edge Conditions

| Test ID | Edge Case | Setup | Expected |
|---------|-----------|-------|---------|
| EDGE-001 | 公牌 PRD correctness: sum=10 (A+9+K=1+9+10=20, mod10=0) | [A,9,K] → calculatePoints | 10 (公牌) |
| EDGE-002 | Min possible sum: A+A+A=3 (not 公牌) | [A,A,A] | 3 (not 公牌) |
| EDGE-003 | Max possible sum mod 10: K+K+K=30, mod10=0 | [K,K,K] | 10 (公牌) |
| EDGE-004 | Exactly 2 players (minimum) | 2 player game full flow | Complete without error |
| EDGE-005 | Exactly 6 players (maximum) | 6 player game, all call | All 5 players vs banker settle correctly |
| EDGE-006 | Banker disconnects mid-betting | banker leaves during betting | Auto-advance via timeout, rotation handles it |
| EDGE-007 | All players disconnect except banker | 5 disconnect during betting | Auto-fold all, forfeit settlement |
| EDGE-008 | request_new_round when 2 remain (others left) | 2 of 4 players left | Game continues with 2 |
| EDGE-009 | Rate limit boundary: exactly 10 ops/s | send exactly 10 messages | all accepted |
| EDGE-010 | Rate limit boundary: 11th op/s | send 11th message | rejected or error |
