Feature: Banker Rotation
  As a game server
  I want to rotate the banker role correctly after each round
  So that all eligible players get a fair chance to be the banker

  Background:
    Given BankerRotation 模組已初始化
    And 輪莊規則為順時針循環
    And 莊家資格要求 chip_balance ≥ min_bet
    And min_bet = 100（青銅廳）

  # ── 首局莊家選定 ──

  Scenario: 首局莊家 - 持最多籌碼者擔任
    Given 房間有 3 位玩家
      | seat | player_id | chip_balance |
      | 0    | p0        | 5000         |
      | 1    | p1        | 3000         |
      | 2    | p2        | 2000         |
    When 呼叫 determineFirstBanker(players)
    Then 返回 seat 0（chip_balance 最多）
    And state.banker_seat_index = 0

  Scenario: 首局莊家 - 同籌碼時按進入順序（先入座者優先）
    Given 房間有 2 位玩家
      | seat | player_id | chip_balance |
      | 0    | p0        | 5000         |
      | 1    | p1        | 5000         |
    When 呼叫 determineFirstBanker(players)
    Then 返回 seat 0（先入座者 p0）

  Scenario: 首局莊家 - 多人同籌碼時最小 seat_index 優先
    Given 房間有 4 位玩家，其中 3 位籌碼相同
      | seat | player_id | chip_balance |
      | 0    | p0        | 3000         |
      | 1    | p1        | 5000         |
      | 2    | p2        | 5000         |
      | 3    | p3        | 5000         |
    When 呼叫 determineFirstBanker(players)
    Then 返回 seat 1（最多籌碼中的最小 seat_index）

  # ── 正常輪莊 ──

  Scenario: 正常輪莊 - seat 0 → seat 1（順時針）
    Given 房間有 4 位玩家（seat 0,1,2,3）
    And 當前莊家為 seat 0
    When 呼叫 rotate(currentBankerSeat=0, players)
    Then 返回 seat 1

  Scenario: 正常輪莊 - 環繞邊界（最後玩家 → 第一玩家）
    Given 房間有 4 位玩家（seat 0,1,2,3）
    And 當前莊家為 seat 3
    When 呼叫 rotate(currentBankerSeat=3, players)
    Then 返回 seat 0（環繞至第一位）

  Scenario: 正常輪莊 - 2 人桌
    Given 房間有 2 位玩家（seat 0, seat 1）
    And 當前莊家為 seat 0
    When 呼叫 rotate(currentBankerSeat=0, players)
    Then 返回 seat 1
    And 再次輪莊返回 seat 0（2 人桌循環）

  Scenario: 正常輪莊 - 6 人桌完整循環
    Given 房間有 6 位玩家（seat 0,1,2,3,4,5）
    And 當前莊家為 seat 5
    When 呼叫 rotate(currentBankerSeat=5, players)
    Then 返回 seat 0（環繞邊界）

  # ── 跳過籌碼不足莊家 ──

  Scenario: 跳過破產莊家 - chip < min_bet 時跳過
    Given 房間有 3 位玩家
      | seat | player_id | chip_balance |
      | 0    | p0        | 5000         |
      | 1    | p1        | 0            |
      | 2    | p2        | 3000         |
    And 當前莊家為 seat 0
    When 輪莊至 seat 1（chip=0，低於 min_bet=100）
    Then skipInsolventBanker 跳過 seat 1
    And 返回 seat 2 作為下一位莊家

  Scenario: 連續跳過多位破產莊家
    Given 房間有 5 位玩家
      | seat | player_id | chip_balance |
      | 0    | p0        | 5000         |
      | 1    | p1        | 0            |
      | 2    | p2        | 50           |
      | 3    | p3        | 3000         |
      | 4    | p4        | 2000         |
    And 當前莊家為 seat 0
    When 依順時針輪莊
    Then 跳過 seat 1（chip=0）
    And 跳過 seat 2（chip=50 < min_bet=100）
    And 返回 seat 3 作為下一位莊家

  Scenario: 跳過破產莊家 - 環繞邊界
    Given 房間有 3 位玩家
      | seat | player_id | chip_balance |
      | 0    | p0        | 0            |
      | 1    | p1        | 5000         |
      | 2    | p2        | 3000         |
    And 當前莊家為 seat 2
    When 輪莊（環繞至 seat 0，chip=0，跳過）
    Then skipInsolventBanker 跳過 seat 0
    And 返回 seat 1 作為下一位莊家

  # ── 所有候選莊家均不合格 ──

  Scenario: 所有玩家籌碼不足 - 返回 waiting 狀態
    Given 房間有 3 位玩家，所有人 chip_balance < min_bet
      | seat | player_id | chip_balance |
      | 0    | p0        | 50           |
      | 1    | p1        | 30           |
      | 2    | p2        | 0            |
    When 執行輪莊邏輯
    Then skipInsolventBanker 返回 -1（無合格莊家）
    And state.phase 轉換為 "waiting"
    And 等待玩家籌碼補充

  # ── 中途離場處理 ──

  Scenario: 中途離場玩家從輪莊序列中移除
    Given 房間有 4 位玩家（seat 0,1,2,3）
    And 當前莊家為 seat 1
    And seat 2 玩家在本局結束前離場
    When 本局結算後執行輪莊
    Then banker_rotation_queue 不包含 seat 2
    And 從 seat 1 順時針尋找下一莊家（跳過 seat 2）
    And 返回 seat 3

  Scenario: Fold 玩家正常參與輪莊（不跳過）
    Given 房間有 4 位玩家（seat 0,1,2,3）
    And 本局 seat 1 選擇 Fold
    And 當前莊家為 seat 0
    When 本局結算後執行輪莊
    Then seat 1 仍在輪莊序列中
    And 返回 seat 1 作為下一位莊家（Fold 不影響輪莊資格）

  # ── 輪莊與 resetForNextRound 整合 ──

  Scenario: resetForNextRound 整合輪莊
    Given 本局結算完成（settled phase）
    And 當前莊家為 seat 1
    And players.size ≥ 2
    When resetForNextRound() 被呼叫
    Then BankerRotation.rotate() 被呼叫
    And state.banker_seat_index 更新為下一位合格莊家的 seat_index
    And 新莊家的 is_banker = true
    And 舊莊家的 is_banker = false

  Scenario Outline: 輪莊序列完整性驗證
    Given 房間有 <player_count> 位玩家（seat 0 ~ <last_seat>）
    And 當前莊家為 seat <current_banker>
    When 執行 <rounds> 輪輪莊
    Then 輪莊序列完整循環一圈
    And 無任何玩家被重複跳過

    Examples:
      | player_count | last_seat | current_banker | rounds |
      | 2            | 1         | 0              | 2      |
      | 3            | 2         | 0              | 3      |
      | 4            | 3         | 0              | 4      |
      | 5            | 4         | 0              | 5      |
      | 6            | 5         | 0              | 6      |
