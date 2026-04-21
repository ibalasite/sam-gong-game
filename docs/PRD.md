# PRD — 三公遊戲（Sam Gong 3-Card Poker）即時多人線上平台

<!-- SDLC Requirements Engineering — Layer 2：Product Requirements -->

---

## Document Control

| 欄位 | 內容 |
|------|------|
| **DOC-ID** | PRD-SAM-GONG-GAME-20260421 |
| **專案名稱** | 三公遊戲（Sam Gong 3-Card Poker）即時多人線上平台 |
| **文件版本** | v0.2-draft |
| **狀態** | DRAFT |
| **作者** | Evans Tseng（由 /devsop-autodev STEP-03 自動生成） |
| **日期** | 2026-04-21 |
| **來源 BRD** | BRD-SAM-GONG-GAME-20260421 v0.12-draft |
| **建立方式** | /devsop-autodev STEP-03 自動生成 |

---

## Change Log

| 版本 | 日期 | 作者 | 變更摘要 |
|------|------|------|---------|
| v0.1-draft | 2026-04-21 | /devsop-autodev STEP-03 | 初稿，依 BRD v0.12-draft 自動生成；包含 REQ-001~REQ-016 + REQ-020 規格、遊戲規則實作規格、NFR-01~NFR-14、合規需求、錯誤處理、資料模型、API 端點高層次設計 |
| v0.2-draft | 2026-04-21 | STEP-04 Review Round 1 | 17個問題修正（REQ-004 AC-3破產算法、REQ-013動畫時長矛盾、莊家機制補齊、REQ-021新增、REQ-012矛盾消除、NFR優先度、好友系統DEFERRED等）|

---

## 1. Overview & Objectives

### 1.1 Product Vision

打造華人市場首款 **Server-Authoritative 即時多人三公遊戲**，以「絕對公平」為核心差異化，讓 35–55 歲華人玩家能跨平台（Web + Android + iOS）安心享受公平、流暢的三公對戰體驗，不再擔心發牌不公或對手作弊。

### 1.2 Link to BRD Objectives

| 目標 ID | 目標描述 | PRD 對應 REQ |
|--------|---------|------------|
| **O1** | 推出 Server-authoritative 公平三公多人遊戲；GA 目標 **2026-08-21**；Server 權威計算率 100%，Client 無任何結果計算邏輯 | REQ-001, REQ-002, REQ-003, REQ-004, REQ-013 |
| **O2** | 建立穩定同時在線（CCU）基礎；Peak CCU ≥ 500，DAU ≥ 2,000（**≤ 2027-02-21**） | REQ-010, REQ-011, REQ-012, REQ-014 |
| **O3** | 建立虛擬籌碼變現模式（依法律意見書 2026-05-15 決定）；付費率 ≥ 3%（**≤ 2027-05-21**） | REQ-020 |
| **O4** | 擴展遊戲品類（大老二、21 點等）；至少 1 個新品類上線（**≤ 2027-08-21**） | 未來 PRD v2 |

### 1.3 Success Metrics（來源 BRD §7）

**北極星指標（North Star）：**  
週活躍對戰場次（Weekly Active Rounds）— Launch+6M 目標：**≥ 50,000 場/週**

| 指標類別 | 指標 | 目標值 | 量測時間點 |
|---------|------|--------|----------|
| 公平性信任 | NPS「認為遊戲公平」題目 | ≥ 70 | Launch+3M（2026-11-21） |
| 留存 | 7 日留存率 | ≥ 35% | Launch+6M（2027-02-21） |
| 規模 | Peak CCU | ≥ 500 | Launch+6M（2027-02-21） |
| 規模 | DAU | ≥ 2,000 | Launch+6M（2027-02-21） |
| 變現 | 付費率（IAP 模式） | ≥ 3% | Launch+9M（2027-05-21） |
| 新手 | 新手引導完成率 | ≥ 60% | Launch+1M（2026-09-21） |
| 每日任務 | 每日任務完成率 | ≥ 40% DAU | Launch+3M（2026-11-21） |
| 防作弊 | 投訴作弊率 | ≤ 0.1% | 持續量測 |

**Go / No-Go 里程碑：**

| 里程碑 | 日期 | Go 條件 |
|--------|------|---------|
| Alpha 驗收 | 2026-06-21 | 核心玩法完整、P0 Bug = 0、洗牌通過亂度測試 |
| Beta 驗收 | 2026-07-21 | 7 日留存 ≥ 25%、公平性評分 ≥ 4/5 |
| GA 決策 | 2026-08-21 | 負載測試 500 CCU 通過、合規審查完成 |
| Post-Launch 3M | 2026-11-21 | DAU ≥ 1,000、付費率 ≥ 1%、NPS ≥ 70 |
| Post-Launch 6M | 2027-02-21 | Peak CCU ≥ 500、DAU ≥ 2,000、7 日留存 ≥ 35% |

---

## 2. User Personas

### Persona 1：Casual Player（休閒玩家）

| 項目 | 內容 |
|------|------|
| **代表人物** | 張先生，45 歲，台灣中南部，上班族 |
| **Demographics** | 35–55 歲、華人、有傳統三公聚會經驗、手機使用者、中等數位素養 |
| **Goals** | 下班後或週末輕鬆打幾局三公；懷念線下聚會的感覺；不想花太多時間學習新規則 |
| **Pain Points** | 擔心既有 App 作弊或發牌不公；既有 App 美術簡陋；找不到隨時可組局的朋友；線下受時間地點限制 |
| **Key Scenarios** | (1) 打開 App 點「快速配對」，30 秒內進入牌局；(2) 在 Web 瀏覽器直接遊玩，不需下載；(3) 完成新手引導了解三公規則後，信心地投入正式對戰 |

### Persona 2：Competitive Player（競技玩家）

| 項目 | 內容 |
|------|------|
| **代表人物** | 林小姐，28 歲，台北，科技業工程師 |
| **Demographics** | 25–34 歲、有多人遊戲經驗、重視勝負、喜歡排行榜與成就系統 |
| **Goals** | 累積籌碼晉升鑽石廳；登上週榜前三名；找到穩定的對手群體 |
| **Pain Points** | 配對等待時間長、對手程度差距太大；遊戲無競技深度或進度感；擔心遊戲系統不公平削弱策略價值 |
| **Key Scenarios** | (1) 在鑽石廳（≥ 10,000,000 籌碼）與同等級玩家對戰；(2) 查看週榜排名追蹤進度；(3) 挑戰莊家位置積累高額籌碼 |

### Persona 3：Returning Player（回歸玩家）

| 項目 | 內容 |
|------|------|
| **代表人物** | 王伯伯，52 歲，海外華人（馬來西亞），退休人士 |
| **Demographics** | 45–60 歲、海外華人社群、有三公文化背景、碎片時間多、社交需求高 |
| **Goals** | 與線上同鄉社群維持社交連結；隨時隨地享受熟悉的三公玩法；不因長期未登入而失去遊戲進度 |
| **Pain Points** | 玩了幾局後因零餘額無法繼續；教學流程太複雜或沒有教學；長時間未登入後忘記操作流程 |
| **Key Scenarios** | (1) 超過 7 日未登入，重新登入後收到每日贈送籌碼（最新一次，不補發）；(2) 餘額低於 500 籌碼時收到救濟籌碼（1,000 籌碼/日）；(3) 透過私人房間 ID 功能加入朋友指定的房間（需朋友分享 Room ID，見 REQ-010 AC-4 私人房間） |

---

## 3. Feature Specifications（REQ-001 to REQ-020）

---

### REQ-001：洗牌系統（Fisher-Yates shuffle，Server-side）

**Feature Name：** Server 端 Fisher-Yates 亂數洗牌

**User Story：**  
As a **Casual Player**（張先生）, I want the game deck to be shuffled on the server using a cryptographically unbiased algorithm so that I can trust no one—including the developers—can predict or manipulate card order.

