import { settle } from '../../src/logic/settlement';
import { CardData } from '../../src/logic/deck';

const card = (rank: string, suit = 'spades') => ({ suit, rank } as CardData);

describe('settle', () => {
  const bankerCards = [card('9'), card('9', 'hearts'), card('A')]; // pts=9
  const winnerCards = [card('J'), card('Q'), card('K')]; // pts=0 = 公牌, beats 9
  const loserCards = [card('A'), card('2'), card('2')]; // pts=5

  it('player wins: player chips +bet, banker chips -bet', () => {
    const players = new Map([
      ['p1', { cards: winnerCards, hasBet: true, isBanker: false, chips: 100 }],
      ['banker', { cards: bankerCards, hasBet: true, isBanker: true, chips: 100 }],
    ]);
    const results = settle(players, 'banker', 50);
    const p1 = results.find(r => r.sessionId === 'p1')!;
    const bnk = results.find(r => r.sessionId === 'banker')!;
    expect(p1.outcome).toBe('win');
    expect(p1.chipsChange).toBe(50);
    expect(bnk.chipsChange).toBe(-50);
  });

  it('player loses: player chips -bet, banker chips +bet', () => {
    const players = new Map([
      ['p1', { cards: loserCards, hasBet: true, isBanker: false, chips: 100 }],
      ['banker', { cards: bankerCards, hasBet: true, isBanker: true, chips: 100 }],
    ]);
    const results = settle(players, 'banker', 50);
    const p1 = results.find(r => r.sessionId === 'p1')!;
    expect(p1.outcome).toBe('lose');
    expect(p1.chipsChange).toBe(-50);
  });

  it('folded player is excluded from settlement', () => {
    const players = new Map([
      ['p1', { cards: [], hasBet: false, isBanker: false, chips: 100 }],
      ['banker', { cards: bankerCards, hasBet: true, isBanker: true, chips: 100 }],
    ]);
    const results = settle(players, 'banker', 50);
    const p1 = results.find(r => r.sessionId === 'p1');
    expect(p1).toBeUndefined();
  });

  it('multiple players settle independently', () => {
    const players = new Map([
      ['winner', { cards: winnerCards, hasBet: true, isBanker: false, chips: 100 }],
      ['loser', { cards: loserCards, hasBet: true, isBanker: false, chips: 100 }],
      ['banker', { cards: bankerCards, hasBet: true, isBanker: true, chips: 200 }],
    ]);
    const results = settle(players, 'banker', 50);
    const w = results.find(r => r.sessionId === 'winner')!;
    const l = results.find(r => r.sessionId === 'loser')!;
    const b = results.find(r => r.sessionId === 'banker')!;
    expect(w.chipsChange).toBe(50);
    expect(l.chipsChange).toBe(-50);
    expect(b.chipsChange).toBe(0); // net: -50 from winner + 50 from loser = 0
  });

  it('results include finalChips and isBanker fields', () => {
    const players = new Map([
      ['p1', { cards: winnerCards, hasBet: true, isBanker: false, chips: 100 }],
      ['banker', { cards: bankerCards, hasBet: true, isBanker: true, chips: 200 }],
    ]);
    const results = settle(players, 'banker', 50);
    const p1 = results.find(r => r.sessionId === 'p1')!;
    const bnk = results.find(r => r.sessionId === 'banker')!;
    expect(p1.finalChips).toBe(150);
    expect(p1.isBanker).toBe(false);
    expect(bnk.finalChips).toBe(150);
    expect(bnk.isBanker).toBe(true);
  });

  it('all players win: banker loses total of all bets', () => {
    const players = new Map([
      ['p1', { cards: winnerCards, hasBet: true, isBanker: false, chips: 100 }],
      ['p2', { cards: winnerCards, hasBet: true, isBanker: false, chips: 100 }],
      ['banker', { cards: bankerCards, hasBet: true, isBanker: true, chips: 300 }],
    ]);
    const results = settle(players, 'banker', 50);
    const b = results.find(r => r.sessionId === 'banker')!;
    expect(b.chipsChange).toBe(-100); // -50 -50 = -100
    expect(b.outcome).toBe('lose');
  });

  it('all players lose: banker gains total of all bets', () => {
    const players = new Map([
      ['p1', { cards: loserCards, hasBet: true, isBanker: false, chips: 100 }],
      ['p2', { cards: loserCards, hasBet: true, isBanker: false, chips: 100 }],
      ['banker', { cards: bankerCards, hasBet: true, isBanker: true, chips: 100 }],
    ]);
    const results = settle(players, 'banker', 50);
    const b = results.find(r => r.sessionId === 'banker')!;
    expect(b.chipsChange).toBe(100); // +50 +50 = 100
    expect(b.outcome).toBe('win');
  });

  it('throws when bankerId is not in the players map', () => {
    const players = new Map([
      ['p1', { cards: winnerCards, hasBet: true, isBanker: false, chips: 100 }],
    ]);
    expect(() => settle(players, 'nonexistent', 50)).toThrow(
      'Banker with sessionId "nonexistent" not found in players map'
    );
  });
});
