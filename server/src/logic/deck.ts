export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface CardData {
  suit: Suit;
  rank: Rank;
}

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Number of cards dealt to each player per round in 三公 (Sam Gong). */
export const CARDS_PER_PLAYER = 3;

export function createDeck(): CardData[] {
  return SUITS.flatMap(suit => RANKS.map(rank => ({ suit, rank })));
}

export function shuffle(deck: CardData[]): CardData[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function dealCards(deck: CardData[], playerCount: number): CardData[][] {
  if (playerCount < 1) {
    throw new Error(`playerCount must be at least 1, got ${playerCount}`);
  }
  const cardsNeeded = playerCount * CARDS_PER_PLAYER;
  if (deck.length < cardsNeeded) {
    throw new Error(
      `Deck has ${deck.length} cards but ${cardsNeeded} are needed for ${playerCount} players`
    );
  }
  const hands: CardData[][] = Array.from({ length: playerCount }, () => []);
  for (let i = 0; i < cardsNeeded; i++) {
    hands[i % playerCount].push(deck[i]);
  }
  return hands;
}