**Acceptance Criteria：**

1. Server 以 Fisher-Yates（Knuth shuffle）演算法執行 52 張牌的洗牌；洗牌過程完全發生於 Server 端，Client 不接收任何洗牌種子或中間結果。
2. 洗牌亂度統計驗證（BRD F19）：樣本數 ≥ 10,000 次洗牌，對 52 張牌 × 52 個位置分佈進行卡方檢定（自由度 = 51），p-value > 0.05 為通過；此測試必須在 Alpha 驗收（2026-06-21）前完成，結果記入測試報告。
3. Client bundle 靜態代碼分析掃描（CI/CD 每次 build 執行）中，以下關鍵字命中數必須為 0：`compareCards`、`calculatePoints`、`determineWinner`、`cardValue`、`handRank`；工具：ESLint custom rule 或 grep；掃描 0 命中為 Pass。
4. 每次洗牌使用加密安全亂數源（如 Node.js `crypto.randomInt()`），不使用 `Math.random()`。測試方法：(a) CI/CD 靜態掃描禁止關鍵字包含 Math.random（可納入 AC-3 掃描清單）；(b) Server 單元測試 mock crypto 模組，驗證呼叫路徑使用 crypto.randomInt()；Pass 條件：掃描 0 命中 + 單元測試通過。

**Out of Scope：**
- Client 端洗牌邏輯（明確禁止）。
- 可驗證亂數（VRF）或可公開審計的鏈上洗牌（列入 v1.x 研究）。
- 洗牌種子日誌對外公開（v1.0 僅記錄於 Server DB，不對外開放）。

**Dependencies：** REQ-002（洗牌結果直接輸入發牌系統）

**Priority：** Must Have

---

### REQ-002：發牌系統（Server deals 3 cards to each player）

**Feature Name：** Server 端發牌與手牌狀態管理

**User Story：**  
As a **Casual Player**, I want the server to deal exactly 3 face-down cards to each player after shuffling so that my hand is secret until the showdown phase.

**Acceptance Criteria：**

1. 每局牌局開始後，Server 從已洗牌的 52 張牌中按座位順序依次發給每位玩家 3 張牌；發牌邏輯完全在 Server 執行，Client 僅接收「手牌已發」的狀態通知，不接收其他玩家的手牌內容。
2. 玩家在翻牌（Step 4）前，只能透過 Colyseus Room State 看到自己的 3 張手牌；其他玩家的手牌以「暗牌」狀態呈現（Client 無法從 Schema 推算其他玩家手牌）。
3. 每局所用牌數 = 玩家人數 × 3；一副 52 張牌不重複發牌（不放回抽樣）；任何重複牌出現視為嚴重 Bug（P0 級）。
4. 發牌完成後，Room State 更新至所有 Client 的延遲 ≤ 100ms（P95，亞太區用戶）。測試規格：工具 k6 或 Colyseus load test；測試環境：亞太區模擬（EC2 ap-northeast-1）；負載：500 CCU 持續 10 分鐘；樣本數 ≥ 10,000 次操作；通過條件：P95 ≤ 100ms 且 P99 < 500ms。

**Out of Scope：**
- 公牌（Community Card）機制（v1.0 不實作，見 BRD §5.5 公牌規則決策）。
- 多副牌（Shoe）機制。
- Client 端的發牌動畫邏輯（動畫屬 REQ-013 範圍）。

**Dependencies：** REQ-001（需洗牌完成）、REQ-011（Room State schema 同步）

**Priority：** Must Have

---

### REQ-003：比牌系統（Server evaluates hands per §5.5 rules）

**Feature Name：** Server 端三公比牌引擎

**User Story：**  
As a **Competitive Player**（林小姐）, I want the server to evaluate all hands according to the official Taiwan Sam Gong rules so that the winner is determined fairly and transparently, without any possibility of client-side manipulation.

**Acceptance Criteria：**

1. Server 比牌邏輯完全依照 BRD §5.5 台灣標準版規則：三張牌點數相加 mod 10；A=1，2–9 面值，10/J/Q/K=0；三公（三張均為 10 點牌）為最大牌型；比牌順序：三公 > 9 點 > 8 點 > … > 1 點 > 0 點（非三公）。
2. 同點數平手決勝規則（D8）實作：第一步比最大單張花色（黑桃 > 紅心 > 方塊 > 梅花）；花色相同時第二步比最大單張點數（K > Q > J > 10 > 9 > … > 2 > A，A 為最小）；兩步皆同則平手退注；此規則適用於所有同點情境包含三公 vs 三公（D10）。
3. 100 局牌局的比牌結果，與依 §5.5 規則進行的手動驗算一致率 = 100%；此驗收必須在 Alpha（2026-06-21）前完成。
4. 比牌計算不使用浮點運算，全程整數運算，誤差容忍 = 0。

**Out of Scope：**
- Client 端任何比牌計算邏輯（明確禁止）。
- 地區性公牌規則（v1.0 不實作）。
- AI 對手（v1.0 僅真人 vs 真人）。

**Dependencies：** REQ-002（需手牌資料）、REQ-001（間接依賴）

**Priority：** Must Have

---

### REQ-004：結算系統（Settlement per §5.5 payout model，rake 5%）

**Feature Name：** Server 端三步驟結算引擎（含抽水）

**User Story：**  
As a **Casual Player**, I want the server to automatically calculate and distribute chips after each round according to the payout table so that I always receive the correct amount without disputes.

**Acceptance Criteria：**

1. 結算依 §5.5 三步驟原子性執行：Step 6a 確認每位閒家比牌結果；Step 6b 從輸家閒家下注額加總中扣除 5% 抽水（`floor(輸家下注額加總 × 0.05)`，最少 1 籌碼）；Step 6c 依序支付（閒家勝：莊家直接支付本金 1× + N× 賠率，不經底池；閒家敗：閒家下注額歸底池扣抽水後給莊家）。
2. 籌碼守恆驗證：每局結算後，全體玩家籌碼淨增減之和必須等於 `-(抽水額)`；誤差容忍 = 0 籌碼；Server 在每局結算後自動執行此驗證，若違反則記錄嚴重警告（CRITICAL log）並通知 SRE。
3. 莊家破產規則（D13）：若莊家籌碼不足以支付所有贏家，依閒家順時鐘順序逐一結算；依順時鐘先到先得：莊家籌碼耗盡後，後續排隊的贏家閒家各取剩餘可用籌碼，直至歸零；無法取得賠率的後順位贏家僅取回其本金（若莊家仍有餘額）或按比例分配剩餘（當剩餘額不足歸還所有本金時）；抽水按實際結算金額比例扣除。
4. 結算完成後，Server 在 100ms 內廣播最終狀態至所有 Client，包含每位玩家的籌碼變動明細。測試規格：工具 k6 或 Colyseus load test；測試環境：亞太區模擬（EC2 ap-northeast-1）；負載：500 CCU 持續 10 分鐘；樣本數 ≥ 10,000 次操作；通過條件：P95 ≤ 100ms 且 P99 < 500ms。

**Payout Table（台灣標準版）：**

| 牌型 | 閒家勝賠率（N×）| 閒家總取回 |
|------|--------------|----------|
| 三公（三張 10 點牌） | 1:3（N=3） | (1+3)× = 4× 下注額 |
| 9 點 | 1:2（N=2） | (1+2)× = 3× 下注額 |
| 8 點以下 | 1:1（N=1） | (1+1)× = 2× 下注額 |
| 平手 | 退注（N=0） | 退回下注額 |

**Out of Scope：**
- 真實金錢結算（明確禁止）。
- 籌碼兌換（明確禁止）。
- 客服手動調籌碼（屬後台 Admin 工具，不在 v1.0 PRD 範圍）。

**Dependencies：** REQ-003（需比牌結果）、REQ-011（Room State 廣播）

