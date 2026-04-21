Feature: Banker Mechanic
  As the game system
  I want to select and rotate the banker
  So that all players take turns being banker

  Scenario: Initial banker is randomly selected
    Given a game starts with 3 players [P1, P2, P3]
    When the game transitions to banker_selection
    Then exactly one player has isBanker=true
    And that player's sessionId is in the player list

  Scenario: Banker rotates after each round
    Given P1 is the current banker
    And a round completes
    When the next round begins
    Then the banker is the next player in seat order
    And P1 no longer has isBanker=true

  Scenario: Banker rotation wraps around
    Given players [P1, P2, P3] in seat order
    And P3 is the current banker
    When a round completes
    Then P1 becomes the next banker
