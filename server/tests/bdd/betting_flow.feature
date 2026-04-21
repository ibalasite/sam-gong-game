Feature: Betting Flow
  As a player
  I want to call or fold before cards are dealt
  So that I can control my risk

  Scenario: Banker sets bet amount
    Given room is in banker_selection phase
    And P1 is the banker
    When P1 sends set_bet_amount with amount 50
    Then betAmount is set to 50
    And room transitions to betting phase
    And all non-banker players receive countdown of 30s

  Scenario: Invalid bet amount rejected
    Given room is in banker_selection phase
    When banker sends set_bet_amount with amount 75
    Then action is rejected with error code 4006

  Scenario: Player calls successfully
    Given room is in betting phase with betAmount 50
    And P2 has 200 chips
    When P2 sends player_action with action "call"
    Then P2 status becomes "called"
    And P2 hasBet becomes true

  Scenario: Player folds
    Given room is in betting phase
    When P2 sends player_action with action "fold"
    Then P2 status becomes "folded"
    And P2 hasBet remains false

  Scenario: Auto-fold on 30s timeout
    Given room is in betting phase
    And 30 seconds pass without P2 deciding
    When the countdown expires
    Then P2 is automatically folded

  Scenario: All players fold causes no-game
    Given room is in betting phase with 2 non-banker players
    When both non-banker players fold
    Then room transitions to lobby (no-game)
    And no chips change

  Scenario: Player with insufficient chips cannot call
    Given room is in betting phase with betAmount 100
    And P2 has 50 chips
    When P2 attempts to send player_action with action "call"
    Then action is rejected with error code 4005
