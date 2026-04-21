Feature: Card Dealing (Server-Authoritative)
  As the game system
  I want to deal cards securely on the server
  So that clients cannot cheat

  Scenario: Server deals 3 cards to each active player
    Given 2 players called and 1 folded
    When dealing phase begins
    Then each calling player has exactly 3 cards
    And the folded player has 0 cards

  Scenario: Anti-cheat: Player cannot see opponent cards before reveal
    Given dealing phase is complete
    And P1's cards are [♠A, ♥7, ♣3]
    And P2's cards are [♦K, ♠Q, ♥J]
    When P1 receives their state update
    Then P1 can see their own 3 cards
    And P1 cannot see P2's card details (suit and rank are empty)

  Scenario: Sam Gong point calculation is correct
    Given a hand of [♣J, ♦Q, ♥K]
    When calculatePoints is called
    Then result is 0 (公牌: J+Q+K = 30, 30 mod 10 = 0)

  Scenario: Point calculation for regular hand
    Given a hand of [♠7, ♥8, ♣9]
    When calculatePoints is called
    Then result is 4 (7+8+9=24, 24 mod 10 = 4)

  Scenario: "10" rank is valued as 10
    Given a hand of [♠10, ♥A, ♣2]
    When calculatePoints is called
    Then result is 3 (10+1+2=13, 13 mod 10 = 3)