**Priority：** Must Have

---

### REQ-010：配對系統（Matchmaking queue + room creation）

**Feature Name：** 大廳 Matchmaking 配對系統

**User Story：**  
As a **Casual Player**, I want to quickly join a game through fast matchmaking or create a private room so that I can start playing within 30 seconds without manually searching for opponents.

**Acceptance Criteria：**

1. 快速配對（Quick Match）：依玩家持有籌碼量自動匹配相近等級的對手；配對成功後自動進入 Room；等待時間中位數 ≤ 30 秒（500 CCU 壓測環境）；配對失敗率 ≤ 5%。
2. 快速配對等待超過 **60 秒**自動取消，通知玩家「配對超時，請稍後再試」，並將玩家保留在大廳頁面。
3. 每房間人數：最少 2 人、最多 6 人；房間人數不足 2 人時停止接受新局；系統等待新玩家補入，等待上限 60 秒；60 秒內無新玩家加入則自動解散房間，並向剩餘玩家發送通知「房間已解散，請重新匹配」，玩家不損失本局下注額（本局未完成，下注退回）；所有玩家離開後房間立即銷毀。
4. 指定房間（Private Room）：玩家可建立並分享房間 ID 邀請特定玩家加入；房間建立後 60 秒內無人加入自動解散。
5. 中途跌破入場門檻的玩家，在當局結算後自動移出至大廳，不影響進行中的牌局（見 §5.4）。

**Out of Scope：**
- 觀戰模式（v1.0 明確排除）。
- 好友列表自動配對房間推薦（屬好友系統 Should Have）。
- 跨區伺服器配對（首版僅亞太區）。

**Dependencies：** REQ-011（Room State）、REQ-014（帳號系統，需知玩家籌碼等級）

**Priority：** Must Have

---

### REQ-011：房間狀態系統（Colyseus Room State schema sync）

**Feature Name：** Colyseus Room State 即時狀態同步

**User Story：**  
As a **Competitive Player**, I want the game room state (player seats, chip counts, betting phase, card phase) to be synchronized in real-time so that I always see an accurate, up-to-date view of the game.

**Acceptance Criteria：**

1. Room State 使用 `@colyseus/schema` 定義，包含：玩家列表（seat index、玩家 ID、籌碼餘額、本局下注額、連線狀態）、牌局階段（waiting / dealing / banker-bet / player-bet / showdown / settle）、自己的手牌（僅己方可見）、計時器剩餘秒數。
2. 玩家操作（下注、棄牌）至 Server 確認並廣播更新的端對端延遲 ≤ 100ms（P95，亞太區）。測試規格：工具 k6 或 Colyseus load test；測試環境：亞太區模擬（EC2 ap-northeast-1）；負載：500 CCU 持續 10 分鐘；樣本數 ≥ 10,000 次操作；通過條件：P95 ≤ 100ms 且 P99 < 500ms。
3. 斷線重連行為（BRD §5.3）：玩家斷線後有 30 秒重連窗口；30 秒內重連後，Room State 完整恢復（手牌、籌碼、本局下注額與 Server 記錄完全一致，差異容忍 = 0）；30 秒內重連成功率 = 100%（執行 100 次模擬測試驗證）；逾時未重連自動視為 Fold。
4. WebSocket 心跳：ping/pong 心跳間隔 ≤ 10 秒；客戶端斷線後自動重連最多 3 次（退避：1/2/4 秒）；超過 30 秒斷線觸發 §5.5 斷線行為處理。

**Out of Scope：**
- 觀戰者 Schema（v1.0 不實作）。
- Server-sent Events / REST polling 替代 WebSocket（本系統使用 Colyseus WebSocket）。

**Dependencies：** REQ-001, REQ-002, REQ-003, REQ-004（所有遊戲邏輯均透過 Room State 廣播）

**Priority：** Must Have

---

### REQ-012：新手引導系統（Tutorial with practice game，tutorial_mode=true）

**Feature Name：** 互動式新手引導教學

**User Story：**  
As a **Returning Player**（王伯伯）, I want a guided tutorial that teaches Sam Gong rules and lets me practice a simulated hand so that I can confidently join real games without fear of making mistakes.

**Acceptance Criteria：**

1. 首次登入帳號自動觸發新手引導流程；引導包含：(a) 三公規則說明（文字 + 圖示）、(b) 籌碼系統說明（等級、房間、每日贈送）、(c) 第一局模擬牌局（不消耗籌碼）；完成全部三個步驟後解鎖正式對戰入口。
2. 模擬牌局邏輯由 Server 執行（`tutorial_mode=true`），籌碼扣除邏輯跳過；Client 呈現的動畫流程與正式牌局相同（Server-authoritative 路徑），不繞過 Server 驗證。
3. 新手引導完成率 ≥ 60%（量測時間點：Launch+1M 即 2026-09-21；分母為當月首次登入帳號數；分子為完成全部引導步驟的帳號數）。
4. AC-4a: 重複觀看引導教學說明步驟（規則說明文字）：玩家可在帳號設定頁重新觀看，任何時候可跳過說明文字頁面。
AC-4b: 模擬牌局（不消耗籌碼）：僅在首次進入帳號時必須完成（不可跳過）；後續可隨時從設定頁重新體驗但非強制；首次完成後解鎖正式對戰入口。
AC-4c: 測試方法：新帳號進入 App 後，在未完成模擬牌局前，正式對戰入口 UI 處於 disabled 狀態，點擊顯示提示「請先完成新手引導」。

**Out of Scope：**
- AI 對戰模式（Tutorial 模擬牌局為 Server 生成劇本，非真實 AI 對手）。
- 多語系引導（v1.0 僅繁體中文）。

**Dependencies：** REQ-011（Room State，tutorial_mode Room）、REQ-014（帳號系統，首次登入判斷）

**Priority：** Must Have

---

### REQ-013：UI / 動畫系統（Pixel-art UI，deal / flip / settle animations）

**Feature Name：** Cocos Creator 像素風 UI 與牌局動畫

**User Story：**  
As a **Casual Player**, I want to see smooth card dealing, flip, and settlement animations in a retro pixel-art casino style so that the game feels polished and exciting rather than sterile.

**Acceptance Criteria：**

1. 主要美術風格：像素風（Pixel-art）為 v1.0 正式版風格；賭場風格僅製作大廳主頁、牌局主畫面、結算畫面共 2–3 個關鍵畫面的 A/B 測試素材（供 Beta 封測用，最終風格選擇於 2026-07-21 前由 PM + Art Director 依測試數據決定）。
2. 必要動畫列表及時長限制：各動畫時長預算：發牌動畫 ≤ 1.5 秒；翻牌動畫 ≤ 0.5 秒（每張）；結算動畫 ≤ 1 秒；三段合計 ≤ 3 秒。動畫播放期間不阻塞玩家操作計時器（計時器在 Server 端繼續倒數）。通過條件：自動化測試錄製各動畫段時長，每段不超標且合計 ≤ 3 秒。
3. 動畫流暢度：在中低階 Android 裝置（以 Android 8.0、2GB RAM 為基準機型）上達到 ≥ 30fps；旗艦機型目標 ≥ 60fps。
4. UI 響應式設計：移動端最小螢幕寬度 375px（iPhone SE）無任何 UI 元素重疊或截斷；Beta 封測視覺滿意度（in-app 5 星問卷「您對本遊戲視覺風格的滿意度」）有效樣本 ≥ 50 人，平均評分 ≥ 4.0/5.0。

**Out of Scope：**
- 3D 動畫或特效（v1.0 為 2D 像素風）。
- 觀戰視圖動畫（v1.0 不實作）。
- 英文 / 簡中 UI 文字（v1.0 僅繁體中文）。

**Dependencies：** REQ-011（Room State 狀態驅動動畫觸發）

**Priority：** Must Have

---

