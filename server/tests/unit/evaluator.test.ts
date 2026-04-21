import { calculatePoints, compareHands } from '../../src/logic/evaluator';
import { CardData } from '../../src/logic/deck';

const card = (rank: string, suit = 'spades') => ({ suit, rank } as CardData);

describe('calculatePoints', () => {
  it('empty hand returns 0', () => {
    expect(calculatePoints([])).toBe(0);
  });

  it('A+A+A = 3', () => {
    expect(calculatePoints([card('A'), card('A'), card('A')])).toBe(3);
  });

  it('J+Q+K = 0 (公牌)', () => {
    expect(calculatePoints([card('J'), card('Q'), card('K')])).toBe(0);
  });

  it('7+8+9 = 4', () => {
    expect(calculatePoints([card('7'), card('8'), card('9')])).toBe(4);
  });

  it('10+A+2 = 3', () => {
    expect(calculatePoints([card('10'), card('A'), card('2')])).toBe(3);
  });

  it('10+10+10 = 0 (公牌)', () => {
    expect(calculatePoints([card('10'), card('10'), card('10')])).toBe(0);
  });

  it('9+9+9 = 7', () => {
    expect(calculatePoints([card('9'), card('9'), card('9')])).toBe(7);
  });
});

describe('compareHands', () => {
  it('player wins when player points > banker points', () => {
    // player 9 beats banker 5
    const playerCards = [card('9'), card('9', 'hearts'), card('A', 'diamonds')]; // 9+9+1=19, 19%10=9
    const bankerCards = [card('A'), card('2', 'hearts'), card('2', 'diamonds')]; // 1+2+2=5, 5%10=5
    expect(compareHands(playerCards, bankerCards)).toBe('player');
  });

  it('banker wins when banker points > player points', () => {
    const playerCards = [card('A'), card('2', 'hearts'), card('2', 'diamonds')]; // 5
    const bankerCards = [card('9'), card('9', 'hearts'), card('A', 'diamonds')]; // 9
    expect(compareHands(playerCards, bankerCards)).toBe('banker');
  });

  it('banker wins on tie', () => {
    const hand5 = [card('A'), card('2', 'hearts'), card('2', 'diamonds')]; // 5
    const hand5b = [card('A', 'clubs'), card('2', 'clubs'), card('2', 'clubs')]; // 5
    expect(compareHands(hand5, hand5b)).toBe('banker');
  });

  it('公牌(0) beats points 9', () => {
    const gongPai = [card('J'), card('Q'), card('K')]; // 0 = 公牌
    const nine = [card('9'), card('9', 'hearts'), card('A', 'diamonds')]; // 9
    expect(compareHands(gongPai, nine)).toBe('player');
  });

  it('banker 公牌 beats player 公牌 (tie → banker)', () => {
    const gong1 = [card('J'), card('Q'), card('K')];
    const gong2 = [card('10'), card('10', 'hearts'), card('10', 'diamonds')];
    expect(compareHands(gong1, gong2)).toBe('banker');
  });

  it('passes 1000 random comparisons with consistent tie rule', () => {
    // verify tie always returns 'banker'
    // makeHand builds valid 3-card hands yielding the target point value (mod 10)
    // All ranks used are valid members of the Rank union.
    const makeHand = (p: number): CardData[] => {
      // Points map: each entry is a valid [rank, rank, rank] combination whose sum % 10 === p
      const handsByPoints: Record<number, [string, string, string]> = {
        0: ['J', 'Q', 'K'],   // 10+10+10=30 → 0
        1: ['A', 'A', '9'],   // 1+1+9=11 → 1
        2: ['A', 'A', 'K'],   // 1+1+10=12 → 2
        3: ['A', 'A', 'A'],   // 1+1+1=3 → 3
        4: ['A', '3', 'K'],   // 1+3+10=14 → 4
        5: ['A', '4', 'K'],   // 1+4+10=15 → 5
        6: ['A', '5', 'K'],   // 1+5+10=16 → 6
        7: ['A', '6', 'K'],   // 1+6+10=17 → 7
        8: ['A', '7', 'K'],   // 1+7+10=18 → 8
        9: ['9', '9', 'A'],   // 9+9+1=19 → 9
      };
      const [r1, r2, r3] = handsByPoints[p];
      return [card(r1), card(r2, 'hearts'), card(r3, 'diamonds')];
    };
    for (let i = 0; i < 1000; i++) {
      const pts = Math.floor(Math.random() * 10);
      const result = compareHands(makeHand(pts), makeHand(pts));
      expect(result).toBe('banker');
    }
  });
});
