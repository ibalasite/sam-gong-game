Feature: Disconnection and Reconnection
  As a player who lost connection
  I want to reconnect within 60 seconds
  So that I don't lose my game progress

  Scenario: Player reconnects within 60 seconds
    Given a game is in progress
    And P2 disconnects
    When P2 reconnects within 30 seconds
    Then P2 status is restored to previous active status
    And P2 receives current game state via schema sync

  Scenario: Player state preserved during disconnect
    Given P2 has bet and is waiting for cards
    When P2 disconnects
    Then P2's hasBet status is preserved in server state
    And other players continue the game

  Scenario: Player removed after 60 second timeout
    Given P2 disconnects during betting phase
    When 65 seconds pass without P2 reconnecting
    Then P2 is automatically folded
    And game continues without P2
