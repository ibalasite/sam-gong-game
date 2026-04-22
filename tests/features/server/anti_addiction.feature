Feature: Anti-Addiction
  As a game server
  I want to enforce anti-addiction rules
  So that the platform complies with Taiwan gaming regulations for both adults and minors

  Background:
    Given AntiAddictionManager 模組已初始化
    And Redis 用於計時快取（write-through to PostgreSQL）
    And 成人規則：連續遊玩 2 小時（7200 秒）觸發提醒，確認後重置
    And 未成年規則：每日累計 2 小時（7200 秒）硬性停止，UTC+8 午夜重置

  # ── 成人防沉迷 ──

  Scenario: 成人遊玩未達 2 小時 - 無提醒
    Given 玩家 "adult-player-1" is_minor = false
    And 玩家已連續遊玩 3600 秒（1 小時）
    When trackAdultSession("adult-player-1") 被呼叫
    Then status 應為 "normal"
    And 不發送任何防沉迷提醒訊息

  Scenario: 成人遊玩達 2 小時 - 觸發提醒
    Given 玩家 "adult-player-1" is_minor = false
    And 玩家已連續遊玩 7200 秒（2 小時）
    When trackAdultSession("adult-player-1") 被呼叫
    Then status 應為 "warning"
    And 伺服器發送 anti_addiction_warning { type: "adult", session_minutes: 120 } 至玩家
    And 遊戲繼續（不強制登出成人玩家）

  Scenario: 成人提醒後未確認 - 計時持續累積
    Given 成人玩家已收到 2 小時提醒
    And 玩家未發送 confirm_anti_addiction
    When 繼續遊玩 30 分鐘
    Then status 仍應為 "warning"
    And 計時器持續累積（不自動重置）

  Scenario: 成人確認提醒後計時重置
    Given 成人玩家已收到 2 小時提醒
    When 玩家發送 confirm_anti_addiction { type: "adult" }
    Then onAdultWarningConfirmed("adult-player-1") 被呼叫
    And session 計時重置為 0 秒
    And 玩家可繼續遊玩至下一個 2 小時

  Scenario: 成人離線超過 30 分鐘後重連計時重置
    Given 成人玩家已連續遊玩 90 分鐘
    And 玩家斷線超過 30 分鐘（1800+ 秒）
    When 玩家重新連線
    Then session 計時重置為 0 秒
    And 不觸發立即警告

  # ── 未成年防沉迷 ──

  Scenario: 未成年每日遊玩未達 2 小時 - 可繼續
    Given 玩家 "minor-player-1" is_minor = true
    And 玩家今日累計遊玩 3600 秒（1 小時）
    When trackUnderageDaily("minor-player-1") 被呼叫
    Then status 應為 "normal"
    And 玩家可繼續遊玩

  Scenario: 未成年每日達 2 小時 - 觸發硬停
    Given 玩家 "minor-player-1" is_minor = true
    And 玩家今日累計遊玩 7200 秒（2 小時）
    When trackUnderageDaily("minor-player-1") 被呼叫
    Then status 應為 "hard_stop"
    And 伺服器發送 anti_addiction_signal { type: "underage", daily_minutes_remaining: 0, midnight_timestamp: <next_midnight> }
    And 玩家 WS 連線以 Close Code 4003 關閉

  Scenario: 未成年牌局中達到 2 小時 - 等待本局結算後登出
    Given 未成年玩家在遊戲進行中達到每日 2 小時上限
    When trackUnderageDaily 偵測到硬停條件
    Then scheduleUnderageLogout(playerId, afterSettlement=true) 被呼叫
    And 本局結算完成後觸發 WS Close 4003
    And 未在牌局進行中強制中斷（等待結算完成）

  Scenario: UTC+8 午夜重置 - 未成年每日計時歸零
    Given 未成年玩家今日累計遊玩時間已達上限
    And 當前時間為 UTC+8 23:59:59
    When 時間跨越 UTC+8 00:00:00（次日）
    Then 玩家 daily_play_seconds 重置為 0
    And 玩家可重新連線並開始遊玩

  Scenario: getTaiwanMidnightTimestamp 計算正確
    Given 任意 UTC 時間輸入
    When 呼叫 getTaiwanMidnightTimestamp()
    Then 返回下一個 UTC+8 00:00 的 Unix ms 時間戳
    And 返回值為整數（ms 精度）
    And 返回值大於當前 Unix ms

  # ── confirm_anti_addiction payload 驗證 ──

  Scenario: confirm_anti_addiction payload 必須包含 type: "adult"
    Given 成人玩家已收到警告
    When 玩家發送 confirm_anti_addiction { type: "adult" }
    Then 伺服器接受此 payload
    And onAdultWarningConfirmed 被呼叫
    And 計時重置為 0

  Scenario: confirm_anti_addiction payload 錯誤類型被忽略
    Given 成人玩家收到警告
    When 玩家發送 confirm_anti_addiction { type: "invalid" }
    Then 伺服器忽略此訊息
    And 計時不重置
    And 記錄 warning log

  # ── Redis Failover + PostgreSQL 持久化 ──

  Scenario: Redis failover - 從 PostgreSQL 回填計時資料
    Given 玩家已遊玩 45 分鐘（計時資料存於 Redis 和 PostgreSQL）
    And Redis Sentinel 觸發 Failover（Redis 重啟）
    When Redis 重新上線
    Then AntiAddictionManager 從 PostgreSQL users.daily_play_seconds 回填計時
    And 計時資料未丟失（仍為 45 分鐘）
    And 玩家可繼續正常遊玩

  Scenario: Write-Through - 每局結算後寫入 PostgreSQL
    Given 玩家正在進行遊戲
    When 本局結算（settled 事件觸發）
    Then persistTimers(playerId) 被呼叫
    And PostgreSQL users.daily_play_seconds 更新為最新值
    And PostgreSQL users.session_play_seconds 更新為最新值
    And Redis 計時資料與 PostgreSQL 保持一致（write-through）