### REQ-014：帳號系統（Guest + Google / Facebook OAuth，age verification OTP）

**Feature Name：** 帳號系統（遊客 + OAuth + 年齡驗證）

**User Story：**  
As a **Casual Player**, I want to quickly start playing as a guest and later link my Google or Facebook account so that I don't lose my progress, while also confirming I'm an adult before joining real games.

**Acceptance Criteria：**

1. 遊客帳號：玩家可不登入直接進入教學模式；正式對戰需完成帳號創建 + 年齡驗證；遊客轉正式帳號流程 ≤ 3 步驟（填入資料 → OTP 驗證 → 完成）。
2. OAuth 綁定：支援 Google OAuth 2.0 與 Facebook Login；綁定後現有虛擬籌碼與進度保留；一個 OAuth 帳號最多綁定 1 個遊戲帳號。
3. 年齡驗證閘（BRD §9.2）：所有新帳號必須完成年齡驗證後才可進入正式對戰；流程：① 玩家填入出生年份 → ② 系統判斷是否 ≥ 18 歲 → ③ 通過則發送手機 OTP（6 碼，5 分鐘有效）→ ④ OTP 驗證成功後帳號啟用；未完成驗證者只可進入教學模式，不可參與正式對戰；年齡驗證閘 100% 覆蓋新帳號。邊緣情況說明：v1.0 年齡計算採「currentYear − birthYear」（僅比較年份，不含月日）；此方式可能允許年內生日尚未到的 17 歲用戶通過（最多 11 個月誤差）。v1.0 接受此限制，法律意見書（2026-05-15）確認可行性；若法務要求更精確，v1.x 改為完整生日核驗（YYYY-MM-DD）。
4. OTP 安全限制：同一 OTP 最多 3 次錯誤後自動失效（需重送）；重送間隔 ≥ 60 秒；同一手機號每日最多 5 次 OTP 請求（次日 00:00 UTC+8 重置）；同一 IP 10 分鐘內超過 3 支手機號請求觸發 Rate Limit（HTTP 429）。

**Out of Scope：**
- Apple Sign-In（v1.0 不實作，列入 v1.x Backlog）。
- 台灣自然人憑證 KYC（僅在法律意見書 2026-05-15 要求時升級，截止日 2026-08-13）。
- 多裝置同時登入限制（v1.0 不實作）。

**Dependencies：** REQ-015（防沉迷需要帳號年齡欄位）、REQ-016（Cookie 同意需在帳號流程前顯示）

**Priority：** Must Have

---

### REQ-015：防沉迷系統（2h reminder，daily display，underage 2h hard stop）

**Feature Name：** 防沉迷與遊玩時間管理

**User Story：**  
As a **Casual Player**, I want the app to remind me when I've been playing for 2 hours and show my daily play time so that I can maintain healthy gaming habits, while underage accounts are protected by a mandatory daily limit.

**Acceptance Criteria：**

1. 連續遊玩計時器：每局結束後累計遊玩時間；連續遊玩滿 2 小時（120 分鐘）後，強制顯示休息提醒彈窗（文字：「您已連續遊玩 X 分鐘，請適度休息，注意健康。」）；玩家需主動點選確認後方可繼續。
2. 計時器重置條件（F18）：玩家主動登出後重置；或離線（網路斷線 / App 關閉）超過 **30 分鐘**後重置；App 切換至背景超過 30 分鐘視為中斷並重置計時器。
3. 未成年帳號強制限制：年齡 < 18 歲帳號每日遊玩時數上限 2 小時，達上限後強制登出（UTC+8 次日 00:00 重置）；強制登出前 10 分鐘顯示警告。
4. 每日遊玩時間顯示：帳號主頁顯示今日累計遊玩時間；準確度 AC：連續遊玩 30 分鐘後，帳號頁顯示值與 Server Session Log 誤差 ≤ 1 分鐘（60 秒）。

**Out of Scope：**
- 週 / 月累計遊玩時間顯示（v1.0 僅顯示今日）。
- 家長控制面板（v1.0 不實作）。

**Dependencies：** REQ-014（帳號年齡欄位）、REQ-011（Session 時間追蹤）

**Priority：** Must Have

---

### REQ-016：Cookie 同意系統（Cookie banner，consent log，GDPR for EU IPs）

**Feature Name：** Web 平台 Cookie 同意橫幅與同意記錄

**User Story：**  
As a **Casual Player** accessing via web browser, I want to be informed about cookie usage and choose which types I consent to so that my privacy preferences are respected and the platform meets legal requirements.

**Acceptance Criteria：**

1. Web 平台首次載入時顯示 Cookie 同意橫幅；同意橫幅包含至少三類 Cookie 的獨立選項：必要性 Cookie（不可拒絕）、分析性 Cookie（可選拒絕）、行銷性 Cookie（可選拒絕）。
2. 歐盟用戶觸發條件：以 CloudFlare CF-IPCountry header 或 MaxMind GeoIP DB 偵測用戶 IP 所屬國家；若為歐盟成員國，強制顯示 GDPR opt-in 同意流程（明確 opt-in，非 pre-checked，不預設勾選任何可選類別）。
3. 同意記錄持久化：每筆同意紀錄包含時間戳（UTC）、IP hash、同意版本號、各類 Cookie 選擇結果；保留 3 年；用戶可隨時在帳號設定頁撤回同意（撤回確認後 ≤ 1 秒內，Server 停止記錄分析性與行銷性 Cookie 資料；Client 在下一次頁面載入前不再觸發對應追蹤腳本。測試方法：使用 Chrome DevTools Network 面板或 Charles Proxy，驗證撤回後 1 秒內無新的追蹤請求發出）。
4. 非歐盟用戶（如台灣）：依《個資法》告知義務顯示橫幅，但不強制 opt-in；預設接受必要性 Cookie，分析性與行銷性 Cookie 提示用戶選擇。

**Out of Scope：**
- Native App（iOS / Android）的 Cookie 橫幅（Native App 適用 ATT / 系統隱私提示，不在本 REQ 範圍）。
- Cookie 橫幅 A/B 測試樣式優化（v1.0 僅標準樣式）。

**Dependencies：** REQ-014（帳號系統，同意紀錄綁定帳號 ID 或訪客 ID）

**Priority：** Must Have

---

### REQ-020a：每日免費贈送 + 救濟機制（Daily Free Chips + Rescue Mechanic）

**Feature Name：** 每日贈送籌碼與救濟機制

**Priority：** Must Have

**User Story：**
As a **Returning Player**, I want to receive free chips daily and get an emergency top-up when I'm about to run out so that I can always return to the game even after losing all my chips.

**Acceptance Criteria：**

1. 每日免費贈送：帳號每日登入觸發贈送 5,000 籌碼（每日 00:00 UTC+8 重置）；超過 7 日未登入者不補發累積天數；每日領取率目標 ≥ 60% DAU（Launch+6M 量測）。
2. 救濟機制：當局結算後玩家餘額 < 500 籌碼時，Server 在下一局開始前自動補發 1,000 救濟籌碼（每帳號每日上限 1 次）；補發時廣播 Client 顯示提示「您的籌碼已不足，系統已補發 1,000 救濟籌碼」；救濟不觸發條件：餘額 500–999（此範圍顯示大廳提示，引導玩家透過每日任務恢復進房資格）。

**Out of Scope：**
- IAP 籌碼購買（見 REQ-020b）。
- 廣告模式（見 REQ-020b）。
- 籌碼兌換現金或實體物品（明確禁止）。
- 好友間籌碼轉移（明確禁止，防洗籌碼）。

**Dependencies：** REQ-014（帳號系統，綁定籌碼錢包）、REQ-004（結算後觸發救濟判斷）、REQ-011（Room State）

---

### REQ-020b：虛擬籌碼商店 IAP / 廣告模式（Virtual Chip Store — IAP or Ad Mode）

