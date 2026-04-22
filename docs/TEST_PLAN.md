# TEST_PLAN — 測試計畫

<!-- SDLC QA — Layer 4：Test Plan Document -->

---

## Document Control

| 欄位 | 內容 |
|------|------|
| **DOC-ID** | TEST-PLAN-SAM-GONG-GAME-20260422 |
| **專案名稱** | 三公遊戲（Sam Gong 3-Card Poker）即時多人線上平台 |
| **文件版本** | v1.0-draft |
| **狀態** | DRAFT（STEP-14 自動生成） |
| **作者** | Evans Tseng（由 /devsop-autodev STEP-14 自動生成） |
| **日期** | 2026-04-22 |
| **來源 EDD** | EDD-SAM-GONG-GAME-20260422 v1.4-draft |
| **來源 PRD** | PRD-SAM-GONG-GAME-20260421 v0.14-draft |

---

## Change Log

| 版本 | 日期 | 作者 | 變更摘要 |
|------|------|------|---------|
| v1.0-draft | 2026-04-22 | /devsop-autodev STEP-14 | 初稿；包含 Unit/Integration/E2E/Performance/UAT 五層完整測試計畫；依 EDD §8.4 Testing Strategy 生成 |

---

## 1. Overview

### 1.1 測試目標

本測試計畫涵蓋三公遊戲（Sam Gong 3-Card Poker）線上多人平台的全面品質驗證，確保：

1. **遊戲邏輯正確性**：HandEvaluator、SettlementEngine、BankerRotation 等核心模組結果可靠
2. **防沉迷合規性**：符合台灣法規對成人（2h 提醒）與未成年（2h 硬停）的要求
3. **安全性**：JWT 驗證、Rate Limit、SQL Injection 防護、封號即時踢出等機制有效
4. **效能達標**：500 CCU 下 P95 WS 延遲 ≤ 100ms，SLA ≥ 99.5%/月
5. **業務驗收**：所有 PRD 驗收標準（Acceptance Criteria）通過 UAT

### 1.2 覆蓋率要求

| 指標 | 目標值 | CI 門控 |
|------|--------|---------|
| Lines Coverage | ≥ 80% | PR 合併阻擋 |
| Branches Coverage | ≥ 80% | PR 合併阻擋 |
| Functions Coverage | ≥ 80% | PR 合併阻擋 |
| Statements Coverage | ≥ 80% | PR 合併阻擋 |
| HandEvaluator 測試向量 | ≥ 200 個 | CI 驗證 |

CI 命令：
```bash
jest --coverage --coverageThreshold='{"global":{"lines":80,"branches":80,"functions":80,"statements":80}}'
```

### 1.3 測試環境概覽

