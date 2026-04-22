Feature: Game Flow
  As a game server
  I want to manage the complete game lifecycle
  So that players experience a fair and smooth Sam Gong game

  Background:
    Given Colyseus SamGongRoom 已初始化
    And 廳別設定為青銅廳（min_bet=100, max_bet=500, entry_chips=1000）
    And 所有玩家籌碼餘額均 ≥ entry_chips

  # ── 房間建立 ──

  Scenario: 房間建立 - 初始狀態正確
    When 系統建立一個新的 SamGongRoom（青銅廳）
    Then state.phase 應為 "waiting"
    And state.tier_config.min_bet 應為 100
    And state.tier_config.max_bet 應為 500
    And state.tier_config.entry_chips 應為 1000
    And state.round_number 應為 0
    And state.banker_seat_index 應為 -1

  Scenario: 房間建立 - 60 秒無人加入自動解散
    Given 系統建立一個新的 SamGongRoom
    And 無玩家加入
    When 等待 60 秒
    Then 房間自動解散（onDispose 被呼叫）

  # ── 玩家加入 ──

  Scenario: 玩家加入 - JWT 有效且籌碼充足
    Given 一個有效的 JWT token（player_id = "p1"）
    And 玩家 p1 的 chip_balance = 5000
    When 玩家 p1 使用有效 JWT 加入房間
    Then onJoin 成功
    And PlayerState 被初始化（player_id, seat_index, chip_balance）
    And 伺服器推送 my_session_info 私人訊息至 p1

  Scenario: 玩家加入 - JWT 失效被拒絕
    Given 一個已過期的 JWT token
    When 玩家嘗試使用過期 JWT 加入房間
    Then onJoin 拋出 ServerError
    And 玩家無法加入房間

  Scenario: 玩家加入 - 籌碼不足被拒絕
    Given 玩家 chip_balance = 500（低於 entry_chips = 1000）
    When 玩家嘗試加入青銅廳
    Then onJoin 拋出 ServerError（code: "insufficient_chips"）

  Scenario: 2 位玩家加入後自動進入發牌
    Given 玩家1 成功加入房間
    When 玩家2 成功加入房間
    Then state.phase 應自動轉換為 "dealing"
    And 所有玩家收到 myHand 私人訊息

  Scenario: 房間最大容量 6 人
    Given 房間已有 6 位玩家
    When 第 7 位玩家嘗試加入
    Then 第 7 位玩家被拒絕加入（code: "room_full"）

  # ── Phase 轉換 ──

  Scenario: Phase 轉換 - dealing → banker-bet
    Given state.phase = "dealing"
    And 發牌完成（每人 3 張）
    When 所有玩家均已收到 myHand
    Then state.phase 應轉換為 "banker-bet"
    And 莊家 30 秒計時器啟動
    And state.action_deadline_timestamp 被設置

  Scenario: Phase 轉換 - banker-bet → player-bet（莊家手動下注）
    Given state.phase = "banker-bet"
    And 莊家發送 banker_bet { amount: 200 }
    When 伺服器驗證下注合法（100 ≤ 200 ≤ 500）
    Then state.phase 應轉換為 "player-bet"
    And state.banker_bet_amount 應為 200
    And 閒家計時器依序啟動（每人 30 秒）

  Scenario: Phase 轉換 - banker-bet 超時自動最低下注
    Given state.phase = "banker-bet"
    And 莊家未在 30 秒內下注
    When 莊家計時器超時
    Then state.banker_bet_amount 自動設為 min_bet = 100
    And state.phase 應轉換為 "player-bet"

  Scenario: Phase 轉換 - player-bet → showdown（所有閒家行動完成）
    Given state.phase = "player-bet"
    And 所有閒家均已 Call 或 Fold
    When 最後一位閒家完成行動
    Then state.phase 應轉換為 "showdown"

  Scenario: Phase 轉換 - player-bet 閒家超時自動 Fold
    Given state.phase = "player-bet"
    And 當前輪到閒家1 行動（30 秒計時）
    And 閒家1 未在 30 秒內行動
    When 閒家1 計時器超時
    Then 閒家1 is_folded = true
    And 輪到下一位閒家行動

  Scenario: Phase 轉換 - showdown → settled（比牌完成）
    Given state.phase = "showdown"
    And 伺服器完成所有未 Fold 玩家的手牌比較
    When 比牌計算完成
    Then state.phase 應轉換為 "settled"
    And 廣播 showdown_reveal（所有未 Fold 玩家手牌）
    And 廣播結算結果

  Scenario: Phase 轉換 - settled → dealing（下一局自動開始）
    Given state.phase = "settled"
    And players.size ≥ 2
    When 結算廣播完成後等待 5 秒
    Then resetForNextRound() 被呼叫
    And 輪莊至下一位莊家
    And state.phase 應轉換為 "dealing"
    And state.round_number 增加 1

  Scenario: Phase 轉換 - settled → waiting（玩家不足）
    Given state.phase = "settled"
    And 結算後 players.size < 2
    When 結算廣播完成
    Then state.phase 應轉換為 "waiting"

  # ── 發牌 ──

  Scenario: 發牌隔離 - 手牌不在公開 State 中
    Given state.phase = "dealing"
    When 發牌完成
    Then 每位玩家的手牌僅透過私人訊息 myHand 推送
    And 公開 Room State 中不包含任何手牌資訊
    And 其他玩家無法從 State diff 取得他人手牌

  Scenario: 斷線重連 - 30 秒內重連恢復手牌
    Given 玩家1 在遊戲進行中斷線
    When 玩家1 在 30 秒內重新連線
    Then PlayerState 保留（is_folded, bet_amount）
    And 伺服器重新推送 myHand 私人訊息至玩家1

  Scenario: 斷線超時 - 超過 30 秒自動 Fold
    Given 玩家1 在 player-bet phase 中斷線
    When 等待超過 30 秒
    Then 玩家1 is_folded = true
    And 遊戲繼續進行（不等待斷線玩家）

  # ── 翻牌與結算 ──

  Scenario: 完整一局遊戲流程（2 人桌）
    Given 玩家1 和 玩家2 加入房間
    And 系統決定莊家（持最多籌碼者）
    When 完整遊戲流程執行
      | 步驟         | 動作                        |
      | dealing      | 每人發 3 張牌               |
      | banker-bet   | 莊家下注 200                |
      | player-bet   | 閒家 Call 200               |
      | showdown     | 比牌（伺服器端執行）          |
      | settled      | 結算籌碼                    |
    Then phase 依序正確轉換（dealing→banker-bet→player-bet→showdown→settled）
    And 籌碼增減符合賠率規則
    And 籌碼守恆驗證通過

  Scenario: onDispose - 房間銷毀寫入 game_sessions
    Given 一局遊戲完整結束
    When 房間解散（onDispose 被呼叫）
    Then 資料庫 game_sessions 寫入本局記錄
    And 記錄包含 room_id, round_number, banker_id, rake_amount, pot_amount, settlement_payload
    And 所有 setTimeout 被清理

  Scenario: resetForNextRound - 狀態正確清空
    Given settled phase 後準備開始下一局
    When resetForNextRound() 被執行
    Then 每位玩家的 bet_amount = 0
    And 每位玩家的 has_acted = false
    And 每位玩家的 is_folded = false
    And state.banker_bet_amount = 0
    And state.current_pot = 0
    And state.settlement 被清空