**Feature Name：** 虛擬籌碼商店（IAP conditional + 廣告降級）

**Priority：** Should Have（條件依 Q1 法律意見書 2026-05-15）

**User Story：**
As a **Returning Player**, I want to optionally purchase more chips or watch ads to earn chips if I want to play at higher stakes.

**Acceptance Criteria：**

3. **虛擬籌碼 IAP（條件啟用）：** 依法律意見書（2026-05-15 完成）決定；若 IAP 合法：啟用籌碼購買包（金額組合由 Game Designer 定義）；IAP 交易成功率 ≥ 99%；支付失敗退款流程 ≤ 24 小時；**若存在法律疑慮：IAP 停用，改用廣告模式**。
4. **廣告降級模式（若 IAP 不可啟用）：** 使用 Google AdMob SDK；每次廣告獎勵 500 籌碼；每日廣告觀看上限 5 次；廣告播放完成率（已觀看廣告中完整觀看比例）≥ 80%（由 AdMob SDK 回傳確認）；DAU 廣告觀看人數 ≥ 20% DAU。

**Out of Scope：**
- 籌碼兌換現金或實體物品（明確禁止）。
- VIP 訂閱系統（v1.0 Out of Scope，列入 v1.x Backlog）。
- 好友間籌碼轉移（明確禁止，防洗籌碼）。

**Dependencies：** REQ-020a（每日贈送與救濟機制）、法律意見書 Q1（2026-05-15）

---

### REQ-021：每日任務系統（Daily Task System）

**Feature Name：** 每日任務系統

**Priority：** Should Have（BRD §5.3）

**User Story：**
身為玩家，我希望完成每日任務獲得籌碼獎勵，以維持遊玩動力並在籌碼不足時恢復進房資格。

**Acceptance Criteria：**

- AC-1: 每日至少提供 3 個可完成任務（範例：完成 3 場對戰、連續登入 7 日、完成教學）；任務列表每日 00:00 UTC+8 重置。
- AC-2: 每項任務完成後發放 500–2,000 籌碼獎勵；獎勵即時到帳（Server push），Client 顯示動畫提示。
- AC-3: 任務完成率量測：Launch+3M 時 DAU 每日任務完成率 ≥ 40%。
- AC-4: 500–999 籌碼邊緣情況：完成 1 個任務（最低獎勵 500 籌碼）後，玩家總籌碼 ≥ 1,000，可重新進入青銅廳。

**Out of Scope v1.0：** 任務難度等級制、任務成就徽章、任務社群分享。

**Dependencies：** REQ-014（帳號系統）、REQ-011（房間狀態）

**REQ-ID：** REQ-021

---

## 4. Non-Functional Requirements（來源 BRD §8.3）

| # | 類別 | 需求描述 | 量化目標 | 測試方式 | 優先度 | Owner |
|---|------|---------|---------|---------|--------|-------|
| NFR-01 | 效能：延遲 | Server 遊戲邏輯回應延遲（玩家操作至 Server 確認） | ≤ 100ms（P95，亞太區） | Colyseus Load Test + APM 監控 | Must | Eng Lead |
| NFR-02 | 效能：並發 | 支援 Peak CCU | ≥ 500 CCU（單節點）；≥ 2,000 CCU（水平擴展後） | Artillery / k6 壓測 | Must | Eng Lead |
| NFR-03 | 可用性 | 服務可用性（不含計劃維護）；計劃維護窗口：每月最大 4 小時（提前 24 小時公告）；緊急維護計入 SLA 停機時間 | ≥ 99.5% / 月（≤ 3.6 小時停機） | Uptime Robot / Grafana 監控 | Must | SRE |
| NFR-04 | 安全：傳輸加密 | 所有 Client-Server 通訊 | TLS 1.2+（禁止 TLS 1.0/1.1） | SSL Labs 掃描 / 部署前安全審查 | Must | Eng Lead |
| NFR-05 | 安全：資料加密 | 靜態敏感資料（密碼、KYC、支付） | AES-256 加密儲存 | 安全審查 + 滲透測試（GA 前 1 次；後續每 6 個月或重大版本前 1 次） | Must | Eng Lead + Legal |
| NFR-06 | 相容性：瀏覽器 | Web 端主流瀏覽器 | Chrome 100+、Safari 15+、Firefox 100+、Edge 100+ | BrowserStack 跨瀏覽器測試 | Must | QA |
| NFR-07 | 相容性：行動裝置 | Android / iOS 最低版本 | Android 8.0+（API 26+）、iOS 14+ | 實機測試 + Firebase Test Lab | Must | QA |
| NFR-08 | 相容性：解析度 | 行動端最小螢幕寬度 | 375px（iPhone SE）以上無 UI 截斷 | 視覺回歸測試 | Must | QA + Art |
| NFR-09 | 可擴展性 | 水平擴展觸發條件 | 單節點 CPU > 70% 持續 5 分鐘觸發自動擴容 | Colyseus + k8s HPA 設定驗證 | Should | SRE |
| NFR-10 | 可觀測性 | 關鍵業務指標監控覆蓋 | CCU、延遲 P95/P99、錯誤率、籌碼異常 100% 覆蓋 | Grafana Dashboard 審查 | Should | SRE + PM |
| NFR-11 | 合規：個資 | 用戶資料刪除請求處理 | 收到請求 7 個工作日內完成刪除 | 合規稽核 | Must | Legal + DPO |
| NFR-12 | 效能：啟動時間 | 遊戲 Web 端首屏載入 | ≤ 5 秒（4G 網路，1MB/s） | Lighthouse 測試 | Should | Eng Lead |
| NFR-13 | 資料備份與還原 | PostgreSQL 每日全量備份 + 每小時 WAL 增量；Redis 每 15 分鐘 RDB 快照 | RPO ≤ 1 小時；RTO ≤ 4 小時 | 季度備份恢復演練（實際還原測試通過） | Must | SRE |
| NFR-14 | 連線可靠性 | Colyseus WebSocket 心跳與重連 | ping/pong ≤ 10 秒；斷線後自動重連最多 3 次（退避 1/2/4 秒）；超 30 秒觸發斷線行為處理 | Playwright + 網路節流模擬測試 | Must | Eng Lead |

---

## 5. Game Rules Specification（來源 BRD §5.5）

> 本章為實作就緒（Implementation-Ready）的遊戲規則規格。所有遊戲邏輯以 Server 端 TypeScript 實作，Client 端不得包含任何規則計算邏輯。

### 5.0 莊家機制（Banker Mechanism）

**莊家機制（來自 BRD D9, D11, D12）**

1. 首局莊家選擇：持有籌碼最多的玩家擔任莊家；若同籌碼則按進入房間的順序（先進先莊）。
2. 輪莊規則：每局結束後，莊家資格順時鐘移至下一位未棄局玩家；跳過 Fold 的玩家（Fold 玩家仍可下一局擔任莊家）。
3. 中途加入：遊戲進行中加入的玩家排隊等待下一局，不插隊搶莊家位。
4. 莊家籌碼不足（< 500 籌碼）：跳過本局輪莊，移至下一位玩家（見 D9）。

### 5.1 牌局流程（Server 執行順序）

```
Step 1: Server 洗牌（Fisher-Yates）
        → 發牌（每人 3 張暗牌，按座位順序）

Step 2: 莊家查看手牌 → 下注底注（≥ 500 籌碼，≤ 當局房間最高限注）
        → 莊家計時器：30 秒；超時自動以最低底注 500 籌碼代為下注（D12）
        → 若莊家籌碼 < 500 籌碼，自動輪莊至下一位（D9）

Step 3: 閒家依順時鐘順序逐一決策
        → 每人 30 秒計時；超時自動 Fold（D11）
        → Call：下注與莊家等額
        → Fold：棄牌，下注額（若已下）留存底池，手牌保持暗牌

Step 4: 所有未 Fold 玩家翻牌
        → Fold 玩家手牌保持暗牌（v1.0 不公開）
        → 結算動畫僅顯示未 Fold 玩家的手牌

Step 5: Server 比牌（依 §5.2 比牌規則）
        → 計算每位未 Fold 閒家與莊家的比牌結果

Step 6: 三步驟結算（原子性執行，見 §5.3）
```