| 環境 | 用途 | 觸發條件 |
|------|------|---------|
| local | 開發者本機單元測試 | 本地 npm test |
| dev | 持續整合（Unit + Integration） | push to feature/* |
| staging | E2E + 效能測試 | push to develop |
| prod | UAT + Smoke Test（上線後） | 部署完成後 |

---

## 2. Test Strategy

### 2.1 測試層次架構

```
┌─────────────────────────────────────────────────────┐
│  UAT（User Acceptance Testing）                      │
│  業務驗收、端到端場景、真實使用者操作流程              │
├─────────────────────────────────────────────────────┤
│  Performance Tests（效能測試）                        │
│  k6 WS 負載、壓力、尖峰、耐久測試                     │
├─────────────────────────────────────────────────────┤
│  E2E Tests（端到端測試）                              │
│  多玩家真實房間、完整遊戲週期、滲透測試                │
├─────────────────────────────────────────────────────┤
│  Integration Tests（整合測試）                        │
│  @colyseus/testing Room 測試、REST API 整合、DB 測試  │
├─────────────────────────────────────────────────────┤
│  Unit Tests（單元測試）                               │
│  Jest、純函數、各模組獨立測試                          │
└─────────────────────────────────────────────────────┘
```

### 2.2 各層測試策略

| 層次 | 框架 | 執行頻率 | 範圍 | 隔離層級 |
|------|------|---------|------|---------|
| Unit | Jest + ts-jest | 每次 commit | 純函數、類別方法 | 完全 Mock 外部依賴 |
| Integration | Jest + @colyseus/testing | 每次 PR | Room 生命週期、API、DB | 真實 Redis/DB 容器（testcontainers）|
| E2E | Jest + Playwright/Colyseus Client SDK | 每次 develop 分支 | 完整遊戲流程 | Staging 環境 |
| Performance | k6 | 每週 + 每次 Release | 500 CCU 並發 | Staging 環境 |
| UAT | 手動 + BDD | Release 前 | PRD AC 驗收 | Staging/Beta 環境 |

### 2.3 測試資料策略

- **Fixtures**：`tests/fixtures/` TypeScript seed scripts，預置測試帳號與廳別
- **Mock**：
  - Redis：`ioredis-mock`（單元測試），真實 Redis 容器（整合測試）
  - PostgreSQL：`pg-mem`（單元測試），`testcontainers`（整合測試）
  - OTP SMS：固定 OTP Code（環境變數 `TEST_OTP_BYPASS_CODE`）
- **清理**：每次測試後執行清理 script 還原狀態

---

## 3. Unit Test Plan

**工具**：Jest 29.x + ts-jest + @colyseus/testing  
**執行命令**：`npm run test:unit`  
**測試目錄**：`tests/unit/`

### 3.1 HandEvaluator Tests

**模組**：`server/src/game/HandEvaluator.ts`  
**描述**：測試 3 張牌點數計算（mod 10）、三公判定、D8 同點比牌（花色、牌值）邏輯。

測試向量格式：`TC-ID | 描述 | 輸入（3 張牌）| 預期輸出 | 優先級`

#### 3.1.1 基本點數計算（calculate）

| TC-ID | 描述 | 輸入 | 預期輸出 | 優先級 |
|-------|------|------|---------|--------|
| TC-HE-001 | 三公（J+Q+K）所有人頭牌 | [{value:'J'},{value:'Q'},{value:'K'}] | { points:0, is_sam_gong:true, hand_type:'sam_gong' } | P0 |
| TC-HE-002 | 三公（10+Q+K） | [{value:'10'},{value:'Q'},{value:'K'}] | { points:0, is_sam_gong:true, hand_type:'sam_gong' } | P0 |
| TC-HE-003 | 三公（J+J+8）point=0+0+8=8, NOT三公 | [{value:'J'},{value:'J'},{value:'8'}] | { points:8, is_sam_gong:false, hand_type:'8' } | P0 |
| TC-HE-004 | 9點（A+8=1+8=9） | [{value:'A',point:1},{value:'8',point:8},{value:'K',point:0}] | { points:9, is_sam_gong:false, hand_type:'9' } | P0 |
| TC-HE-005 | 8點（3+5=8） | [{value:'3'},{value:'5'},{value:'K'}] | { points:8, is_sam_gong:false, hand_type:'8' } | P0 |
| TC-HE-006 | 0點（非三公，2+4+4=10 mod 10=0） | [{value:'2'},{value:'4'},{value:'4'}] | { points:0, is_sam_gong:false, hand_type:'0' } | P0 |
| TC-HE-007 | 1點（A+K+K=1+0+0=1） | [{value:'A'},{value:'K'},{value:'K'}] | { points:1, is_sam_gong:false, hand_type:'1' } | P1 |
| TC-HE-008 | 2點（A+A=1+1=2） | [{value:'A'},{value:'A'},{value:'K'}] | { points:2, is_sam_gong:false, hand_type:'2' } | P1 |
| TC-HE-009 | 5點（2+3=5） | [{value:'2'},{value:'3'},{value:'Q'}] | { points:5, is_sam_gong:false, hand_type:'5' } | P1 |
| TC-HE-010 | 6點（6+J+Q=6+0+0=6） | [{value:'6'},{value:'J'},{value:'Q'}] | { points:6, is_sam_gong:false, hand_type:'6' } | P1 |
| TC-HE-011 | 7點（7+K=7+0=7） | [{value:'7'},{value:'K'},{value:'J'}] | { points:7, is_sam_gong:false, hand_type:'7' } | P1 |
| TC-HE-012 | 整數運算邊界：不使用浮點 | [{value:'9'},{value:'9'},{value:'9'}] | { points:7, is_sam_gong:false, hand_type:'7' } | P0 |
| TC-HE-013 | A 點數為 1（非 11） | [{value:'A'},{value:'9'},{value:'9'}] | { points:9, is_sam_gong:false, hand_type:'9' } | P0 |
| TC-HE-014 | 4點（4+K+Q=4+0+0=4） | [{value:'4'},{value:'K'},{value:'Q'}] | { points:4, is_sam_gong:false, hand_type:'4' } | P1 |
| TC-HE-015 | 3點（3+J+Q=3+0+0=3） | [{value:'3'},{value:'J'},{value:'Q'}] | { points:3, is_sam_gong:false, hand_type:'3' } | P1 |

#### 3.1.2 D8 同點比牌（tiebreak）

| TC-ID | 描述 | 輸入（hand1 vs hand2）| 預期輸出 | 優先級 |
|-------|------|------|---------|--------|
| TC-HE-016 | 花色比較：♠ 優於 ♥ | hand1=[{suit:'spade',value:'3'},...], hand2=[{suit:'heart',value:'3'},...] | 1（hand1 勝） | P0 |
| TC-HE-017 | 花色比較：♥ 優於 ♦ | hand1=[{suit:'heart',value:'3'},...], hand2=[{suit:'diamond',value:'3'},...] | 1（hand1 勝） | P0 |
| TC-HE-018 | 花色比較：♦ 優於 ♣ | hand1=[{suit:'diamond',value:'3'},...], hand2=[{suit:'club',value:'3'},...] | 1（hand1 勝） | P0 |
| TC-HE-019 | 花色相同，牌值比較：K > Q | hand1=[{suit:'spade',value:'K'},...], hand2=[{suit:'spade',value:'Q'},...] | 1（hand1 勝） | P0 |
| TC-HE-020 | 牌值比較：A 最小 | hand1=[{suit:'spade',value:'2'},...], hand2=[{suit:'spade',value:'A'},...] | 1（hand1 勝） | P0 |
| TC-HE-021 | 完全相同手牌（平手） | hand1=hand2（相同花色/牌值組合） | 0（平手） | P0 |
| TC-HE-022 | 最大花色比較（取手中最大花色張） | hand1=[spade2, club3, club4], hand2=[heart2, heart3, heart4] | 1（hand1 勝，spade > heart）| P1 |
| TC-HE-023 | 花色相同下最大牌值比較 | hand1=[spade_K, spade_2, spade_3], hand2=[spade_Q, spade_J, spade_A] | 1（hand1 勝，K > Q）| P1 |

#### 3.1.3 compare（閒家 vs 莊家）

| TC-ID | 描述 | 輸入 | 預期輸出 | 優先級 |
|-------|------|------|---------|--------|
| TC-HE-024 | 閒家三公 vs 莊家 9 點 | player=三公, banker=9pt | 'win' | P0 |
| TC-HE-025 | 莊家三公 vs 閒家 9 點 | player=9pt, banker=三公 | 'lose' | P0 |
| TC-HE-026 | 閒家 9 點 vs 莊家 8 點 | player=9pt, banker=8pt | 'win' | P0 |
| TC-HE-027 | 閒家 5 點 vs 莊家 7 點 | player=5pt, banker=7pt | 'lose' | P0 |
| TC-HE-028 | 同點 D8 tiebreak 閒家勝 | player=8pt spade, banker=8pt heart | 'win' | P0 |
| TC-HE-029 | 同點 D8 tiebreak 完全平手 | player=8pt, banker=8pt（同花色同牌值）| 'tie' | P0 |

---

### 3.2 SettlementEngine Tests

**模組**：`server/src/game/SettlementEngine.ts`  
**描述**：測試三步驟結算邏輯、Rake 計算、莊家破產先到先得、全員棄牌、籌碼守恆。

| TC-ID | 描述 | 輸入情境 | 預期輸出 | 優先級 |
|-------|------|---------|---------|--------|
| TC-SE-001 | 正常結算：1 贏家（N=1 倍），1 輸家 | player1(call,win,pt=8), player2(call,lose,pt=5), banker_bet=1000, pot=1000 | player1 net=+1000, player2 net=-1000, rake=50(floor(1000×0.05)), 守恆驗證通過 | P0 |
| TC-SE-002 | 三公贏家（N=3 倍）結算 | player1(call,三公,win), banker_bet=500, pot=500（player2 lose） | player1 net=+1500, player2 net=-500, rake=25, 莊家 net=-(1500+25)+(500-25)=-1025 | P0 |
| TC-SE-003 | 9 點贏家（N=2 倍）結算 | player1(call,9pt,win), banker_bet=500 | player1 net=+1000, rake 計算正確 | P0 |
| TC-SE-004 | 全員 Fold（all_fold）情境 | 所有閒家 fold | pot=0, rake=0, banker escrow 退回, all_fold=true | P0 |
| TC-SE-005 | 2 人桌唯一閒家 Fold | banker+1 閒家，閒家 fold | all_fold=true, pot=0, rake=0, banker_chips 退回 escrow | P0 |
| TC-SE-006 | 6 人桌全員 Fold | 5 名閒家全部 fold | all_fold=true, pot=0, rake=0, 莊家 escrow 退回 | P0 |
| TC-SE-007 | 莊家破產先到先得（順時針）| banker_chips=800, 2 贏家各 bet=500, 順時針 seat1 先 | seat1 獲全額支付(N=1=500), seat2 進入 insolvent_winners, net_chips=-500 | P0 |
| TC-SE-008 | Insolvent Winner net_chips 必須非零 | 莊家破產，贏家未獲支付 | insolvent_winner.net_chips = -called_bet（NOT 0）| P0 |
| TC-SE-009 | Rake 計算：pot=0 時 rake=0 | 全員 fold，pot=0 | rake_amount=0（不適用最少 1 規則）| P0 |
| TC-SE-010 | Rake 計算：pot=1 時 rake=1（min 1 規則）| pot=1，floor(1×0.05)=0，but min=1 | rake_amount=1 | P0 |
| TC-SE-011 | Rake 計算：pot=100，rake=5 | pot=100 | rake_amount=5（floor(100×0.05)=5）| P1 |
| TC-SE-012 | 平手（tie）情境 | player 同點同 D8，result=tie | net_chips=0, payout_amount=0（退注），不入底池 | P0 |
| TC-SE-013 | 籌碼守恆驗證 | 任意合法結算 | sum(all net_chips) + rake_amount === 0 | P0 |
| TC-SE-014 | 多贏家情境（2 贏 1 輸）| player1(win,N=1), player2(win,N=1), player3(lose) | 每位贏家各得 banker_bet，輸家底池扣 rake 歸莊，守恆 | P1 |
| TC-SE-015 | 莊家 net_chips 計算 | 2 閒家：1 贏家 N=1, 1 輸家 | banker_net = loser_bet - rake - winner_payout | P0 |

---

### 3.3 BankerRotation Tests

**模組**：`server/src/game/BankerRotation.ts`  
**描述**：測試首莊決定、順時針輪莊、跳過不合格莊家、環繞邊界。

| TC-ID | 描述 | 輸入 | 預期輸出 | 優先級 |
|-------|------|------|---------|--------|
| TC-BR-001 | 首莊：持最多籌碼者 | [p0=5000, p1=3000, p2=2000] | banker=p0（seat 0） | P0 |
| TC-BR-002 | 首莊：同籌碼按進入順序 | [p0=5000, p1=5000] | banker=p0（先進入者） | P1 |
| TC-BR-003 | 順時針輪莊：seat 0 → seat 1 | currentBanker=0, seats=[0,1,2,3] | nextBanker=1 | P0 |
| TC-BR-004 | 環繞邊界：最後玩家 → 第一玩家 | currentBanker=3, seats=[0,1,2,3] | nextBanker=0 | P0 |
| TC-BR-005 | 跳過破產莊家（chip < min_bet）| seats=[0,1,2], seat1 chip=0, min_bet=100 | 跳過 seat1，nextBanker=2 | P0 |
| TC-BR-006 | 所有候選莊家均不合格 | 所有玩家 chip < min_bet | 回到 waiting 狀態（返回 -1 或特殊標記）| P0 |
| TC-BR-007 | 中途離場玩家從輪莊序列移除 | seats=[0,1,2], seat1 離場後 rotate | nextBanker 跳過 seat1 | P1 |
| TC-BR-008 | 2 人桌輪莊 | currentBanker=0, seats=[0,1] | nextBanker=1 | P0 |
| TC-BR-009 | skipInsolventBanker 環繞 | seats=[0,1,2], seat0 破產, currentBanker=2 | skipInsolventBanker → 跳過 seat0，選 seat1 | P1 |

---

### 3.4 AntiAddictionManager Tests

**模組**：`server/src/game/AntiAddictionManager.ts`  
**描述**：測試成人 2h 提醒、未成年 2h 硬停、Write-Through 機制、UTC+8 午夜重置。

| TC-ID | 描述 | 輸入 | 預期輸出 | 優先級 |
|-------|------|------|---------|--------|
| TC-AA-001 | 成人連續遊玩 < 2h，無提醒 | trackAdultSession，sessionSeconds=3600 | status=normal（無警告）| P0 |
| TC-AA-002 | 成人連續遊玩達 2h，觸發提醒 | sessionSeconds=7200 | status=warning, 送出 anti_addiction_warning { type:'adult' } | P0 |
| TC-AA-003 | 成人 2h 提醒後重複：未確認不重置 | 提醒後繼續計時 | 仍維持 warning 狀態 | P1 |
| TC-AA-004 | 成人確認提醒後計時重置 | onAdultWarningConfirmed(playerId) | sessionSeconds 重置為 0 | P0 |
| TC-AA-005 | 成人離線 > 30min 後重新連線，計時重置 | 離線 31min 後重連 | sessionSeconds 重置為 0 | P1 |
| TC-AA-006 | 未成年每日 < 2h，可繼續遊玩 | trackUnderageDaily，dailySeconds=3600 | status=normal | P0 |
| TC-AA-007 | 未成年每日達 2h，觸發硬停 | dailySeconds=7200 | status=hard_stop, 送出 anti_addiction_signal { type:'underage' }, WS Close 4003 | P0 |
| TC-AA-008 | 未成年每日上限 UTC+8 午夜重置 | 次日 00:00 UTC+8 後 | dailySeconds 重置為 0，可重新連線 | P0 |
| TC-AA-009 | getTaiwanMidnightTimestamp 計算正確 | 任意 UTC 時間 | 返回下一個 UTC+8 00:00 的 Unix ms | P0 |
| TC-AA-010 | Write-Through：每局 settled 後寫入 PostgreSQL | settle 事件觸發 | DB users.daily_play_seconds 更新正確 | P0 |
| TC-AA-011 | Redis failover 後從 PostgreSQL 回填 | Redis 重啟 | 從 DB 回填計時資料，不丟失 | P0 |
| TC-AA-012 | confirm_anti_addiction payload 驗證 { type:'adult' } | 發送 { type:'adult' } | onAdultWarningConfirmed 被呼叫 | P0 |
| TC-AA-013 | 未成年牌局中達到 2h，等待本局結算後登出 | 遊戲進行中達限 | scheduleUnderageLogout 設定，本局結算後觸發 WS Close 4003 | P0 |

---

### 3.5 TutorialScriptEngine Tests

**模組**：`server/src/game/TutorialScriptEngine.ts`  
**描述**：測試教學固定劇本載入、三局腳本正確性、牌張唯一性。

| TC-ID | 描述 | 輸入 | 預期輸出 | 優先級 |
|-------|------|------|---------|--------|
| TC-TS-001 | R1 劇本：莊家三公（K♠/Q♥/J♦）| loadScript(1) | banker_hand=['K♠','Q♥','J♦'], is_sam_gong=true, expected_outcome='banker_win' | P0 |
| TC-TS-002 | R1 劇本：閒家 1pt（A♠/2♣/8♦）| loadScript(1) | player_hand=['A♠','2♣','8♦']（1+2+8=11 mod 10=1pt）| P0 |
| TC-TS-003 | R2 劇本：莊家 5pt（5♠/A♥/9♦）| loadScript(2) | banker_hand=['5♠','A♥','9♦']（5+1+9=15 mod 10=5pt）| P0 |
| TC-TS-004 | R2 劇本：閒家 3pt（3♦/K♣/Q♠）| loadScript(2) | player_hand=['3♦','K♣','Q♠']（3+0+0=3pt）| P0 |
| TC-TS-005 | R3 劇本：平局（force_tie=true）| loadScript(3) | banker=6pt, player=6pt, force_tie=true, expected_outcome='tie' | P0 |
| TC-TS-006 | 18 張牌全部唯一（無重複）| loadScript(1/2/3) 全部 | 18 張牌張集合無任何重複 | P0 |
| TC-TS-007 | 非法 round 數值報錯 | loadScript(4 as any) | 拋出 Error | P1 |
| TC-TS-008 | tutorial_mode=false 時不使用固定劇本 | 正常遊戲模式 | DeckManager 使用 crypto.randomInt 洗牌 | P0 |

---

### 3.6 DeckManager Tests

**模組**：`server/src/game/DeckManager.ts`

| TC-ID | 描述 | 輸入 | 預期輸出 | 優先級 |
|-------|------|------|---------|--------|
| TC-DM-001 | buildDeck 產生 52 張唯一牌 | buildDeck() | deck.length=52，無重複 | P0 |
| TC-DM-002 | shuffle 後仍為 52 張唯一牌 | shuffle() | 洗牌後 deck.length=52，無重複 | P0 |
| TC-DM-003 | 禁止 Math.random（使用 crypto.randomInt）| 靜態分析 | 程式碼不含 Math.random | P0 |
| TC-DM-004 | deal(3) 返回 3 張牌 | deal(3) | cards.length=3 | P0 |
| TC-DM-005 | 6 人桌 deal 18 張，牌張唯一 | deal 6 次 × 3 | 18 張無重複 | P0 |

---

### 3.7 Rate Limit Tests

**模組**：`server/src/middleware/rateLimit.ts`

| TC-ID | 描述 | 輸入 | 預期輸出 | 優先級 |
|-------|------|------|---------|--------|
| TC-RL-001 | 認證端點 < 30 次/min 不觸發限制 | 29 req/min/IP to /auth/* | HTTP 200（正常回應）| P0 |
| TC-RL-002 | 認證端點達 30 次/min 觸發限制 | 30 req/min/IP to /auth/* | HTTP 429 + Retry-After header | P0 |
| TC-RL-003 | 高敏感端點 5 次/min 限制 | 6 req/min/user to /player/daily-chip | HTTP 429 | P0 |
| TC-RL-004 | 一般端點 60 次/min 限制 | 61 req/min/user to /player/me | HTTP 429 | P0 |
| TC-RL-005 | IP 全局 300 次/min 限制 | 301 req/min/IP | HTTP 429 | P0 |

---

## 4. Integration Test Plan

**工具**：Jest + @colyseus/testing + testcontainers  
**執行命令**：`npm run test:integration`  
**測試目錄**：`tests/integration/`  
**前提條件**：Docker 運行中（PostgreSQL + Redis 容器自動啟動）

### 4.1 Room Lifecycle Tests

**工具**：`@colyseus/testing` — `ColyseusTestServer.create(SamGongRoom)`

| TC-ID | 描述 | 步驟 | 預期結果 | 優先級 |
|-------|------|------|---------|--------|
| TC-RL-INT-001 | Room onCreate 初始化狀態正確 | createRoom('sam_gong', { tier:'青銅廳' }) | state.phase='waiting', state.tier_config.min_bet=100 | P0 |
| TC-RL-INT-002 | 玩家加入：JWT 驗證通過 | connectTo(room, { token: validJWT }) | onJoin 成功，PlayerState 初始化 | P0 |
| TC-RL-INT-003 | 玩家加入：JWT 失效拒絕 | connectTo(room, { token: expiredJWT }) | onJoin 拋出 ServerError | P0 |
| TC-RL-INT-004 | 玩家加入：籌碼不足拒絕 | connectTo(room, chip_balance=500, tier entry_chips=1000) | onJoin 拋出 ServerError（insufficient_chips）| P0 |
| TC-RL-INT-005 | 2 玩家加入後自動進入 dealing phase | connectTo × 2 | state.phase='dealing' | P0 |
| TC-RL-INT-006 | 玩家斷線 30s 重連視窗 | disconnect client, reconnect within 30s | PlayerState 保留，推送 myHand | P0 |
| TC-RL-INT-007 | 玩家斷線超過 30s 自動 Fold | disconnect client, wait 31s | player.is_folded=true | P0 |
| TC-RL-INT-008 | onDispose 寫入 game_sessions | destroyRoom | DB 存在對應 game_sessions 記錄 | P0 |
| TC-RL-INT-009 | 房間最大容量 6 人 | connectTo × 7 | 第 7 位拒絕加入（room_full）| P1 |
| TC-RL-INT-010 | 60s 無人加入自動解散 | createRoom, 不加入玩家，等 60s | Room 銷毀（onDispose 呼叫）| P1 |

---

### 4.2 Game Flow Tests

**描述**：完整遊戲流程從 onCreate 到 settled phase 的整合測試。

| TC-ID | 描述 | 步驟 | 預期結果 | 優先級 |
|-------|------|------|---------|--------|
| TC-GF-001 | 完整遊戲一局（2 人）| join×2 → dealing → banker_bet → call → showdown → settled | phase 依序正確轉換，net_chips 正確 | P0 |
| TC-GF-002 | banker_bet 計時器超時自動最低下注 | 不發送 banker_bet，等 30s | banker_bet = min_bet，phase='player-bet' | P0 |
| TC-GF-003 | 閒家 call 計時器超時自動 Fold | 不發送 call/fold，等 30s | player.is_folded=true | P0 |
| TC-GF-004 | 結算後 5s 自動開始下一局 | settled 後等 5s | phase='dealing'，round_number+1 | P0 |
| TC-GF-005 | 結算後玩家不足進入 waiting | settled 後玩家 < 2 | phase='waiting' | P1 |
| TC-GF-006 | 多局連續輪莊正確 | 完成 3 局 | banker_seat_index 每局正確輪換 | P0 |
| TC-GF-007 | resetForNextRound 正確清空狀態 | 第 2 局開始前 | bet_amount=0, is_folded=false, settlement 清空 | P0 |

---

### 4.3 WebSocket Message Tests

**描述**：所有 Client → Server 訊息類型的整合驗證。

| TC-ID | 描述 | 訊息類型 | 輸入 | 預期結果 | 優先級 |
|-------|------|---------|------|---------|--------|
| TC-WS-001 | banker_bet 合法下注 | banker_bet | { amount: 200 }（min=100, max=500）| state.banker_bet_amount=200, phase='player-bet' | P0 |
| TC-WS-002 | banker_bet 下注超過上限拒絕 | banker_bet | { amount: 600 }（max=500）| error { code:'bet_out_of_range' } | P0 |
| TC-WS-003 | banker_bet 在 player-bet phase 發送拒絕 | banker_bet | phase='player-bet' 時發送 | error { code:'invalid_phase' } | P0 |
| TC-WS-004 | call 合法跟注 | call | {} 在 player-bet phase，本人輪次 | player.bet_amount=banker_bet_amount | P0 |
| TC-WS-005 | call 籌碼不足拒絕 | call | chip_balance < banker_bet_amount | error { code:'insufficient_chips' } | P0 |
| TC-WS-006 | fold 合法棄牌 | fold | {} 在 player-bet phase，本人輪次 | player.is_folded=true, bet_amount=0 | P0 |
| TC-WS-007 | see_cards 莊家查看手牌 | see_cards | {} 在 banker-bet phase，is_banker=true | 發送私人 myHand 訊息 | P1 |
| TC-WS-008 | send_chat 合法訊息 | send_chat | { text: '你好' }（≤200字）| 廣播至房間 | P1 |
| TC-WS-009 | send_chat 超長訊息拒絕 | send_chat | { text: 'x'.repeat(201) } | error | P1 |
| TC-WS-010 | confirm_anti_addiction | confirm_anti_addiction | { type:'adult' } | antiAddiction.onAdultWarningConfirmed 呼叫 | P0 |
| TC-WS-011 | 非當前輪次玩家操作拒絕 | call | 非輪次玩家發送 | error（非本人輪次）| P0 |
| TC-WS-012 | 封號後 WS Close 4001 即時踢出 | Admin ban → Redis Pub/Sub | client.leave(4001) | P0 |

---

### 4.4 REST API Integration Tests

**描述**：對 Express REST API 端點的整合測試（真實 DB + Redis）。

| TC-ID | 描述 | 端點 | 輸入 | 預期回應 | 優先級 |
|-------|------|------|------|---------|--------|
| TC-API-001 | 用戶登入成功 | POST /api/v1/auth/login | { credential: valid } | 200, { access_token, refresh_token } | P0 |
| TC-API-002 | 用戶登入失敗（錯誤憑證）| POST /api/v1/auth/login | { credential: invalid } | 401, { error:'account_not_found' } | P0 |
| TC-API-003 | Refresh Token Rotation | POST /api/v1/auth/refresh | { refresh_token: valid } | 200, 新 access_token 與 refresh_token | P0 |
| TC-API-004 | 取得玩家資料（JWT 驗證）| GET /api/v1/player/me | Authorization: Bearer validJWT | 200, 玩家資料 | P0 |
| TC-API-005 | 取得玩家資料（無 JWT）| GET /api/v1/player/me | 無 Authorization header | 401 | P0 |
| TC-API-006 | 每日籌碼領取（冪等）| POST /api/v1/player/daily-chip | 同一天呼叫兩次 | 第一次 200，第二次 400（已領取）| P0 |
| TC-API-007 | 救援籌碼申請（< 500 籌碼）| POST /api/v1/player/rescue-chip | chip_balance=300 | 200, new_balance=1300 | P0 |
| TC-API-008 | 救援籌碼申請（籌碼足夠拒絕）| POST /api/v1/player/rescue-chip | chip_balance=600 | 403 | P0 |
| TC-API-009 | 排行榜查詢 | GET /api/v1/leaderboard | week=current | 200, 玩家清單（僅 show_in_leaderboard=true）| P0 |
| TC-API-010 | OTP 年齡驗證流程 | POST /api/v1/auth/otp/send + /verify | 有效 OTP | 200, age_verified=true | P0 |
| TC-API-011 | SQL Injection 防護 | POST /api/v1/auth/login | { credential: "'; DROP TABLE users;--" } | 400 或 401，DB 無影響 | P0 |
| TC-API-012 | 封號 API（Admin）| POST /api/v1/admin/player/:id/ban | Admin JWT + player_id | 200, player is_banned=true, Redis key 設定 | P0 |
| TC-API-013 | Rate Limit auth 端點（30/min/IP）| POST /api/v1/auth/login ×31 | 快速連續呼叫 | 第 31 次返回 429 | P0 |
| TC-API-014 | 健康檢查端點 | GET /api/v1/health | 無 | 200 { status:'ok' } | P1 |
| TC-API-015 | 就緒探針（DB + Redis 連線）| GET /api/v1/health/ready | DB/Redis 正常 | 200 | P0 |

---

## 5. E2E Test Plan

**工具**：Jest + Colyseus Client SDK + 真實 Staging 環境  
**執行命令**：`npm run test:e2e`  
**測試目錄**：`tests/e2e/`  
**前提條件**：Staging 環境部署完成，Fixtures 資料已載入

### 5.1 Happy Path：正常遊戲流程

| TC-ID | 描述 | 步驟 | 預期結果 | 優先級 |
|-------|------|------|---------|--------|
| TC-E2E-001 | 新用戶註冊 → 年齡驗證 → 教學 → 進入青銅廳 | register → OTP verify → tutorial → join matchmaking | 成功進入青銅廳遊戲房間 | P0 |
| TC-E2E-002 | 2 人完整一局遊戲 | 2 玩家加入 → 莊家下注 → 閒家 Call → Showdown → 結算 | 籌碼正確增減，phase 依序正確 | P0 |
| TC-E2E-003 | 6 人滿房遊戲 | 6 玩家加入 → 完整一局 | 所有玩家結算正確，輪莊正確 | P0 |
| TC-E2E-004 | 私人房間建立與加入 | POST /rooms/private → 取得 room_code → 其他玩家用 room_code 加入 | 成功建立私人房間，其他玩家正常加入 | P1 |
| TC-E2E-005 | 排行榜查詢正確反映遊戲結果 | 遊戲結束後查詢排行榜 | 本週淨籌碼正確更新（≤ 1min 延遲）| P1 |
| TC-E2E-006 | 每日任務完成流程 | 完成 3 局 → GET /tasks → POST /tasks/:id/complete | 任務標記完成，獎勵發放正確 | P1 |
| TC-E2E-007 | 救援籌碼自動觸發 | 結算後 chip_balance < 500 | Server 自動發送 rescue_chips 通知 + 籌碼更新 | P0 |
| TC-E2E-008 | 斷線重連正常流程 | 遊戲進行中斷線 → 30s 內重連 | 恢復 PlayerState，收到 myHand 私人訊息 | P0 |

---

### 5.2 Edge Cases：邊界情境

| TC-ID | 描述 | 步驟 | 預期結果 | 優先級 |
|-------|------|------|---------|--------|
| TC-E2E-EC-001 | 2 人桌唯一閒家 Fold → all_fold | 1 莊家 + 1 閒家，閒家 fold | all_fold=true, pot=0, rake=0, 莊家 escrow 退回 | P0 |
| TC-E2E-EC-002 | 6 人桌全員 Fold | 5 名閒家全部 fold | all_fold=true, banker escrow 退回 | P0 |
| TC-E2E-EC-003 | 莊家破產先到先得 | 莊家籌碼不足支付所有贏家 | 順時針順序先支付，後者進入 insolvent_winners | P0 |
| TC-E2E-EC-004 | 莊家籌碼 < min_bet 跳過輪莊 | 莊家破產後輪莊 | 跳過破產莊家，下一位符合資格者成為莊家 | P0 |
| TC-E2E-EC-005 | 所有玩家籌碼不足莊家資格 | 全員 chip < min_bet | Room 返回 waiting 狀態 | P1 |
| TC-E2E-EC-006 | 同時多位玩家救援籌碼競態 | 2 玩家同時觸發 rescue chip | DB 原子操作確保只發放一次（冪等）| P0 |
| TC-E2E-EC-007 | 斷線超過 30s 自動 Fold 並繼續遊戲 | 玩家斷線 31s | is_folded=true，遊戲繼續進行 | P0 |
| TC-E2E-EC-008 | 未成年遊玩 2h 後本局結算登出 | 未成年玩家連續 2h | 本局結算完成後 WS Close 4003 | P0 |
| TC-E2E-EC-009 | 多裝置登入踢出舊裝置（Close 4005）| 同帳號從第二裝置登入 | 舊裝置收到 WS Close 4005 | P1 |
| TC-E2E-EC-010 | pot=1 時 rake=1（最小 rake 規則）| 1 名輸家 bet=1 | rake_amount=1（floor(0.05)=0 → min=1）| P0 |
| TC-E2E-EC-011 | Insolvent winner net_chips 必須是 -called_bet | 莊家破產，贏家未獲支付 | net_chips = -called_bet（非 0）| P0 |
| TC-E2E-EC-012 | 教學模式完整 3 局流程 | tutorial_mode=true，完成 R1/R2/R3 | tutorial_completed=true，導向正式遊戲 | P1 |

---

### 5.3 Security Tests：滲透測試場景

| TC-ID | 描述 | 測試方式 | 預期結果 | 優先級 |
|-------|------|---------|---------|--------|
| TC-SEC-001 | JWT 失效後拒絕所有操作 | 使用過期 Access Token 呼叫任何 API | 401 { error:'token_expired' } | P0 |
| TC-SEC-002 | 封號後即時踢出 WS（Close 4001）| Admin ban → 等待 Redis Pub/Sub | 60s 內所有 Active WS 收到 Close 4001 | P0 |
| TC-SEC-003 | SQL Injection 防護（多端點）| Payload: `' OR 1=1; --`、`'; DROP TABLE users;--` | 400/401，DB 無結構變更 | P0 |
| TC-SEC-004 | Rate Limit auth 端點（30/min/IP）| 31 次/min 對 /auth/login | 第 31 次 429 + Retry-After | P0 |
| TC-SEC-005 | Rate Limit WS 訊息（10/s/連線）| 每秒發送 > 10 條 WS 訊息 | 超限訊息被丟棄/返回 rate_limit 錯誤 | P0 |
| TC-SEC-006 | 手牌資訊隔離（Wireshark 測試）| 6 人房間，Wireshark 抓包 | 每位玩家封包僅含自身手牌，無他人手牌 | P0 |
| TC-SEC-007 | Client 無法呼叫 Server-only 模組 | 嘗試 import HandEvaluator 於 Client bundle | CI build 失敗（TypeScript project references 邊界）| P0 |
| TC-SEC-008 | Admin API 非內網拒絕 | 從外部 IP 呼叫 /api/v1/admin/* | 403 或連線拒絕 | P0 |
| TC-SEC-009 | CORS 非允許域名拒絕 | Origin: https://attacker.com | Access-Control-Allow-Origin 不包含攻擊者域名 | P0 |
| TC-SEC-010 | Refresh Token 一次性使用（Rotation）| 使用相同 Refresh Token 兩次 | 第二次返回 401 { error:'token_revoked' } | P0 |
| TC-SEC-011 | 非法操作（非輪次玩家下注）| 非輪次閒家發送 call | error（非法操作）| P0 |
| TC-SEC-012 | 下注金額超出餘額拒絕 | banker_bet > chip_balance | error { code:'insufficient_chips' } | P0 |

---

## 6. Performance Test Plan

**工具**：k6 + @colyseus/loadtest  
**執行命令**：`npm run test:perf`  
**測試目錄**：`tests/performance/`  
**前提條件**：Staging 環境 k8s 部署（≥ 2 Colyseus Pod）

### 6.1 Load Test：500 CCU

**目標**：驗證 NFR-02（P95 WS 延遲 ≤ 100ms，500 CCU）

```javascript
// tests/performance/ws-load.js
import ws from 'k6/ws';
import { check } from 'k6';

export let options = {
  vus: 500,          // 500 Virtual Users = 500 CCU
  duration: '10m',   // 持續 10 分鐘
  thresholds: {
    'ws_connecting': ['p(95)<1000'],       // WS 建立 ≤ 1s
    'ws_msgs_received': ['p(95)<100'],     // 收到訊息 P95 ≤ 100ms
    'ws_session_duration': ['p(95)<15000'], // 會話持續
  },
};
```

| TC-ID | 指標 | 目標值 | 測試持續時間 |
|-------|------|--------|------------|
| TC-PERF-LT-001 | P95 WS 延遲 | ≤ 100ms | 10 分鐘穩態 |
| TC-PERF-LT-002 | P99 WS 延遲 | ≤ 500ms | 10 分鐘穩態 |
| TC-PERF-LT-003 | WebSocket 連線成功率 | ≥ 99.5% | 10 分鐘 |
| TC-PERF-LT-004 | API 錯誤率（5xx） | ≤ 0.1% | 10 分鐘 |
| TC-PERF-LT-005 | 每秒 WS 訊息吞吐量 | ≥ 330 msg/s（估算峰值）| 10 分鐘 |
| TC-PERF-LT-006 | PostgreSQL P95 查詢延遲 | ≤ 50ms | 測試期間監控 |
| TC-PERF-LT-007 | Redis P95 操作延遲 | ≤ 5ms | 測試期間監控 |
| TC-PERF-LT-008 | 記憶體使用量（每 Pod）| ≤ 2Gi | 測試期間監控 |
| TC-PERF-LT-009 | CPU 使用率（每 Pod）| ≤ 70%（HPA 觸發門檻）| 測試期間監控 |

---

### 6.2 Stress Test：逐步增加至失效點

**目標**：找出系統極限，驗證 HPA 自動擴展行為

```javascript
export let options = {
  stages: [
    { duration: '5m', target: 200 },   // 爬升至 200 CCU
    { duration: '5m', target: 500 },   // 爬升至 500 CCU
    { duration: '5m', target: 1000 },  // 爬升至 1,000 CCU
    { duration: '5m', target: 2000 },  // 爬升至 2,000 CCU（目標上限）
    { duration: '5m', target: 0 },     // 冷卻
  ],
};
```

| TC-ID | 場景 | 觀察指標 | 預期行為 | 優先級 |
|-------|------|---------|---------|--------|
| TC-PERF-ST-001 | 200 CCU 穩態 | 延遲、錯誤率 | P95 ≤ 100ms，無錯誤 | P0 |
| TC-PERF-ST-002 | 500 CCU 穩態 | 延遲、錯誤率 | P95 ≤ 100ms，NFR-02 通過 | P0 |
| TC-PERF-ST-003 | 1,000 CCU 壓力測試 | HPA 觸發時機 | CPU > 70% 後 HPA 新增 Pod | P1 |
| TC-PERF-ST-004 | 2,000 CCU 極限測試 | 系統降級行為 | 優雅降級（HTTP 503 + Retry-After），不崩潰 | P1 |
| TC-PERF-ST-005 | 失效點識別 | 錯誤率飆升時的 CCU | 記錄失效 CCU 值，作為容量規劃依據 | P1 |

---

### 6.3 Spike Test：瞬間湧入

**目標**：驗證突發流量下系統穩定性（如遊戲事件、社群擴散）

```javascript
export let options = {
  stages: [
    { duration: '1m', target: 100 },   // 正常負載
    { duration: '30s', target: 800 },  // 瞬間湧入（8x）
    { duration: '3m', target: 800 },   // 維持高峰
    { duration: '1m', target: 100 },   // 回落
  ],
};
```

| TC-ID | 場景 | 觀察指標 | 預期行為 | 優先級 |
|-------|------|---------|---------|--------|
| TC-PERF-SK-001 | 瞬間湧入 800 CCU（30s 內）| 連線成功率、延遲 | 連線成功率 ≥ 95%，延遲可暫時升高 | P1 |
| TC-PERF-SK-002 | HPA 反應時間 | Pod 新增時間 | CPU 超限後 5 分鐘內新 Pod 就緒 | P1 |
| TC-PERF-SK-003 | 流量回落後延遲恢復 | 回落後 P95 延遲 | 恢復至 ≤ 100ms（5 分鐘內）| P1 |

---

### 6.4 Endurance Test：長時間穩定性

**目標**：驗證 SLA 99.5%/月（error budget ≤ 3.65h/月），記憶體洩漏偵測

```javascript
export let options = {
  vus: 300,            // 300 CCU 穩態
  duration: '4h',      // 4 小時耐久測試
};
```

| TC-ID | 場景 | 觀察指標 | 預期行為 | 優先級 |
|-------|------|---------|---------|--------|
| TC-PERF-EN-001 | 4 小時 300 CCU 穩態 | 每小時 P95 延遲、錯誤率 | P95 始終 ≤ 100ms，錯誤率 ≤ 0.5% | P0 |
| TC-PERF-EN-002 | 記憶體洩漏偵測 | 每小時 Pod 記憶體使用量 | 記憶體無持續增長趨勢 | P1 |
| TC-PERF-EN-003 | DB 連線池穩定性 | pgBouncer 連線數 | 保持在 max_client_conn=200 以下 | P0 |
| TC-PERF-EN-004 | Redis 操作穩定性 | Redis P95 延遲 | 始終 ≤ 5ms | P0 |
| TC-PERF-EN-005 | Colyseus Room 洩漏偵測 | 活躍 Room 數量 | 無廢棄 Room 累積（onDispose 正確清理）| P1 |

---

### 6.5 DB Failover Test

**目標**：驗證 NFR-18（PostgreSQL Failover ≤ 5 分鐘）

| TC-ID | 描述 | 步驟 | 預期結果 | 優先級 |
|-------|------|------|---------|--------|
| TC-PERF-DB-001 | Primary DB 強制故障 | 強制終止 PostgreSQL Primary Pod | Replica 在 5min 內提升為 Primary | P0 |
| TC-PERF-DB-002 | Failover 期間 API 降級 | Failover 過程中持續呼叫 API | 短暫 503，Failover 完成後自動恢復 | P0 |
| TC-PERF-DB-003 | 結算事務原子性（Failover 期間）| Failover 時正在進行結算 | 已提交事務完整保存，未提交事務回滾 | P0 |
| TC-PERF-DB-004 | Redis Sentinel Failover | 強制終止 Redis Master | Sentinel ≤ 60s 完成切換 | P0 |
| TC-PERF-DB-005 | 季度 Failover 演練 | 定期演練（每季一次）| 記錄 RTO，確保 ≤ 5min 目標持續達標 | P1 |

---

## 7. UAT（User Acceptance Testing）

**負責人**：QA Lead + Product Owner  
**執行環境**：Staging 環境（接近生產配置）  
**參考文件**：PRD AC（Acceptance Criteria），BRD 業務需求

### 7.1 遊戲核心功能驗收

| UAT-ID | 驗收標準 | PRD 來源 | 驗收方式 | Pass 條件 |
|--------|---------|---------|---------|---------|
| UAT-GC-001 | 三公遊戲規則正確（三公最大，賠率 3x）| REQ-003 | 手動對局驗證 | 三公贏家獲得 3x 賠率 |
| UAT-GC-002 | 9 點賠率 2x，普通點賠率 1x | REQ-003 | 手動對局驗證 | 賠率正確 |
| UAT-GC-003 | 全員棄牌時莊家底注退回 | REQ-003 | 手動操作 all_fold | 莊家籌碼恢復 |
| UAT-GC-004 | 莊家破產先到先得（順時針）| REQ-003 | 設計特定場景 | 後排贏家 net_chips=-called_bet |
| UAT-GC-005 | D8 平局規則（花色 → 牌值）| REQ-003 | 設計同點場景 | 正確判定平局或勝負 |
| UAT-GC-006 | 輪莊機制：順時針，跳過破產 | REQ-001 | 連續 5 局驗證 | 輪莊順序正確 |
| UAT-GC-007 | 廳別進場門檻驗證 | REQ-001 | 籌碼不足嘗試進場 | 拒絕進場，顯示錯誤 |
| UAT-GC-008 | 計時器 30s 超時自動行動 | REQ-001 D11/D12 | 等待超時 | 自動最低下注/自動 Fold |

---

### 7.2 防沉迷功能驗收

| UAT-ID | 驗收標準 | PRD 來源 | 驗收方式 | Pass 條件 |
|--------|---------|---------|---------|---------|
| UAT-AA-001 | 成人連續 2h 顯示提醒彈窗 | REQ-015 AC-1 | 模擬 2h 計時（加速測試）| 彈窗出現，遊戲繼續 |
| UAT-AA-002 | 成人確認提醒後計時重置 | REQ-015 AC-1 | 點擊確認按鈕 | 計時重置，2h 後再次提醒 |
| UAT-AA-003 | 未成年每日 2h 後強制登出 | REQ-015 AC-3 | 模擬 2h（加速測試）| 本局結算後自動登出，顯示下線提示 |
| UAT-AA-004 | 未成年次日 UTC+8 00:00 後可重連 | REQ-015 AC-3 | 次日模擬 | 可正常連線遊戲 |
| UAT-AA-005 | Server 端計時（不信任 Client）| REQ-015 | Client 修改時間 | Server 計時不受影響 |

---

### 7.3 合規功能驗收

| UAT-ID | 驗收標準 | PRD 來源 | 驗收方式 | Pass 條件 |
|--------|---------|---------|---------|---------|
| UAT-CP-001 | 虛擬籌碼不可兌換聲明顯示在 8 個畫面 | REQ-013 AC-5 | 逐一查看畫面 | 8 個畫面均顯示，≥ 12pt 字體 |
| UAT-CP-002 | 新帳號 OTP 年齡驗證（出生年份 + 6 碼 OTP）| REQ-014 | 新帳號流程 | 100% 新帳號需完成年齡驗證 |
| UAT-CP-003 | OTP 3 次錯誤失效 | REQ-014 | 輸入 3 次錯誤 OTP | 第 3 次後 OTP 失效 |
| UAT-CP-004 | Cookie 同意橫幅（首次載入）| REQ-016 | 首次開啟 Web 版 | 顯示 Cookie 同意橫幅 |
| UAT-CP-005 | 帳號刪除 7 工作日內完成 | REQ-019 | 申請刪除帳號 | 7 工作日內收到刪除確認 |
| UAT-CP-006 | 聊天訊息 30 日後自動刪除 | REQ-007 AC-3 | 查詢 30 日前訊息 | 訊息不存在 |

---

### 7.4 社交功能驗收

| UAT-ID | 驗收標準 | PRD 來源 | 驗收方式 | Pass 條件 |
|--------|---------|---------|---------|---------|
| UAT-SO-001 | 房間內聊天（≤ 200 字）| REQ-007 | 發送聊天訊息 | 訊息廣播至房間 |
| UAT-SO-002 | 舉報玩家功能 | REQ-007 | 舉報他人 | 舉報記錄建立，狀態='pending' |
| UAT-SO-003 | 週排行榜顯示（≤ 1min 更新）| REQ-006 | 完成遊戲後查詢排行榜 | 排名在 1min 內更新 |
| UAT-SO-004 | 隱藏排行榜功能 | REQ-006 | 設定 show_in_leaderboard=false | 排行榜不顯示該玩家 |
| UAT-SO-005 | 私人房間（6 位英數 room_code）| REQ-010 | 建立私人房間 | 取得 6 位 room_code |

---

### 7.5 教學功能驗收

| UAT-ID | 驗收標準 | PRD 來源 | 驗收方式 | Pass 條件 |
|--------|---------|---------|---------|---------|
| UAT-TT-001 | 教學 R1：展示三公最高牌型 | REQ-012 AC-5 | 完成教學 R1 | 正確顯示三公說明 |
| UAT-TT-002 | 教學 R2：展示普通比點 | REQ-012 AC-5 | 完成教學 R2 | 正確顯示 5pt > 3pt |
| UAT-TT-003 | 教學 R3：展示平局概念 | REQ-012 AC-5 | 完成教學 R3 | 正確顯示平局情境 |
| UAT-TT-004 | 教學完成後 tutorial_completed=true | REQ-012 | 完成 3 局教學 | DB 更新 tutorial_completed=true |
| UAT-TT-005 | 教學模式不可進入正式廳別 | REQ-012 | tutorial_mode=true 嘗試進入青銅廳 | 拒絕，引導完成教學 |

---

## 8. Test Environment

### 8.1 docker-compose.test.yml

```yaml
# tests/docker-compose.test.yml
version: '3.9'

services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: sam_gong_test
      POSTGRES_USER: test_user
      POSTGRES_PASSWORD: test_password
    ports:
      - "5433:5432"  # 避免與 local dev DB 衝突
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test_user -d sam_gong_test"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"  # 避免與 local Redis 衝突
    command: redis-server --save "" --appendonly no  # 測試環境無需持久化
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

  colyseus-test:
    build:
      context: ../server
      dockerfile: Dockerfile.test
    environment:
      NODE_ENV: test
      DATABASE_URL: postgresql://test_user:test_password@postgres-test:5432/sam_gong_test
      REDIS_URL: redis://redis-test:6379
      JWT_PRIVATE_KEY: ${TEST_JWT_PRIVATE_KEY}
      JWT_PUBLIC_KEY: ${TEST_JWT_PUBLIC_KEY}
      TEST_OTP_BYPASS_CODE: "123456"
    depends_on:
      postgres-test:
        condition: service_healthy
      redis-test:
        condition: service_healthy
    ports:
      - "2568:2567"  # Colyseus WS（測試端口）
      - "3002:3000"  # REST API（測試端口）
```

### 8.2 測試資料庫管理

**Schema 遷移**：測試前執行 `npm run db:migrate:test`（node-pg-migrate + 測試 DB）  
**資料清理**：每個 describe block 的 afterEach 執行 TRUNCATE（保留 Schema，清空資料）  
**Fixtures 腳本**：

```typescript
// tests/fixtures/seed.ts
export async function seedTestData(db: Pool) {
  // 基本測試帳號
  await db.query(`
    INSERT INTO users (id, display_name, chip_balance, age_verified, is_minor)
    VALUES
      ('test-player-1', '測試玩家1', 50000, true, false),
      ('test-player-2', '測試玩家2', 50000, true, false),
      ('test-minor-1', '未成年玩家', 10000, true, true),
      ('test-banker-1', '測試莊家', 100000, true, false)
    ON CONFLICT (id) DO UPDATE SET chip_balance = EXCLUDED.chip_balance;
  `);
}

export async function cleanupTestData(db: Pool) {
  await db.query(`TRUNCATE chip_transactions, game_sessions, game_rooms,
                           daily_tasks, leaderboard_weekly, player_reports,
                           chat_messages, refresh_tokens RESTART IDENTITY CASCADE`);
}
```

### 8.3 環境變數（測試環境）

```bash
# .env.test
NODE_ENV=test
DATABASE_URL=postgresql://test_user:test_password@localhost:5433/sam_gong_test
REDIS_URL=redis://localhost:6380
TEST_OTP_BYPASS_CODE=123456
JWT_PRIVATE_KEY=<test RSA private key>
JWT_PUBLIC_KEY=<test RSA public key>
SYSTEM_ACCOUNT_UUID=00000000-0000-0000-0000-000000000001
RESCUE_CHIP_THRESHOLD=500
RESCUE_CHIP_AMOUNT=1000
```

### 8.4 Mock 策略詳細配置

| 依賴 | 單元測試 Mock | 整合測試 Mock |
|------|-------------|-------------|
| Redis | `ioredis-mock` npm 套件 | 真實 Redis 容器（docker-compose.test.yml）|
| PostgreSQL | `pg-mem` npm 套件（in-memory）| `testcontainers` 真實 PostgreSQL 容器 |
| OTP SMS | 環境變數 `TEST_OTP_BYPASS_CODE=123456` | 同左（固定繞過碼）|
| JWT 公私鑰 | 測試專用 RSA 2048-bit Key Pair（不用於生產）| 同左 |
| AWS KMS | Jest mock（`jest.mock('aws-sdk')`）| 同左 |
| Colyseus Client | `@colyseus/testing` ColyseusTestServer | 真實 Staging Colyseus Server |

---

## 9. Test Coverage Requirements

### 9.1 覆蓋率目標

| 模組 | 目標覆蓋率 | 測試案例數（最低）|
|------|-----------|--------------|
| HandEvaluator.ts | ≥ 90% | ≥ 200 個測試向量 |
| SettlementEngine.ts | ≥ 90% | ≥ 50 個測試案例 |
| BankerRotation.ts | ≥ 85% | ≥ 20 個測試案例 |
| AntiAddictionManager.ts | ≥ 85% | ≥ 20 個測試案例 |
| TutorialScriptEngine.ts | ≥ 80% | ≥ 10 個測試案例 |
| DeckManager.ts | ≥ 80% | ≥ 10 個測試案例 |
| REST API Endpoints | ≥ 80% | 全端點覆蓋 |
| SamGongRoom.ts | ≥ 80% | 整合測試覆蓋 |
| **整體覆蓋率** | **≥ 80%（lines/branches/functions）** | CI 門控 |

### 9.2 CI 門控設定

```json
// jest.config.ts
{
  "coverageThreshold": {
    "global": {
      "lines": 80,
      "branches": 80,
      "functions": 80,
      "statements": 80
    },
    "./server/src/game/HandEvaluator.ts": {
      "lines": 90,
      "branches": 90,
      "functions": 90
    },
    "./server/src/game/SettlementEngine.ts": {
      "lines": 90,
      "branches": 90,
      "functions": 90
    }
  }
}
```

### 9.3 CI Pipeline 測試階段

```yaml
# .github/workflows/ci.yml 測試相關步驟

jobs:
  test:
    runs-on: ubuntu-22.04
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_DB: sam_gong_test, POSTGRES_USER: test, POSTGRES_PASSWORD: test }
        options: --health-cmd pg_isready
      redis:
        image: redis:7
        options: --health-cmd "redis-cli ping"

    steps:
      - name: Lint（含 Client bundle 關鍵字掃描）
        run: npm run lint

      - name: TypeScript 型別檢查
        run: npm run type-check

      - name: Unit Tests（含覆蓋率）
        run: npm run test:unit -- --coverage

      - name: Integration Tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/sam_gong_test
          REDIS_URL: redis://localhost:6379

      - name: 覆蓋率上傳（Codecov）
        uses: codecov/codecov-action@v3

      - name: Semgrep SAST（含 SQL Injection 規則）
        run: semgrep --config rules/sql-injection.yaml --config p/security-audit

      - name: HandEvaluator 向量數驗證（≥ 200）
        run: node scripts/verify-test-vectors.js
```

### 9.4 測試覆蓋率排除項目

下列項目不計入覆蓋率要求（排除理由：純配置、型別定義、生成代碼）：

```
// jest.config.ts coveragePathIgnorePatterns
[
  "node_modules",
  "tests/",
  "src/types/",         // TypeScript 型別定義文件
  "src/config/",        // 純配置檔案
  "src/migrations/",    // DB Migration 腳本
  "src/seeds/",         // 測試資料 Seed
]
```

---

## 10. Test Schedule & Milestones

### 10.1 測試時程

| 里程碑 | 日期 | 負責人 | 完成條件 |
|--------|------|--------|---------|
| 單元測試框架建立 | 2026-05-01 | Dev Team | Jest + ts-jest 設定完成，HandEvaluator ≥ 50 向量 |
| HandEvaluator 200 向量完成 | 2026-06-21 | QA + Dev | ≥ 200 測試向量通過，CI 驗證 |
| Integration Test 完成 | 2026-06-30 | QA | Room 生命週期 + REST API 整合測試通過 |
| E2E 測試完成（Happy Path）| 2026-07-15 | QA | 所有 Happy Path 場景通過 |
| E2E 測試完成（Edge Cases）| 2026-07-21 | QA | 所有邊界條件場景通過 |
| 效能測試（500 CCU）通過 | 2026-07-28 | QA + DevOps | P95 ≤ 100ms 驗證通過 |
| 滲透測試 | 2026-08-01 | Security Team | 無高危漏洞，報告完成 |
| UAT 完成 | 2026-08-14 | QA + PM + PO | 所有 UAT 場景通過，PO 簽署 |
| **GA 上線** | **2026-08-21** | All | 所有里程碑通過 |

### 10.2 測試里程碑 Pass 條件

| 階段 | Pass 條件 |
|------|---------|
| Alpha（2026-06-21）| Unit Tests 全通過；覆蓋率 ≥ 80%；HandEvaluator ≥ 200 向量 |
| Beta（2026-07-28）| Integration + E2E 全通過；效能 500 CCU P95 ≤ 100ms 通過 |
| Release Candidate（2026-08-14）| 滲透測試完成（無高危）；UAT 全通過；SLA 指標驗證 |
| GA（2026-08-21）| 所有測試通過；Production Smoke Test 通過；監控告警設定完成 |

### 10.3 測試退出條件（Exit Criteria）

以下任一情況發生，暫停測試並通知開發：

1. P0 優先級測試案例失敗（不允許帶已知 P0 缺陷上線）
2. 覆蓋率低於 80%（阻擋 PR 合併）
3. 效能測試 P95 > 100ms（需效能優化後重測）
4. 籌碼守恆驗證失敗（sum(net_chips) + rake ≠ 0）
5. 安全測試：SQL Injection 或手牌洩漏測試失敗

---

## Appendix A：測試工具版本清單

| 工具 | 版本 | 用途 |
|------|------|------|
| Jest | 29.x | 單元測試 + 整合測試框架 |
| ts-jest | 29.x | TypeScript 支援 |
| @colyseus/testing | 0.15.x | Colyseus Room 測試 |
| @colyseus/loadtest | 0.15.x | Room 吞吐量測試 |
| k6 | 0.50.x | WebSocket/HTTP 效能測試 |
| testcontainers | 3.x | 整合測試 DB/Redis 容器 |
| ioredis-mock | 8.x | Redis Mock（單元測試）|
| pg-mem | 2.x | PostgreSQL in-memory（單元測試）|
| Semgrep | 1.x | SAST 靜態分析（CI）|
| Playwright | 1.x | E2E UI 測試（Client 端）|

---

## Appendix B：關鍵測試向量（HandEvaluator 精選）

以下為 200+ 測試向量集的代表性樣本（完整向量集位於 `tests/fixtures/hand-evaluator-vectors.json`）：

```typescript
// tests/fixtures/hand-evaluator-vectors.ts
export const HAND_EVALUATOR_VECTORS = [
  // 三公（Sam Gong）— 所有組合（J/Q/K/10 各 4 花色）
  { cards: [{suit:'spade',value:'J'},{suit:'heart',value:'Q'},{suit:'diamond',value:'K'}],
    expected: { points:0, is_sam_gong:true, hand_type:'sam_gong' }},
  { cards: [{suit:'club',value:'10'},{suit:'spade',value:'Q'},{suit:'heart',value:'K'}],
    expected: { points:0, is_sam_gong:true, hand_type:'sam_gong' }},
  // 9點
  { cards: [{suit:'spade',value:'9'},{suit:'heart',value:'K'},{suit:'diamond',value:'J'}],
    expected: { points:9, is_sam_gong:false, hand_type:'9' }},
  { cards: [{suit:'spade',value:'A'},{suit:'heart',value:'8'},{suit:'diamond',value:'K'}],
    expected: { points:9, is_sam_gong:false, hand_type:'9' }},
  // 8點
  { cards: [{suit:'spade',value:'8'},{suit:'heart',value:'K'},{suit:'diamond',value:'J'}],
    expected: { points:8, is_sam_gong:false, hand_type:'8' }},
  // ... 完整 200 個向量見 tests/fixtures/hand-evaluator-vectors.json
];
```

---

*文件生成：/devsop-autodev STEP-14（2026-04-22）*  
*下次審查：Alpha 測試完成後（2026-06-21）*
