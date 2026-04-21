import { createDeck, shuffle, dealCards } from '../../src/logic/deck';

describe('createDeck', () => {
  it('creates 52 cards', () => {
    expect(createDeck()).toHaveLength(52);
  });

  it('has all 4 suits', () => {
    const deck = createDeck();
    const suits = new Set(deck.map(c => c.suit));
    expect(suits).toEqual(new Set(['spades', 'hearts', 'diamonds', 'clubs']));
  });

  it('has all 13 ranks including "10"', () => {
    const deck = createDeck();
    const ranks = new Set(deck.map(c => c.rank));
    expect(ranks).toContain('10');
    expect(ranks.size).toBe(13);
  });

  it('has no duplicate cards', () => {
    const deck = createDeck();
    const keys = deck.map(c => `${c.suit}-${c.rank}`);
    expect(new Set(keys).size).toBe(52);
  });
});

describe('shuffle', () => {
  it('returns 52 cards', () => {
    expect(shuffle(createDeck())).toHaveLength(52);
  });

  it('does not mutate the original deck', () => {
    const original = createDeck();
    const copy = [...original];
    shuffle(original);
    expect(original).toEqual(copy);
  });

  it('produces a different order (probabilistic)', () => {
    const deck = createDeck();
    const results = new Set(
      Array.from({ length: 5 }, () => shuffle(deck).map(c => `${c.suit}-${c.rank}`).join(','))
    );
    // With 52! possibilities, 5 shuffles should not all be identical
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('dealCards', () => {
  it('deals 3 cards to each of N players', () => {
    const deck = shuffle(createDeck());
    const hands = dealCards(deck, 4);
    expect(hands).toHaveLength(4);
    hands.forEach(hand => expect(hand).toHaveLength(3));
  });

  it('deals unique cards (no duplicates across hands)', () => {
    const deck = shuffle(createDeck());
    const hands = dealCards(deck, 4);
    const allCards = hands.flat().map(c => `${c.suit}-${c.rank}`);
    expect(new Set(allCards).size).toBe(allCards.length);
  });

  it('does not modify original deck', () => {
    const deck = shuffle(createDeck());
    const original = [...deck];
    dealCards(deck, 3);
    expect(deck).toEqual(original);
  });

  it('throws when deck is too small for the number of players', () => {
    const smallDeck = createDeck().slice(0, 5); // only 5 cards, need 6 for 2 players
    expect(() => dealCards(smallDeck, 2)).toThrow(
      'Deck has 5 cards but 6 are needed for 2 players'
    );
  });

  it('throws when playerCount is less than 1', () => {
    const deck = createDeck();
    expect(() => dealCards(deck, 0)).toThrow('playerCount must be at least 1, got 0');
  });
});