### 5.2 比牌規則

| 規則項目 | 定義 |
|---------|------|
| **牌數** | 每人 3 張牌 |
| **點數計算** | 3 張牌點數相加 mod 10；A=1，2–9 面值，10/J/Q/K=0（均為 10 點牌） |
| **三公定義** | 三張牌均為 10 點牌（10/J/Q/K），mod 10 = 0，為最大牌型 |
| **比牌順序** | 三公 > 9 點 > 8 點 > … > 1 點 > 0 點（非三公） |
| **同點決勝（D8）** | 第一步：比最大單張花色（黑桃 > 紅心 > 方塊 > 梅花）；第二步（花色相同）：比最大單張點數（K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2 > A，A 最小）；兩步皆同則平手退注。補充規則：若玩家手中持有多張相同花色的牌（同為最大花色），以其中點數最高的一張作為代表牌進行第二步比較。 |
| **三公 vs 三公（D10）** | 同樣依 D8 規則比較；由於 52 張標準牌組每張牌唯一，實際上不可能發生完全平手；若理論上兩步皆同則平手退注 |
| **公牌規則** | **不啟用**（v1.0 所有牌均為暗牌發完再比，見 BRD D6） |

### 5.3 三步驟結算規格

**Step 6a — 確認結果與底池構成：**
- Server 確認每位閒家的比牌結果（贏 / 輸 / Fold）。
- 莊家勝的閒家下注額 + 棄牌（Fold）閒家下注額 → 歸入底池（輸家底池）。
- 莊家敗的閒家下注額 → 不入底池（由莊家從自身籌碼直接支付本金 + 賠率）。

**Step 6b — 抽水（Rake）：**
- 抽水底數 = 輸家閒家下注額加總（底池）。
- 抽水額 = `Math.floor(底池 × 0.05)`，最少 1 籌碼。
- 抽水進入遊戲維運基金（不返還給任何玩家）。

**Step 6c — 籌碼分配：**

| 情境 | 支付方向 |
|------|---------|
| 閒家勝（贏莊） | 莊家直接支付給該閒家：本金（1× 下注額，不經底池）+ N× 下注額賠率；閒家總取回 = (1+N)× 下注額 |
| 閒家敗（輸莊） | 閒家下注額已入底池；底池扣抽水後歸莊家 |
| Fold（棄牌） | 下注額（若已下）入底池；如未下注則無損失 |
| 平手 | 退回閒家下注額；不計入底池；不計入抽水底數 |

**莊家破產規則（D13）：**
- 若莊家籌碼不足支付所有贏家：依閒家順時鐘順序逐一結算（先到先得）；莊家籌碼耗盡後，後續贏家按剩餘可用籌碼等比例縮減取回；抽水按實際結算金額比例扣除。

### 5.4 賠率表（台灣標準版）

| 牌型 | N（賠率倍數）| 閒家總取回 | 閒家淨利潤 |
|------|-----------|----------|----------|
| 三公（三張 10 點牌） | 3 | 4× 下注額 | 3× 下注額 |
| 9 點 | 2 | 3× 下注額 | 2× 下注額 |
| 8 點以下（含 0–7 點非三公）| 1 | 2× 下注額 | 1× 下注額 |
| 平手 | 0（退注）| 1× 下注額 | 0 |
| 閒家敗 | N/A | 0 | -1× 下注額 |

> 所有賠率計算以整數籌碼為單位，不使用浮點運算。

### 5.5 籌碼經濟約束

| 設計項目 | 數值 |
|---------|------|
| 初始籌碼 | 新帳號註冊贈送 100,000 籌碼 |
| 每日贈送 | 5,000 籌碼 / 日（00:00 UTC+8 重置，超過 7 日未登入不補發） |
| 救濟機制觸發 | 餘額 < 500 籌碼，補發 1,000 籌碼（每帳號每日上限 1 次） |
| 每局最低下注 | 500 籌碼 |
| 抽水率 | 5%（floor 取整，最少 1 籌碼，僅從輸家閒家下注額扣除） |

**房間級距與進場條件：**

| 房間等級 | 進場條件（最低持有）| 每局最低下注 | 每局最高下注 |
|---------|-----------------|------------|------------|
| 青銅廳 | ≥ 1,000 | 500 | 5,000 |
| 白銀廳 | ≥ 10,000 | 500 | 15,000 |
| 黃金廳 | ≥ 100,000 | 500 | 50,000 |
| 鉑金廳 | ≥ 1,000,000 | 500 | 150,000 |
| 鑽石廳 | ≥ 10,000,000 | 500 | 500,000 |

---

## 6. Data Models（High-Level）

> 完整 Schema 定義詳見 STEP-09 Schema 文件。本章僅描述關鍵實體與核心欄位。

### Player（玩家）

| 欄位 | 類型 | 說明 |
|------|------|------|
| `player_id` | UUID PK | 唯一玩家 ID |
| `username` | STRING | 顯示暱稱 |
| `email` | STRING（加密）| 帳號 Email |
| `phone_hash` | STRING | 手機號碼 hash（OTP 用） |
| `birth_year` | INTEGER | 出生年份（年齡驗證） |
| `age_verified` | BOOLEAN | 年齡驗證完成狀態 |
| `chip_balance` | BIGINT | 虛擬籌碼餘額 |
| `chip_tier` | ENUM | 青銅/白銀/黃金/鉑金/鑽石 |
| `tutorial_completed` | BOOLEAN | 是否完成新手引導 |
| `daily_chip_claimed_at` | TIMESTAMP | 最後領取每日籌碼時間 |
| `rescue_claimed_at` | TIMESTAMP | 今日救濟籌碼領取時間 |
| `play_time_today_sec` | INTEGER | 今日累計遊玩秒數（UTC+8 重置） |
| `continuous_play_sec` | INTEGER | 連續遊玩秒數（斷線 30 分鐘後重置） |
| `oauth_provider` | ENUM | google / facebook / none |
| `oauth_subject` | STRING | OAuth subject ID |
| `created_at` | TIMESTAMP | 帳號建立時間 |

### Room（房間）

| 欄位 | 類型 | 說明 |
|------|------|------|
| `room_id` | STRING PK | Colyseus Room ID |
| `tier` | ENUM | 房間等級（青銅/白銀/黃金/鉑金/鑽石） |
| `min_chips_entry` | BIGINT | 最低進場籌碼 |
| `max_bet` | BIGINT | 本廳最高下注上限 |
| `player_count` | INTEGER | 目前玩家數（2–6） |
| `status` | ENUM | waiting / playing / settling / closed |
| `created_at` | TIMESTAMP | 房間建立時間 |
| `tutorial_mode` | BOOLEAN | 是否為教學模擬房間 |

### Game（牌局）

| 欄位 | 類型 | 說明 |
|------|------|------|
| `game_id` | UUID PK | 唯一牌局 ID |
| `room_id` | STRING FK | 所屬房間 |
| `banker_player_id` | UUID FK | 本局莊家 |
| `shuffle_seed` | STRING | 洗牌種子（反作弊審計用，加密儲存）|
| `phase` | ENUM | dealing / banker-bet / player-bet / showdown / settled |
| `pot_amount` | BIGINT | 底池金額 |
| `rake_amount` | BIGINT | 本局抽水金額 |
| `started_at` | TIMESTAMP | 牌局開始時間 |
| `settled_at` | TIMESTAMP | 牌局結算時間 |

### Hand（手牌）

