Feature: Settlement
  As a game server
  I want to calculate settlement results correctly
  So that chips are distributed fairly and the chip conservation law is always satisfied

  Background:
    Given the SettlementEngine module is initialized
    And 賠率規則為 三公=3倍, 9點=2倍, 0-8點（非三公）=1倍, 平手=退注
    And Rake 計算公式為 floor(pot × 5%) 最少 1（pot > 0 時），pot = 0 時 rake = 0
    And 籌碼守恆規則：sum(all net_chips) + rake_amount === 0

  # ── Winner 賠率結算 ──

  Scenario: Winner 1倍賠率結算 - 普通點數贏家
    Given 莊家下注額 banker_bet = 1000
    And 閒家1 跟注（called_bet = 1000）且持有 8pt 勝出
    And 閒家2 跟注（called_bet = 1000）且持有 5pt 輸給莊家
    When 執行結算
    Then 閒家1 net_chips 應為 +1000（N=1 × banker_bet = 1000）
    And 閒家2 net_chips 應為 -1000
    And pot_amount 應為 1000（僅輸家 called_bet）
    And rake_amount 應為 50（floor(1000 × 0.05) = 50）
    And 籌碼守恆驗證通過：sum(net_chips) + rake === 0

  Scenario: Winner 三公 3倍賠率結算
    Given 莊家下注額 banker_bet = 500
    And 閒家1 跟注（called_bet = 500）且持有三公
    And 閒家2 跟注（called_bet = 500）且持有 5pt 輸給莊家
    When 執行結算
    Then 閒家1 net_chips 應為 +1500（N=3 × banker_bet = 1500）
    And 閒家2 net_chips 應為 -500
    And rake_amount 應為 25（floor(500 × 0.05) = 25）
    And 籌碼守恆驗證通過：sum(net_chips) + rake === 0

  Scenario: Winner 9點 2倍賠率結算
    Given 莊家下注額 banker_bet = 500
    And 閒家1 跟注（called_bet = 500）且持有 9pt 勝出
    And 閒家2 跟注（called_bet = 500）且持有 3pt 輸給莊家
    When 執行結算
    Then 閒家1 net_chips 應為 +1000（N=2 × banker_bet = 1000）
    And rake_amount 應為 25（floor(500 × 0.05) = 25）
    And 籌碼守恆驗證通過

  # ── Loser 結算 ──

  Scenario: Loser net_chips 為負的 called_bet
    Given 莊家下注額 banker_bet = 300
    And 閒家1 跟注（called_bet = 300）且持有 3pt 輸給 5pt 莊家
    When 執行結算
    Then 閒家1 net_chips 應為 -300
    And 閒家1 payout_amount 應為 0

  # ── allFold 全員棄牌 ──

  Scenario: allFold - 2 人桌唯一閒家 Fold
    Given 莊家下注額 banker_bet = 200
    And 閒家1 選擇 Fold
    When 執行結算
    Then all_fold 應為 true
    And pot_amount 應為 0
    And rake_amount 應為 0
    And 莊家 escrow 退回（莊家 net_chips = 0）
    And 所有玩家 net_chips 均為 0

  Scenario: allFold - 6 人桌全員 5 位閒家 Fold
    Given 莊家下注額 banker_bet = 500
    And 5 位閒家全部選擇 Fold
    When 執行結算
    Then all_fold 應為 true
    And pot_amount 應為 0
    And rake_amount 應為 0
    And 莊家 escrow 退回
    And 所有閒家 net_chips 均為 0

  # ── Rake 計算 ──

  Scenario Outline: Rake 計算驗證
    Given pot_amount 為 <pot>
    When 計算 rake
    Then rake_amount 應為 <rake>

    Examples:
      | pot  | rake |
      | 0    | 0    |
      | 1    | 1    |
      | 10   | 1    |
      | 19   | 1    |
      | 20   | 1    |
      | 100  | 5    |
      | 500  | 25   |
      | 1000 | 50   |
      | 2000 | 100  |

  Scenario: Rake 計算 - pot=0 時不適用最少 1 規則
    Given 全員棄牌（all_fold = true）
    And pot_amount 為 0
    When 計算 rake
    Then rake_amount 應為 0
    And 不適用最小 rake = 1 規則

  Scenario: Rake 計算 - pot=1 時使用最少 1 規則
    Given 1 位閒家輸家 called_bet = 1
    And pot_amount 為 1
    When 計算 rake
    Then rake_amount 應為 1（floor(1 × 0.05) = 0，但最少 1）

  # ── 莊家破產先到先得 ──

  Scenario: 莊家破產 - 順時針先到先得
    Given 莊家籌碼 banker_chips = 800
    And 莊家下注額 banker_bet = 500
    And 閒家1（seat=1）跟注且勝出（need_payout = 500）
    And 閒家2（seat=2）跟注且勝出（need_payout = 500）
    And 閒家1 在座位順序中先於 閒家2（順時針）
    When 執行結算（莊家破產）
    Then 閒家1 獲得全額支付 net_chips = +500
    And 閒家2 進入 insolvent_winners
    And 閒家2 net_chips 應為 -500（等於 -called_bet，非零）
    And banker_insolvent 應為 true

  Scenario: Insolvent Winner net_chips 必須為 -called_bet 非零
    Given 莊家破產且無法支付某贏家
    When 執行結算
    Then 未獲支付贏家的 result 應為 "insolvent_win"
    And 未獲支付贏家的 net_chips 應為 -called_bet
    And net_chips 不得為 0

  # ── 平手結算 ──

  Scenario: 平手（tie）情境 - 退注不入底池
    Given 閒家1 與莊家同點且 D8 tiebreak 完全相同
    When 執行結算
    Then 閒家1 result 應為 "tie"
    And 閒家1 net_chips 應為 0
    And 閒家1 payout_amount 等於 called_bet（退回原注）
    And 閒家1 called_bet 不計入 pot_amount

  # ── 籌碼守恆 ──

  Scenario: 籌碼守恆驗證 - 任意合法結算場景
    Given 任意合法的結算輸入（有贏家、輸家、平手）
    When 執行結算
    Then sum(all participants' net_chips) + rake_amount 應等於 0
    And 若驗證失敗則回滾事務並記錄 CRITICAL log

  Scenario: 多贏家情境 - 2 贏 1 輸
    Given 莊家下注額 banker_bet = 300
    And 閒家1 跟注（300）且持有 8pt 勝出（N=1）
    And 閒家2 跟注（300）且持有 9pt 勝出（N=2）
    And 閒家3 跟注（300）且持有 2pt 輸給莊家
    When 執行結算
    Then 閒家1 net_chips 應為 +300
    And 閒家2 net_chips 應為 +600
    And 閒家3 net_chips 應為 -300
    And rake_amount 應為 15（floor(300 × 0.05) = 15）
    And 籌碼守恆驗證通過

  Scenario: 莊家 net_chips 計算驗證
    Given 莊家下注額 banker_bet = 500
    And 閒家1 跟注（500）且持有 8pt 勝出（N=1）
    And 閒家2 跟注（500）且持有 3pt 輸給莊家
    When 執行結算
    Then 莊家 net_chips = loser_called_bet - rake - winner_payout
    And 莊家 net_chips 應為 500 - 25 - 500 = -25
    And 籌碼守恆驗證通過
