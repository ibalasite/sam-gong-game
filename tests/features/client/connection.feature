Feature: 連線管理（客戶端 WebSocket 連線狀態處理）
  As a 玩家
  I want to 系統正確處理連線問題並提供清晰的狀態提示
  So that 我在網路不穩時仍能繼續遊戲或安全重連

  Background:
    Given 客戶端已與 Colyseus Server 建立 WebSocket 連線
    And 玩家已進入遊戲桌面（SCR-007）

  # ── 斷線偵測 ──

  Scenario: 網路中斷時顯示斷線提示 UI
    Given 玩家正在遊戲中（player-bet phase）
    When WebSocket 連線意外中斷（非主動關閉）
    Then 遊戲桌面頂部顯示「連線中斷，正在重連...」橫幅
    And 本玩家頭像邊框變為 #E74C3C（紅色）虛線
    And 本玩家頭像疊加斷線圖示（ic_disconnect.png）
    And 操作按鈕（Call / Fold）自動 disabled（無法操作）

  Scenario: 對手玩家斷線時顯示對應頭像狀態
    Given 遊戲進行中
    When Server 廣播 players 中 seat_index=2 的 is_connected = false
    Then seat_index=2 玩家頭像邊框顯示 #E74C3C（紅色）虛線
    And seat_index=2 頭像疊加斷線圖示（ic_disconnect.png）
    And 其他玩家頭像不受影響

  Scenario: 斷線時顯示倒數重連視窗（30s 重連窗口）
    Given WebSocket 連線已中斷
    Then 顯示重連倒數 UI（顯示「30 秒內重連將自動恢復」）
    And 倒數計時器從 30 秒開始遞減
    And 畫面保持遊戲桌面狀態（不跳轉）

  # ── 重連流程 ──

  Scenario: 30 秒內重連成功恢復遊戲狀態
    Given WebSocket 連線已中斷，重連倒數進行中
    When 客戶端在 30 秒內成功重新連線至 Colyseus Server
    Then 重連橫幅消失
    And 本玩家頭像恢復正常邊框（is_connected = true）
    And 斷線圖示消失
    And Server 重新推送 myHand 私人訊息至本玩家
    And 遊戲界面恢復至斷線前的 phase 狀態

  Scenario: 重連後 myHand 重新推送確保手牌顯示正確
    Given 玩家斷線後在 30 秒內重連成功
    When Server 重新推送私人訊息 "myHand"
    Then 本玩家手牌區正確顯示 3 張手牌（face-up 若已翻面，否則 face-down）
    And 不重複執行發牌動畫

  Scenario: 超過 30 秒未重連後返回大廳
    Given WebSocket 連線已中斷，重連倒數進行中
    When 倒數計時器歸零（超過 30 秒）
    Then 客戶端顯示「重連失敗，已自動退出房間」Toast
    And 客戶端導向主大廳（SCR-004）
    And 不顯示遊戲桌面（SCR-007）

  # ── WebSocket Close Code 處理 ──

  Scenario: WS Close Code 1000（正常關閉）導向主大廳
    Given 遊戲結束後 Server 正常關閉 WebSocket 連線
    When 客戶端收到 WS Close Code 1000
    Then 客戶端顯示「遊戲已正常結束」Toast
    And 導向主大廳（SCR-004）
    And 不顯示重連 UI

  Scenario: WS Close Code 4001（未授權）顯示登入錯誤並登出
    Given 客戶端已連線至 Colyseus Server
    When 客戶端收到 WS Close Code 4001（Unauthorized）
    Then 客戶端顯示「連線授權失敗，請重新登入」提示
    And 清除本地 JWT Token
    And 導向主大廳（SCR-004）登出狀態

  Scenario: WS Close Code 4002（房間已滿）顯示房間已滿提示
    Given 玩家嘗試加入已滿的房間
    When 客戶端收到 WS Close Code 4002（Room Full）
    Then 客戶端顯示 Toast「此房間已滿，請選擇其他房間」（i18n: errors.room_full）
    And 導向廳別選擇畫面（SCR-005）

  Scenario: WS Close Code 4005（多裝置登入踢出）顯示強制登出提示
    Given 玩家已在其他裝置重新登入
    When 客戶端收到 WS Close Code 4005（Multi-device Kick）
    Then 客戶端顯示「您的帳號已在其他裝置登入，已自動登出」提示
    And 清除本地 JWT Token
    And 導向主大廳（SCR-004）登出狀態
    And 不顯示重連 UI

  Scenario: WS Close Code 4003（帳號封鎖）顯示封禁提示
    Given 玩家帳號已被系統封鎖
    When 客戶端收到 WS Close Code 4003（Banned）
    Then 客戶端顯示「您的帳號已被停用，如有疑問請聯繫客服」提示
    And 清除本地 JWT Token
    And 導向主大廳（SCR-004）登出狀態
    And 重連 UI 不顯示

  # ── 配對超時 ──

  Scenario: 配對等待超過 90 秒自動返回大廳
    Given 玩家在 SCR-006 配對等待畫面
    And 配對倒數計時器已開始（90s）
    When 計時器倒數至 0（超過 90 秒）
    Then 客戶端顯示 Toast「配對超時，請稍後再試」
    And 導向主大廳（SCR-004）

  Scenario: 配對 30 秒後顯示擴大配對橫幅
    Given 玩家在 SCR-006 配對等待畫面
    When 配對等待超過 30 秒
    And Server 廣播 matchmaking_status.is_expanding = true 且 expanded_tiers = ["白銀廳"]
    Then 顯示「擴大配對中（白銀廳）」橫幅（i18n: matchmaking.expanding）
    And 橫幅文字動態取自 Server 廣播的 expanded_tiers，非硬編碼

  # ── 一般連線品質指示 ──

  Scenario: 玩家主動取消配對返回大廳
    Given 玩家在 SCR-006 配對等待畫面
    When 玩家點擊「取消配對」按鈕
    Then 客戶端關閉 WebSocket 連線（consented=true）
    And 導向主大廳（SCR-004）
    And 重連 UI 不顯示

  Scenario: Splash 載入畫面顯示資源載入進度
    Given 玩家首次啟動 App（SCR-001）
    When 客戶端載入 Cocos Creator Bundle 資源
    Then 進度條顯示目前載入百分比（0%–100%）
    And 進度條下方顯示「載入資源...」文字
    And 首屏載入目標 ≤ 5 秒（4G，1MB/s）
