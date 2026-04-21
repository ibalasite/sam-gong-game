Feature: Reveal and Settlement
  As a player
  I want cards to be revealed and chips settled correctly
  So that the game outcome is fair and accurate

  Scenario: All cards revealed on reveal phase
    Given all players have been dealt cards
    When reveal phase begins (countdown expires or all ready)
    Then all cards have revealed=true
    And all clients receive all card details

  Scenario: Player beats banker
    Given player has points 9 (e.g. [♠9, ♥9, ♦9] → 27 mod 10 = 7... adjust for actual 9)
    And banker has points 5
    When settlement is calculated
    Then player chips increase by betAmount
    And banker chips decrease by betAmount

  Scenario: Banker beats player
    Given player has points 5
    And banker has points 9
    When settlement is calculated
    Then player chips decrease by betAmount
    And banker chips increase by betAmount

  Scenario: Tie goes to banker
    Given player has points 7
    And banker has points 7
    When settlement is calculated
    Then player chips decrease by betAmount
    And banker chips increase by betAmount

  Scenario: 公牌(0) beats all non-公牌 hands
    Given player has 公牌 (points=0, e.g. [J,Q,K])
    And banker has points 9
    When settlement is calculated
    Then player wins (player chips increase by betAmount)

  Scenario: Folded player excluded from settlement
    Given P2 folded in betting phase
    When settlement is calculated
    Then P2 chips are unchanged
    And P2 is not in the settlement results
