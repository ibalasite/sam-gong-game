Feature: Room Management
  As a player
  I want to create and join game rooms
  So that I can play Sam Gong with friends

  Scenario: Create a new room
    Given no existing room
    When player creates a new sam_gong room
    Then room is created with a 6-character alphanumeric code
    And player is added to room state
    And player is marked as host

  Scenario: Join an existing room by code
    Given a room exists with code "ABC123"
    And the room has 1 player
    When a second player joins with code "ABC123"
    Then second player is added to room state
    And room has 2 players

  Scenario: Room rejects 7th player
    Given a room exists with 6 players
    When a 7th player attempts to join
    Then the join is rejected with error code 4002

  Scenario: Cannot start game with only 1 player
    Given a room with 1 player
    When host sends start_game
    Then the action is rejected
    And room phase remains "lobby"

  Scenario: Start game with 2+ players
    Given a room with 2 players
    When host sends start_game
    Then room phase transitions to "banker_selection"