| 欄位 | 類型 | 說明 |
|------|------|------|
| `hand_id` | UUID PK | 唯一手牌記錄 ID |
| `game_id` | UUID FK | 所屬牌局 |
| `player_id` | UUID FK | 玩家 ID |
| `cards` | JSONB | 3 張牌（加密，結算後解密記錄）|
| `points` | INTEGER | 計算點數（mod 10）|
| `is_sam_gong` | BOOLEAN | 是否三公 |
| `bet_amount` | BIGINT | 本局下注額 |
| `action` | ENUM | call / fold |
| `result` | ENUM | win / lose / tie / fold |
| `net_chips` | BIGINT | 本局淨籌碼變動（正/負）|

### Transaction（籌碼交易）

| 欄位 | 類型 | 說明 |
|------|------|------|
| `tx_id` | UUID PK | 交易 ID |
| `player_id` | UUID FK | 玩家 ID |
| `tx_type` | ENUM | game_win / game_lose / daily_gift / rescue / iap / ad_reward / rake |
| `amount` | BIGINT | 金額（正為收入，負為支出）|
| `balance_after` | BIGINT | 交易後餘額 |
| `game_id` | UUID FK | 關聯牌局（若適用）|
| `created_at` | TIMESTAMP | 交易時間 |

### Session（會話）

| 欄位 | 類型 | 說明 |
|------|------|------|
| `session_id` | UUID PK | 會話 ID |
| `player_id` | UUID FK | 玩家 ID |
| `login_at` | TIMESTAMP | 登入時間 |
| `logout_at` | TIMESTAMP | 登出時間（NULL = 仍在線）|
| `play_seconds` | INTEGER | 本次會話遊玩秒數 |
| `ip_hash` | STRING | IP hash（合規稽核）|

---

## 7. API Endpoints（High-Level）

> 完整 API 規格（請求/回應 schema、錯誤碼）詳見 STEP-09 API 設計文件。

### REST Endpoints

| Method | Path | 描述 | 認證 |
|--------|------|------|------|
| `POST` | `/auth/guest` | 建立遊客帳號 | — |
| `POST` | `/auth/oauth` | Google / Facebook OAuth 登入 / 綁定 | — |
| `POST` | `/auth/age-verify/initiate` | 送出出生年份，觸發 OTP | Guest Token |
| `POST` | `/auth/age-verify/confirm` | 驗證 OTP，完成年齡驗證 | Guest Token |
| `GET` | `/player/me` | 取得玩家資料（餘額、等級、今日遊玩時間）| JWT |
| `POST` | `/player/daily-chip` | 領取每日免費籌碼 | JWT |
| `GET` | `/lobby/rooms` | 取得大廳可加入房間列表 | JWT |
| `POST` | `/lobby/matchmake` | 快速配對，加入或建立房間 | JWT |
| `GET` | `/leaderboard/weekly` | 取得週榜 Top N | JWT |
| `GET` | `/leaderboard/monthly` | 取得月榜 Top N | JWT |
| `POST` | `/consent/cookie` | 記錄 Cookie 同意 | — |
| `PUT` | `/consent/cookie` | 更新 / 撤回 Cookie 同意 | JWT |
| `POST` | `/iap/verify` | 驗證 IAP 收據（Google / Apple）| JWT |
| `DELETE` | `/player/me` | 帳號刪除請求（GDPR / 個資法）| JWT |

### Colyseus Room Messages（Client → Server）

| Message Type | Payload | 描述 |
|-------------|---------|------|
| `banker_bet` | `{ amount: number }` | 莊家下注底注 |
| `player_call` | `{}` | 閒家跟注 |
| `player_fold` | `{}` | 閒家棄牌 |
| `request_rejoin` | `{ game_id: string }` | 斷線重連請求 |
| `tutorial_start` | `{}` | 開始教學模擬牌局 |
| `tutorial_complete` | `{}` | 確認教學完成 |

### Colyseus Room Messages（Server → Client，Room State 廣播）

| Event / State Key | 描述 |
|-------------------|------|
| `phase` | 牌局階段變化（dealing / banker-bet / player-bet / showdown / settled） |
| `players[*].chipBalance` | 玩家籌碼餘額更新 |
| `players[*].betAmount` | 玩家本局下注額 |
| `players[*].isConnected` | 玩家連線狀態 |
| `timer` | 當前計時器剩餘秒數 |
| `myHand` | 己方手牌（僅發給當事玩家）|
| `settlement` | 結算明細（贏家、抽水、各玩家淨增減）|
| `rescueChips` | 救濟籌碼補發通知 |

---

## 8. Error Handling & Edge Cases

### 8.1 斷線 Mid-Game（來源 BRD §5.3 / §5.5）

| 情境 | 處理行為 |
|------|---------|
| 玩家斷線（< 30 秒內重連）| Server 保留玩家席位與手牌；計時器繼續倒數（不暫停）；重連後顯示剩餘時間，玩家可繼續操作 |
| 玩家斷線（30 秒內未重連）| 自動視為 Fold；下注額（若已下）留存底池；Server 繼續牌局；玩家重連後可查看當局結果但無法操作 |
| 斷線發生於莊家下注階段 | 莊家計時器繼續倒數；超時後 Server 自動以最低底注 500 籌碼代為下注（D12）|
| 所有玩家同時斷線 | Server 等待 30 秒；若無任何玩家重連，牌局作廢，退還所有已下注籌碼（不扣抽水），房間關閉 |
| 重連後狀態不一致 | Server Room State 為唯一真相來源；Client 強制同步 Server 狀態，不接受 Client 自行計算的狀態 |

### 8.2 Banker Insolvency（D13）

| 情境 | 處理行為 |
|------|---------|
| 莊家籌碼不足支付所有贏家 | 依閒家順時鐘順序逐一結算（先到先得）；餘額耗盡後，後續贏家按剩餘可用籌碼比例縮減取回 |
| 莊家結算後籌碼歸零 | 觸發次局自動輪莊；若莊家救濟後仍 < 500 籌碼，跳過本莊家資格（D9）|
| 抽水計算（破產情境）| 按實際結算金額比例扣除，不按原底池全額計算 |

### 8.3 500-999 Chip Edge Case

| 情境 | 處理行為 |
|------|---------|
| 玩家餘額 500–999 籌碼 | 高於救濟觸發值（< 500），但低於最低進場門檻（青銅廳 ≥ 1,000）；不觸發救濟機制 |
| 大廳顯示 | 顯示提示：「您的籌碼不足進入任何房間，請完成每日任務或等待每日免費籌碼（每日 00:00 UTC+8 重置）」|
| 每日任務設計 | 每項任務獎勵 500–2,000 籌碼；確保單日任務可讓此邊緣情況玩家恢復進房資格（≥ 1,000 籌碼）（見 REQ-021 每日任務系統）|

### 8.4 Timer Expiry

| 計時器 | 超時行為 |
|--------|---------|
| 莊家下注（30 秒，D12）| Server 自動以最低底注 500 籌碼代為下注，進入 Step 3 |
| 閒家操作（30 秒，D11）| 超時自動視為 Fold；下注額（若有）留存底池 |
| 斷線期間計時器 | 繼續倒數，不暫停；重連後顯示剩餘時間或已超時結果 |

### 8.5 Room Lifecycle Edge Cases

| 情境 | 處理行為 |
|------|---------|
| 等待玩家超過 60 秒無人加入 | 自動解散房間，通知建立者 |
| 玩家人數降至 1 人（另一玩家離開）| 停止接受新局；等待新玩家補入或解散（等待 60 秒後解散）|
| 所有玩家離開 | 房間立即銷毀，Server 釋放 Room 資源 |
| 中途跌破入場門檻 | 當局繼續；結算後提示玩家並自動移至大廳；不影響進行中牌局 |
| 配對超時（60 秒）| 取消配對，通知玩家「配對超時」，保留在大廳頁面 |
| Tutorial Room 完成 | 模擬牌局結束後，Room 解散；Client 導向教學完成確認頁，然後解鎖正式大廳 |

