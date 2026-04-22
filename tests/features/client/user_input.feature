Feature: 用戶輸入驗證（客戶端輸入處理）
  As a 玩家
  I want to 正確的操作介面驗證
  So that 我的輸入在送出前已符合基本範圍限制，減少無效請求

  Background:
    Given 客戶端已與 Colyseus Server 建立 WebSocket 連線
    And 玩家已進入遊戲桌面（SCR-007）

  # ── 莊家下注滑桿驗證 ──

  Scenario: 下注金額在合法範圍內時確認按鈕可點擊
    Given Server 廣播 phase = "banker-bet"
    And 本地玩家為莊家
    And Server 廣播 min_bet = 100，max_bet = 500
    And 本地玩家 chip_balance = 2000
    When 玩家將 CMP-004 Bet Slider 調整至 300
    Then 滑桿顯示金額「300」
    And Confirm Bet 確認按鈕處於 Enabled 狀態（可點擊）
    And 無錯誤標籤顯示

  Scenario: 下注金額超過玩家籌碼餘額時顯示錯誤並禁用確認
    Given Server 廣播 phase = "banker-bet"
    And 本地玩家為莊家
    And 本地玩家 chip_balance = 200
    And Server 廣播 max_bet = 500
    When 玩家嘗試將 Bet Slider 拖曳至 300（超過 chip_balance）
    Then Slider thumb 自動 clamp 至 chip_balance（200）
    And Slider 軌道顏色變為 #C0392B（紅色）
    And Slider 下方顯示錯誤標籤「下注金額超過您的籌碼餘額」（i18n: errors.bet_exceeds_balance）
    And Confirm Bet 按鈕處於 Disabled 狀態（灰色，opacity 0.5）

  Scenario: 下注金額恢復合法範圍後錯誤標籤消失
    Given Bet Slider 已觸發超額錯誤（slider > chip_balance）
    When 玩家將 Slider 調整回 chip_balance 以下的合法值
    Then 錯誤標籤消失
    And Slider 軌道恢復正常漸層色（#2980B9 → #D4AF37）
    And Confirm Bet 按鈕恢復 Enabled 狀態

  Scenario: 快捷籌碼按鈕點擊後滑桿跳至對應金額
    Given Server 廣播 tier_config.quick_bet_amounts = [100, 200, 300, 500]
    And 本地玩家為莊家且處於 banker-bet phase
    When 玩家點擊金額 200 的快捷籌碼按鈕
    Then Bet Slider 顯示金額「200」
    And 若 200 ≤ chip_balance 則 Confirm Bet 按鈕 Enabled

  Scenario: 快捷籌碼按鈕金額來自 Server，Client 不硬編碼
    Given Server 廣播 tier_config.quick_bet_amounts = [1000, 2000, 3000, 5000]
    And 本地玩家為莊家且處於 banker-bet phase
    Then 快捷按鈕顯示 4 個，金額分別為 1000、2000、3000、5000
    And Client 不顯示任何硬編碼廳別金額

  # ── 莊家查看手牌 ──

  Scenario: 莊家點擊 See Cards 後按鈕進入 Processing 狀態
    Given Server 廣播 phase = "banker-bet"
    And 本地玩家為莊家
    When 玩家點擊 CMP-005 See Cards 按鈕（「查看手牌」）
    Then 按鈕進入 Processing 狀態（顯示 spinner）
    And 客戶端向 Server 發送 WS 訊息 "see_cards"
    And 按鈕暫時不可再次點擊

  Scenario: Server 回應 myHand 後莊家手牌翻面顯示
    Given 玩家已點擊 See Cards 並等待 Server 回應
    When Server 推送私人訊息 "myHand" 包含 3 張牌資料
    Then 本地莊家的 3 張手牌翻面顯示（face-up，0.3s 翻牌動畫）
    And See Cards 按鈕進入 Disabled 狀態（不可再次查看）

  # ── Call / Fold 按鈕輸入 ──

  Scenario: player-bet phase 非輪到本玩家時 Call / Fold 按鈕不顯示
    Given Server 廣播 phase = "player-bet"
    And current_player_turn_seat ≠ 本地玩家 seat_index
    Then CMP-005 Call 按鈕不顯示
    And CMP-005 Fold 按鈕不顯示

  Scenario: 玩家點擊 Call 後按鈕進入 Processing 狀態並發送 WS 訊息
    Given Server 廣播 phase = "player-bet"
    And current_player_turn_seat = 本地玩家 seat_index
    And 本地玩家 chip_balance ≥ banker_bet_amount
    When 玩家點擊 CMP-005 Call 按鈕
    Then Call 與 Fold 按鈕均進入 Processing 狀態（spinner）
    And 客戶端向 Server 發送 WS 訊息 "call"
    And 按鈕等待 Server 確認期間不可重複點擊

  Scenario: 玩家點擊 Fold 後發送棄牌 WS 訊息
    Given Server 廣播 phase = "player-bet"
    And current_player_turn_seat = 本地玩家 seat_index
    When 玩家點擊 CMP-005 Fold 按鈕
    Then 客戶端向 Server 發送 WS 訊息 "fold"
    And Call 與 Fold 按鈕均進入 Processing 狀態

  Scenario: 操作逾時（8s 無 Server 回應）按鈕恢復並顯示 Toast
    Given 玩家已點擊 Call 並等待 Server 回應
    When 超過 8 秒仍無 Server 回應
    Then Call 與 Fold 按鈕恢復 Active 狀態（可重新點擊）
    And 顯示 Toast 訊息「操作逾時，請重試或檢查網路連線」（i18n: errors.action_timeout）
    And CMP-007 計時條繼續正常倒數（Client 不代替玩家行動）

  # ── 聊天訊息發送 ──

  Scenario: 玩家在聊天面板輸入並發送訊息
    Given 玩家開啟 SCR-011 Chat Panel
    When 玩家輸入訊息「大家好！」並點擊發送按鈕
    Then 客戶端向 Server 發送 WS 訊息 "send_chat"，payload 包含訊息內容
    And 訊息以自身訊息氣泡（CMP-009，右對齊，#2980B9 背景）顯示於聊天面板

  Scenario: 聊天訊息超過 200 字元時不允許發送
    Given 玩家在 SCR-011 Chat Panel 輸入框
    When 玩家嘗試輸入超過 200 字元的文字
    Then 輸入框限制最多顯示 200 字元
    And 超出部分被截斷，無法繼續輸入

  Scenario: 聊天面板顯示他人訊息為左對齊氣泡
    Given SCR-011 Chat Panel 已開啟
    When Server 廣播 chat 訊息（非本地玩家發送）
    Then 該訊息以他人訊息氣泡（CMP-009，左對齊，#34495E 背景）顯示
    And 氣泡上方顯示發送者名稱（#D4AF37 金色，10pt）

  # ── 廳別選擇與入場驗證 ──

  Scenario: 籌碼不足進入廳別時按鈕顯示 disabled 並提示
    Given 本地玩家 chip_balance = 500
    And 黃金廳 entry_chips = 100000
    When 玩家在 SCR-004 大廳點擊黃金廳按鈕
    Then 按鈕顯示灰階 + 鎖定圖示
    And 顯示「需 100,000 籌碼」提示文字
    And 點擊無任何跳轉效果

  Scenario: 玩家已在房間中時配對入口顯示 disabled
    Given 本地玩家 player_state.room_active = true
    When 玩家在 SCR-004 大廳查看廳別選擇
    Then 所有廳別按鈕（快速配對入口）顯示 disabled 狀態
    And 不可觸發新的房間加入流程
