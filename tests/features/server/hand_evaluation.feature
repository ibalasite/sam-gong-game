Feature: Hand Evaluation
  As a game server
  I want to evaluate player hand values accurately
  So that game outcomes are fair and consistent with Sam Gong rules

  Background:
    Given the HandEvaluator module is initialized
    And card point values are: A=1, 2-9=face value, 10/J/Q/K=0
    And hand points are calculated as sum mod 10

  # ── 三公（Sam Gong）判定 ──

  Scenario: 三公判定 - J/Q/K 組合為三公
    Given 玩家持有牌 J♠, Q♥, K♦
    When 計算手牌點數
    Then points 應為 0
    And is_sam_gong 應為 true
    And hand_type 應為 "sam_gong"

  Scenario: 三公判定 - 含 10 的三公組合
    Given 玩家持有牌 10♣, Q♠, K♥
    When 計算手牌點數
    Then points 應為 0
    And is_sam_gong 應為 true
    And hand_type 應為 "sam_gong"

  Scenario: 非三公 - J/J/8 組合（含人頭牌但非全人頭）
    Given 玩家持有牌 J♠, J♥, 8♦
    When 計算手牌點數
    Then points 應為 8
    And is_sam_gong 應為 false
    And hand_type 應為 "8"

  Scenario: 0點判定 - 非三公（2+4+4=10 mod 10=0）
    Given 玩家持有牌 2♠, 4♥, 4♣
    When 計算手牌點數
    Then points 應為 0
    And is_sam_gong 應為 false
    And hand_type 應為 "0"

  # ── Scenario Outline：各點數計算（0-9pt）──

  Scenario Outline: 各點數計算
    Given 玩家持有牌 <hand>
    When 計算手牌點數
    Then points 應為 <points>
    And is_sam_gong 應為 false

    Examples:
      | hand            | points |
      | A♠,K♥,K♦       | 1      |
      | A♠,A♣,K♦       | 2      |
      | 3♠,J♥,Q♦       | 3      |
      | 4♠,K♥,Q♦       | 4      |
      | 2♠,3♥,Q♦       | 5      |
      | 6♠,J♥,Q♦       | 6      |
      | 7♠,K♥,J♦       | 7      |
      | 3♠,5♥,K♦       | 8      |
      | A♠,8♥,K♦       | 9      |
      | 9♠,9♥,9♦       | 7      |
      | 2♠,4♥,4♣       | 0      |

  # ── A 點數驗證 ──

  Scenario: A 點數為 1 而非 11
    Given 玩家持有牌 A♠, 9♥, 9♦
    When 計算手牌點數
    Then points 應為 9
    And is_sam_gong 應為 false

  # ── D8 同點比牌（tiebreak）──

  Scenario Outline: D8 tiebreak - 花色優先順序比較
    Given 玩家1 持有最大花色 <suit1>
    And 玩家2 持有最大花色 <suit2>
    When 執行 tiebreak 比較
    Then 結果應為 <result>

    Examples:
      | suit1   | suit2   | result |
      | spade   | heart   | 1      |
      | heart   | diamond | 1      |
      | diamond | club    | 1      |
      | spade   | diamond | 1      |
      | spade   | club    | 1      |
      | heart   | club    | 1      |

  Scenario: D8 tiebreak - 同花色時比牌值 K > Q
    Given 玩家1 持有牌 K♠, 2♣, 3♦（點數=5）
    And 玩家2 持有牌 Q♠, 4♣, A♦（點數=5）
    When 執行 tiebreak 比較
    Then 結果應為 1（玩家1 勝）

  Scenario: D8 tiebreak - A 為最小牌值
    Given 玩家1 持有牌 2♠, K♥, 3♦（點數=5）
    And 玩家2 持有牌 A♠, Q♥, 4♦（點數=5）
    When 執行 tiebreak 比較
    Then 結果應為 1（玩家1 勝）

  Scenario: D8 tiebreak - 完全相同手牌平手
    Given 玩家1 持有牌 8♠, K♥, J♦（點數=8）
    And 玩家2 持有牌 8♠, K♥, J♦（點數=8）
    When 執行 tiebreak 比較
    Then 結果應為 0（平手）

  # ── compare：閒家 vs 莊家 ──

  Scenario Outline: compare 勝負判定
    Given 閒家手牌 <player_hand>
    And 莊家手牌 <banker_hand>
    When 執行 compare 比較
    Then 結果應為 <outcome>

    Examples:
      | player_hand    | banker_hand    | outcome |
      | 三公           | 9pt            | win     |
      | 9pt            | 三公           | lose    |
      | 9pt            | 8pt            | win     |
      | 5pt            | 7pt            | lose    |
      | 8pt♠           | 8pt♥           | win     |
      | 8pt（同花同值）| 8pt（同花同值）| tie     |

  Scenario: compare 比較 - 閒家三公 vs 莊家 9pt 閒家必勝
    Given 閒家持有牌 J♠, Q♥, K♦（三公）
    And 莊家持有牌 9♠, K♥, J♦（9pt）
    When 執行 compare 比較
    Then 結果應為 "win"

  Scenario: compare 比較 - 莊家三公 vs 閒家 9pt 閒家必輸
    Given 閒家持有牌 9♠, K♥, J♦（9pt）
    And 莊家持有牌 J♠, Q♥, K♦（三公）
    When 執行 compare 比較
    Then 結果應為 "lose"

  Scenario: 整數運算邊界 - 禁止使用浮點數
    Given 玩家持有牌 9♠, 9♥, 9♦（9+9+9=27 mod 10=7）
    When 計算手牌點數
    Then points 應為 7
    And 計算過程不使用浮點數運算
