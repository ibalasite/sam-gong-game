Feature: 防沉迷 UI（客戶端防沉迷介面）
  As a 平台營運方
  I want to 正確顯示防沉迷提醒 UI
  So that 符合台灣法規，保障玩家健康

  Background:
    Given 客戶端已與 Colyseus Server 建立 WebSocket 連線

  # ── 成人 2h 提醒彈窗 ──

  Scenario: 成人玩家累計遊玩 2 小時後顯示提醒彈窗
    Given 本地玩家身份為成人（is_minor = false）
    And 玩家正在遊戲桌面（SCR-007）
    When Server 發送私人訊息 "anti_addiction_warning"，payload { type: "adult", session_minutes: 120 }
    Then 客戶端顯示 CMP-010 成人提醒彈窗（全螢幕 overlay，背景 rgba(0,0,0,0.85)）
    And 彈窗標題顯示「注意健康」（20pt 粗體，#FFFFFF）
    And 彈窗內容顯示「您已連續遊玩 120 分鐘，請適度休息，注意健康。」
    And 彈窗顯示「我知道了，繼續遊戲」確認按鈕（#2980B9 背景）

  Scenario: 成人提醒彈窗不可透過點擊背景遮罩關閉
    Given CMP-010 成人提醒彈窗已顯示
    When 玩家點擊彈窗背景遮罩區域
    Then 彈窗保持顯示，不關閉
    And 僅能透過點擊「我知道了，繼續遊戲」按鈕關閉

  Scenario: 確認成人提醒後發送確認訊息至 Server 並關閉彈窗
    Given CMP-010 成人提醒彈窗已顯示
    When 玩家點擊「我知道了，繼續遊戲」確認按鈕
    Then 客戶端向 Server 發送 WS 訊息 "confirm_anti_addiction"，payload { type: "adult" }
    And 彈窗關閉，返回觸發前的畫面（繼續遊戲）
    And 下次提醒需再等待 2 小時（由 Server 重置計時器）

  Scenario: 成人提醒彈窗顯示期間遊戲暫停互動
    Given CMP-010 成人提醒彈窗已顯示
    Then 彈窗後方的遊戲操作按鈕（Call / Fold / Bet Slider）不可互動
    And CMP-007 計時條繼續倒數（Server 仍在計時）
    And 彈窗蓋住遊戲界面但不阻止底層計時

  # ── 未成年 2h 強制停止畫面 ──

  Scenario: 未成年玩家非遊戲中觸發強制停止時顯示全螢幕 overlay
    Given 本地玩家身份為未成年（is_minor = true）
    And 玩家在主大廳（SCR-004）
    When Server 發送私人訊息 "anti_addiction_signal"，payload { type: "underage", daily_minutes_remaining: 0, midnight_timestamp: <next_midnight_ms> }
    Then 客戶端顯示 CMP-010 未成年強制停止 overlay（全螢幕）
    And 標題顯示「今日遊戲時間已達上限」（20pt 粗體，#C0392B 紅色）
    And 顯示「確認登出」按鈕（無繼續選項）
    And 不顯示任何可繼續遊戲的按鈕

  Scenario: 未成年玩家牌局進行中觸發時顯示非強制 banner
    Given 本地玩家身份為未成年（is_minor = true）
    And 玩家在遊戲桌面（SCR-007），牌局進行中（player-bet phase）
    When Server 發送私人訊息 "anti_addiction_signal"，payload { type: "underage", daily_minutes_remaining: 0, midnight_timestamp: <next_midnight_ms> }
    Then 客戶端在畫面頂部顯示橙色 banner（#E67E22，高度 36pt）
    And Banner 文字「今日遊玩即將達上限，本局結算後將自動登出」
    And 遊戲操作按鈕（Call / Fold）仍可互動（banner 不阻斷遊戲）
    And 全螢幕 overlay 不顯示

  Scenario: 未成年牌局結算完成後自動顯示強制登出 overlay
    Given 未成年玩家的橙色 banner 已顯示（牌局進行中已觸發 anti_addiction_signal）
    When Server 廣播 phase = "settled"（本局結算完成）
    Then 橙色 banner 關閉
    And 客戶端自動顯示 CMP-010 未成年強制停止全螢幕 overlay
    And 顯示「確認登出」按鈕

  Scenario: 點擊確認登出後執行強制登出流程
    Given CMP-010 未成年強制停止 overlay 已顯示
    When 玩家點擊「確認登出」按鈕
    Then 客戶端清除本地 JWT Token
    And 導向主大廳（SCR-004）登出狀態
    And 不顯示遊戲相關畫面

  # ── 防沉迷倒數計時顯示 ──

  Scenario: 未成年 overlay 顯示至隔日零點的倒數計時
    Given CMP-010 未成年強制停止 overlay 已顯示
    And Server payload 包含 midnight_timestamp（台灣時間次日 00:00 對應的 Unix ms）
    Then overlay 顯示「距明日可遊玩：HH:MM:SS」倒數計時
    And 倒數計算公式為 midnight_timestamp - Date.now()（Client 本地計算）
    And 每秒更新一次顯示

  Scenario: 救濟籌碼補發時顯示 Toast 通知
    Given 玩家籌碼餘額不足（系統判定需補發救濟籌碼）
    When Server 廣播救濟籌碼補發事件
    Then 客戶端底部顯示綠色 Toast（#27AE60，高度 48pt，圓角 8pt）
    And Toast 文字「您的籌碼已不足，系統已補發 1,000 救濟籌碼」（i18n: rescue_chips.awarded）
    And Toast 3 秒後自動消失

  # ── 合規 UI 元素（必要性）──

  Scenario: 免責聲明文字在所有遊戲畫面中不可隱藏
    Given 玩家瀏覽任意遊戲畫面（SCR-001 至 SCR-007）
    Then 每個畫面底部均顯示免責聲明「娛樂性質，虛擬籌碼無真實財務價值」
    And 免責聲明字號不小於 12pt
    And 在任何設定或主題下均不可隱藏

  Scenario: 年齡驗證（SCR-002）阻擋未驗證玩家進入正式對戰
    Given 玩家 age_verified = false
    When 玩家在 SCR-004 大廳點擊「正式對戰」（廳別配對入口）
    Then 客戶端跳轉至 SCR-002 年齡驗證畫面（OTP 驗證）
    And 未完成年齡驗證前不允許進入任何正式房間
