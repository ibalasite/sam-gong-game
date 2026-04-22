Feature: UI State Rendering（客戶端狀態渲染）
  As a 玩家
  I want to 看到正確的遊戲界面
  So that 我能清楚了解遊戲狀態

  Background:
    Given 客戶端已與 Colyseus Server 建立 WebSocket 連線
    And 玩家已進入遊戲桌面（SCR-007）

  # ── Phase Indicator 渲染 ──

  Scenario: waiting phase 時顯示等待狀態
    Given Server 廣播 phase = "waiting"
    Then CMP-006 Phase Indicator 應顯示文字「等待玩家加入」
    And Phase Indicator 背景色應為 #7F8C8D（灰色）
    And 操作按鈕區（CMP-005）不顯示任何按鈕

  Scenario: dealing phase 時顯示發牌狀態
    Given 遊戲處於 waiting phase
    When Server 廣播 phase = "dealing"
    Then CMP-006 Phase Indicator 應顯示文字「發牌中」
    And Phase Indicator 背景色應為 #2980B9（藍色）
    And 發牌動畫開始播放（各玩家手牌區出現 3 張牌背朝上的牌）

  Scenario: banker-bet phase 時本地玩家為莊家顯示下注界面
    Given Server 廣播 phase = "banker-bet"
    And 本地玩家的 seat_index 與 banker_seat_index 相同
    Then CMP-006 Phase Indicator 應顯示文字「莊家下注中」
    And Phase Indicator 背景色應為 #D4AF37（金色）
    And CMP-004 Bet Slider 顯示並可操作（範圍 min_bet 至 max_bet）
    And CMP-005 See Cards 按鈕顯示並可點擊

  Scenario: banker-bet phase 時本地玩家為閒家不顯示下注界面
    Given Server 廣播 phase = "banker-bet"
    And 本地玩家的 seat_index 與 banker_seat_index 不同
    Then CMP-004 Bet Slider 不顯示
    And CMP-005 See Cards 按鈕不顯示
    And CMP-006 Phase Indicator 應顯示文字「莊家下注中」

  Scenario: player-bet phase 時顯示跟注與棄牌按鈕
    Given Server 廣播 phase = "player-bet"
    And current_player_turn_seat 與本地玩家 seat_index 相同
    Then CMP-006 Phase Indicator 應顯示文字「玩家決策中」
    And Phase Indicator 背景色應為 #E67E22（橙色）
    And CMP-005 Call 按鈕顯示，文字「跟注」並附帶 banker_bet_amount
    And CMP-005 Fold 按鈕顯示，文字「棄牌」
    And CMP-007 Timer Bar 開始倒數

  Scenario: showdown phase 時顯示翻牌比較狀態
    Given Server 廣播 phase = "showdown"
    Then CMP-006 Phase Indicator 應顯示文字「翻牌比較」
    And Phase Indicator 背景色應為 #8E44AD（紫色）
    And 所有未棄牌玩家的手牌翻面為正面朝上（face-up）

  Scenario: settled phase 時顯示結算完成狀態
    Given Server 廣播 phase = "settled"
    Then CMP-006 Phase Indicator 應顯示文字「結算完成」
    And Phase Indicator 背景色應為 #27AE60（綠色）
    And SCR-009 Settlement Overlay 疊加層顯示

  # ── 籌碼餘額渲染 ──

  Scenario: Room State 更新後即時更新本玩家籌碼餘額
    Given 本玩家 chip_balance 初始值為 10000
    When Server 廣播 players 中本玩家 chip_balance 更新為 9500
    Then 遊戲桌面本玩家資訊列顯示籌碼「9,500」
    And 數字以千分位格式顯示（monospace 字體，#D4AF37 金色）

  Scenario: 進入主大廳時透過 REST API 取得最新籌碼餘額
    Given 玩家從遊戲房間返回主大廳（SCR-004）
    When 畫面掛載
    Then 客戶端呼叫 REST API GET /api/v1/player/me
    And 大廳顯示的籌碼餘額來自 API 回應，非本地快取

  # ── 玩家頭像狀態渲染 ──

  Scenario: 莊家頭像顯示皇冠圖示與金色邊框
    Given Server 廣播 banker_seat_index = 2
    Then seat_index=2 的 CMP-003 Player Avatar 邊框顏色為 #D4AF37（金色）
    And 頭像右上角顯示皇冠圖示（ic_crown.png）

  Scenario: 棄牌玩家頭像顯示灰色邊框與棄牌標籤
    Given 座位3的玩家 is_folded = true
    When Server 廣播 players 狀態更新
    Then seat_index=3 的頭像邊框顏色變為 #95A5A6（灰色）
    And 頭像上顯示「棄牌」文字標籤

  Scenario: 斷線玩家頭像顯示紅色虛線邊框
    Given 座位1的玩家 is_connected = false
    When Server 廣播 players 狀態更新
    Then seat_index=1 的頭像邊框顯示 #E74C3C（紅色）虛線
    And 頭像疊加斷線圖示（ic_disconnect.png）

  Scenario: 結算後勝利玩家頭像顯示綠色光暈
    Given Server 廣播 phase = "settled"
    And settlement.winners 包含 seat_index=2
    Then seat_index=2 的頭像邊框顯示 #27AE60（綠色）光暈

  Scenario: 結算後失敗玩家頭像顯示紅色光暈
    Given Server 廣播 phase = "settled"
    And settlement.losers 包含 seat_index=3
    Then seat_index=3 的頭像邊框顯示 #C0392B（紅色）光暈

  # ── 排行榜渲染 ──

  Scenario: 點擊排行榜圖示開啟排行榜畫面（SCR-010）
    Given 玩家在遊戲桌面（SCR-007）
    When 玩家點擊頂部列排行榜圖示
    Then SCR-010 排行榜疊加層顯示
    And 排行榜資料從 REST API 載入並渲染
    And 每行顯示玩家排名、暱稱、籌碼數

  Scenario: 結算疊加層顯示 net_chips 增減動畫
    Given Server 廣播 phase = "settled"
    And settlement.winners 包含 seat_index=0（本玩家），net_chips = 500
    Then SCR-009 結算疊加層本玩家行顯示「+500」，顏色 #27AE60（綠色）
    And 數字以向上計數動畫顯示（0.5s）
