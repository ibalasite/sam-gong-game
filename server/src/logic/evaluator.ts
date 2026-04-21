import { CardData, Rank } from './deck';

const RANK_VALUE: Record<Rank, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 10, 'Q': 10, 'K': 10,
};

/**
 * 計算三公點數 (AC-009-1 ~ AC-009-5).
 * Returns 0 for 公牌 (sum divisible by 10), or sum % 10 (1-9) otherwise.
 * Note: comparison uses getEffectivePoints() to treat 0 as highest.
 */
export function calculatePoints(cards: CardData[]): number {
  return cards.reduce((sum, c) => sum + RANK_VALUE[c.rank], 0) % 10;
}

/**
 * Maps raw points to an effective comparison value.
 * 公牌 (0) is treated as 10 (highest); all other values are unchanged.
 */
export function getEffectivePoints(points: number): number {
  return points === 0 ? 10 : points;
}

/**
 * Returns the display label for a hand's points.
 * 0 → "公牌"; 1-9 → digit string.
 */
export function getPointsDisplay(points: number): string {
  return points === 0 ? '公牌' : String(points);
}

// 公牌 (0) is the highest. Treat 0 as 10 for comparison.
// Banker wins on tie.
export function compareHands(
  playerCards: CardData[],
  bankerCards: CardData[]
): 'player' | 'banker' {
  const playerPts = getEffectivePoints(calculatePoints(playerCards));
  const bankerPts = getEffectivePoints(calculatePoints(bankerCards));
  return playerPts > bankerPts ? 'player' : 'banker';
}