---

## 9. Compliance Requirements（來源 BRD §9）

### 9.1 台灣賭博法規合規

| 合規項目 | 要求 | 實作方式 | 截止日 |
|---------|------|---------|--------|
| 《刑法》第 266 條（賭博罪）| 不得以財物或可兌換財物為賭注 | 虛擬籌碼不可兌換、不可購買（IAP 依法律意見書決定）；所有遊戲介面明確標示「娛樂性質，虛擬籌碼無真實財務價值」| 2026-05-15（法律意見書）|
| 《詐欺犯罪危害防制條例》| 實名制、可疑交易通報、配合調查 | 帳號 OTP 驗證；建立可疑行為通報 SOP | GA 前（2026-08-21） |
| 《個人資料保護法》| 告知、同意、最小蒐集、刪除權 | Cookie 橫幅（REQ-016）、隱私權政策、資料刪除 API（7 工作日內）| 2026-06-01（DPIA 完成）|
| Google Play / App Store | 博弈類 App 審查，需強調「無實質獎勵」| 文案、描述、截圖均強調娛樂性質；避免博弈相關字眼 | 2026-08-07（GA-2 週）|

### 9.2 防沉迷實作

| 機制 | 實作規格 | 驗收標準 |
|------|---------|---------|
| 連續遊玩 2 小時提醒 | 累計滿 120 分鐘顯示強制彈窗，玩家確認後繼續 | 提醒出現率 100%（QA 驗收：2026-07-21 Beta 前）|
| 每日遊玩時間顯示 | 帳號頁顯示今日累計時間（UTC+8 重置）| 與 Server Session Log 誤差 ≤ 1 分鐘 |
| 未成年 2 小時強制下線 | 年齡 < 18 歲帳號每日 2 小時上限，達限強制登出 | 未成年帳號 2 小時強制登出 QA 驗收通過（2026-07-21）|
| 計時器重置 | 主動登出或離線 > 30 分鐘後重置 | 離線 30 分鐘後重連，計時器歸零驗證 |

### 9.3 年齡驗證流程

```
流程：
① 玩家填入出生年份（YYYY）
② Server 計算 currentYear - birthYear ≥ 18 → 通過
③ 通過後發送手機 OTP（6 碼，5 分鐘有效，SMS via Twilio / AWS SNS）
④ 玩家輸入 OTP → Server 驗證
⑤ 驗證成功：帳號 age_verified = true，解鎖正式對戰
⑥ 驗證失敗：最多 3 次錯誤後 OTP 失效，需重送（間隔 ≥ 60 秒）

升級觸發條件（F11）：
若法律意見書（2026-05-15）認定 OTP 方案不足，
須於 2026-08-13 前完成升級至第三方 KYC（TW 自然人憑證或等效方案）
```

### 9.4 Cookie 同意流程

```
Web 首次載入：
① 偵測 IP 國家（CloudFlare CF-IPCountry header 或 MaxMind GeoIP）
② 若歐盟 IP → GDPR opt-in 流程（非 pre-checked）
   若非歐盟（如台灣）→ 個資法告知橫幅（必要 Cookie 預設接受）
③ 玩家逐類選擇同意（必要 / 分析 / 行銷）
④ 記錄同意：時間戳 + IP hash + 版本號 + 各類選擇（保留 3 年）
⑤ 用戶可在帳號設定頁隨時撤回可選類 Cookie 同意
```

### 9.5 KYC 升級觸發條件

| 條件 | 觸發動作 | 截止日 |
|------|---------|--------|
| 法律意見書（2026-05-15）認定 OTP 不足 | 升級至第三方 KYC（TW 自然人憑證）| 2026-08-13（GA 前）|
| 法律意見書認定 OTP 可接受 | 維持現行方案 | — |
| 詐欺防制條例稽核要求 | 依法立即啟動 KYC 升級 | 依法規要求 |

### 9.6 合規時程里程碑

| 里程碑 | 日期 | 負責人 | 備註 |
|--------|------|--------|------|
| 法律意見書（博弈定位）| 2026-05-15 | Legal | — |
| DPIA 完成 | 2026-06-01 | Legal + DPO | — |
| 架構安全審查 | 2026-07-01 | Eng + Legal | — |
| 法規合規測試 / Beta 前驗收 | 2026-07-21 | QA + Legal | — |
| 平台審查材料備齊 | 2026-08-07 | Product + Legal | — |
| GA 法務簽核＊ | 2026-08-21 | Legal + Exec Sponsor | ＊ PRD 新增里程碑（BRD §9.3 未涵蓋），確保上線前合規完整性 |

---

## 10. Open Items

以下事項已知但未決，延後至指定截止日或後續 EDD / 設計階段處理：

> **REQ 編號保留說明：** REQ-005 至 REQ-009（保留給 BRD §5.3 Should Have 功能：好友系統、排行榜、聊天室、多語系、其他）；REQ-017 至 REQ-019（保留給未來功能）；各功能狀態詳見本章 Open Items。

| # | 項目 | 影響 | 負責人 | 截止日 | 狀態 |
|---|------|------|--------|--------|------|
| O1 | IAP 法律意見書：虛擬籌碼購買是否觸犯賭博罪 | REQ-020 IAP 啟用或降級廣告模式 | Legal | 2026-05-15 | OPEN |
| O2 | KYC 升級：若法律意見書認定 OTP 不足，需升級至第三方 KYC | REQ-014 帳號系統 | Legal + Eng | 2026-08-13（若觸發）| OPEN（依 O1 決定）|
| O3 | 部署目標決定：Colyseus Cloud vs 自建 k8s（EDD 開始前必須完成）| NFR-02、NFR-09、EDD 架構設計 | Eng Lead | **2026-05-15** | OPEN |
| O4 | 美術風格最終選定：像素風 vs 賭場風（Beta A/B 測試後決定）| REQ-013 UI / 動畫 | PM + Art Director | **2026-07-21** | OPEN |
| O5 | 好友系統（友人列表、在線狀態、好友邀請通知）— BRD §5.3 Should Have；PRD v1.0 DEFERRED至v1.x（依人力評估）| v1.x PRD | PM | v1.x 計畫確認後 | DEFERRED |
| O6 | 每日任務具體獎勵設計（500–2,000 籌碼範圍內的任務清單與獎勵配置）| REQ-021（每日任務系統，BRD §5.3 Should Have）| Game Designer | EDD 階段 | OPEN |
| O7 | 觀戰模式（Spectator Mode）：v1.0 Out of Scope，v1.x 評估 | v1.x PRD | PM | v1.x 計畫確認後 | DEFERRED |
| O8 | VIP 訂閱系統：v1.0 Out of Scope，v1.x Backlog | v1.x PRD | PM | v1.x 計畫確認後 | DEFERRED |
| O9 | 多語系支援（英文 / 簡中）：v1.0 Out of Scope | v1.x PRD | PM | v1.x 計畫確認後 | DEFERRED |
| O10 | 第二品類（大老二 / 21 點）：O4 目標，v1.x 以後 | v2.0 PRD | PM + Game Designer | 2027-08-21 | DEFERRED |
| O11 | 聊天室關鍵字過濾清單初始版本（由 Ops 維護，存放 `/docs/content-policy/`）| REQ 聊天室（Could Have，v1.0 不確定是否啟用）| Ops | 聊天室功能上線前 | OPEN |

---

*PRD 文件結束。下一步：STEP-04 EDD（Engineering Design Document）。*

---

> **文件維護聲明：** 本 PRD 由 /devsop-autodev STEP-03 自動生成，依據 BRD-SAM-GONG-GAME-20260421 v0.12-draft。所有財務預測數字（付費率、ARPPU、LTV、CAC 等）均為 AI 推斷假設，非來自可信第三方市場研究，不得作為投資決策或財務承諾依據。
