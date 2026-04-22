/**
 * HandEvaluator 單元測試
 *
 * 對應 BDD Feature: tests/features/server/hand_evaluation.feature
 * 測試案例：TC-HE-001 ~ TC-HE-025+
 *
 * 覆蓋範圍：
 * - 三公判定（TC-HE-001~006）
 * - 各點數計算（TC-HE-007~015）
 * - D8 tiebreak 規則（TC-HE-016~022）
 * - compare 勝負判定（TC-HE-023~025+）
 */

import { HandEvaluator, Card, makeCard, calcPoint } from '../../src/game/HandEvaluator';

// ──── 輔助函式 ────

/**
 * 快速建立 Card（自動計算 point）
 */
function card(value: string, suit: string): Card {
  return makeCard(value, suit);
}

/**
 * 建立手牌陣列
 */
function hand(...cards: Card[]): Card[] {
  return cards;
}

// ──── 測試群組 ────

describe('HandEvaluator', () => {
  let evaluator: HandEvaluator;

  beforeEach(() => {
    evaluator = new HandEvaluator();
  });

  // ────────────────────────────────────────────
  // TC-HE-001~006: 三公判定
  // ────────────────────────────────────────────

  describe('三公（Sam Gong）判定', () => {
    it('TC-HE-001: J/Q/K 組合應為三公', () => {
      const h = hand(card('J', 'spade'), card('Q', 'heart'), card('K', 'diamond'));
      const result = evaluator.evaluate(h);

      expect(result.is_sam_gong).toBe(true);
      expect(result.points).toBe(0);
      expect(result.hand_type).toBe('sam_gong');
    });

    it('TC-HE-002: 含 10 的三公組合（10/Q/K）', () => {
      const h = hand(card('10', 'club'), card('Q', 'spade'), card('K', 'heart'));
      const result = evaluator.evaluate(h);

      expect(result.is_sam_gong).toBe(true);
      expect(result.points).toBe(0);
      expect(result.hand_type).toBe('sam_gong');
    });

    it('TC-HE-003: 10/10/10 應為三公', () => {
      const h = hand(card('10', 'spade'), card('10', 'heart'), card('10', 'diamond'));
      const result = evaluator.evaluate(h);

      expect(result.is_sam_gong).toBe(true);
      expect(result.points).toBe(0);
    });

    it('TC-HE-004: K/K/K 應為三公', () => {
      const h = hand(card('K', 'spade'), card('K', 'heart'), card('K', 'diamond'));
      const result = evaluator.evaluate(h);

      expect(result.is_sam_gong).toBe(true);
      expect(result.points).toBe(0);
    });

    it('TC-HE-005: J/J/8 非三公（含人頭牌但非全人頭），points=8', () => {
      const h = hand(card('J', 'spade'), card('J', 'heart'), card('8', 'diamond'));
      const result = evaluator.evaluate(h);

      expect(result.is_sam_gong).toBe(false);
      expect(result.points).toBe(8);
      expect(result.hand_type).toBe('8');
    });

    it('TC-HE-006: 2+4+4=10 mod 10=0，非三公（0點），hand_type="0"', () => {
      const h = hand(card('2', 'spade'), card('4', 'heart'), card('4', 'club'));
      const result = evaluator.evaluate(h);

      expect(result.is_sam_gong).toBe(false);
      expect(result.points).toBe(0);
      expect(result.hand_type).toBe('0');
    });
  });

  // ────────────────────────────────────────────
  // TC-HE-007~015: 各點數計算
  // ────────────────────────────────────────────

  describe('各點數計算（0-9pt）', () => {
    const cases: [string, Card[], number][] = [
      ['A+K+K = 1pt',          [card('A','spade'), card('K','heart'), card('K','diamond')], 1],
      ['A+A+K = 2pt',          [card('A','spade'), card('A','club'), card('K','diamond')], 2],
      ['3+J+Q = 3pt',          [card('3','spade'), card('J','heart'), card('Q','diamond')], 3],
      ['4+K+Q = 4pt',          [card('4','spade'), card('K','heart'), card('Q','diamond')], 4],
      ['2+3+Q = 5pt',          [card('2','spade'), card('3','heart'), card('Q','diamond')], 5],
      ['6+J+Q = 6pt',          [card('6','spade'), card('J','heart'), card('Q','diamond')], 6],
      ['7+K+J = 7pt',          [card('7','spade'), card('K','heart'), card('J','diamond')], 7],
      ['3+5+K = 8pt',          [card('3','spade'), card('5','heart'), card('K','diamond')], 8],
      ['A+8+K = 9pt',          [card('A','spade'), card('8','heart'), card('K','diamond')], 9],
      ['9+9+9 = 27 mod 10=7pt', [card('9','spade'), card('9','heart'), card('9','diamond')], 7],
      ['2+4+4 = 10 mod 10=0pt', [card('2','spade'), card('4','heart'), card('4','club')], 0],
    ];

    test.each(cases)('%s', (_label, cards, expectedPoints) => {
      const result = evaluator.evaluate(cards);
      expect(result.points).toBe(expectedPoints);
      expect(result.is_sam_gong).toBe(false);
    });

    it('TC-HE-007: A 點數為 1 而非 11（A+9+9 = 1+9+9=19 mod 10=9）', () => {
      const h = hand(card('A', 'spade'), card('9', 'heart'), card('9', 'diamond'));
      const result = evaluator.evaluate(h);

      expect(result.points).toBe(9);
      expect(result.is_sam_gong).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // TC-HE-008: calcPoint 單元測試
  // ────────────────────────────────────────────

  describe('calcPoint 函式', () => {
    it('A 的 point 為 1', () => {
      expect(calcPoint('A')).toBe(1);
    });

    it.each(['10', 'J', 'Q', 'K'])('%s 的 point 為 0', (value) => {
      expect(calcPoint(value)).toBe(0);
    });

    it.each(['2', '3', '4', '5', '6', '7', '8', '9'])('%s 的 point 為面值', (value) => {
      expect(calcPoint(value)).toBe(parseInt(value, 10));
    });
  });

  // ────────────────────────────────────────────
  // TC-HE-016~022: D8 tiebreak 規則
  // ────────────────────────────────────────────

  describe('D8 tiebreak — 花色優先順序', () => {
    /**
     * tiebreak 的外部接口是 compare()，透過同點數手牌觸發
     * 建立同點數（5pt）的手牌，只改花色或牌值
     */

    it('TC-HE-016: spade > heart（花色比較）', () => {
      // hand A: 2♠+3♥+K♦ = 5pt, max suit = spade(4)
      // hand B: 2♥+3♣+K♦ = 5pt, max suit = heart(3)
      const resultA = evaluator.evaluate(hand(card('2','spade'), card('3','heart'), card('K','diamond')));
      const resultB = evaluator.evaluate(hand(card('2','heart'), card('3','club'), card('K','diamond')));
      expect(evaluator.compare(resultA, resultB)).toBe(1);
    });

    it('TC-HE-017: heart > diamond', () => {
      const resultA = evaluator.evaluate(hand(card('2','heart'), card('3','club'), card('K','diamond')));
      const resultB = evaluator.evaluate(hand(card('2','diamond'), card('3','club'), card('K','club')));
      expect(evaluator.compare(resultA, resultB)).toBe(1);
    });

    it('TC-HE-018: diamond > club', () => {
      const resultA = evaluator.evaluate(hand(card('2','diamond'), card('3','club'), card('K','club')));
      const resultB = evaluator.evaluate(hand(card('2','club'), card('3','club'), card('K','club')));
      expect(evaluator.compare(resultA, resultB)).toBe(1);
    });

    it('TC-HE-019: 同花色時比牌值 K > Q（VALUE_RANK K=13 > Q=12）', () => {
      // hand A: K♠+2♣+3♦ = 5pt, max suit=spade, max value rank=13
      // hand B: Q♠+4♣+A♦ = 5pt, max suit=spade, max value rank=12
      const resultA = evaluator.evaluate(hand(card('K','spade'), card('2','club'), card('3','diamond')));
      const resultB = evaluator.evaluate(hand(card('Q','spade'), card('4','club'), card('A','diamond')));
      expect(evaluator.compare(resultA, resultB)).toBe(1);
    });

    it('TC-HE-020: A 為最小牌值（VALUE_RANK A=1）', () => {
      // hand A: 2♠+K♥+3♦ = 5pt, max value rank=13(K)
      // hand B: A♠+Q♥+4♦ = 5pt, max value rank=12(Q)
      const resultA = evaluator.evaluate(hand(card('2','spade'), card('K','heart'), card('3','diamond')));
      const resultB = evaluator.evaluate(hand(card('A','spade'), card('Q','heart'), card('4','diamond')));
      expect(evaluator.compare(resultA, resultB)).toBe(1);
    });

    it('TC-HE-021: 完全相同手牌應平手（return 0）', () => {
      // 注意：實際遊戲中不會有重複牌，但測試邊界條件
      const resultA = evaluator.evaluate(hand(card('8','spade'), card('K','heart'), card('J','diamond')));
      const resultB = evaluator.evaluate(hand(card('8','spade'), card('K','heart'), card('J','diamond')));
      expect(evaluator.compare(resultA, resultB)).toBe(0);
    });

    it('TC-HE-022: tiebreak 結果對稱性（A vs B = -(B vs A)）', () => {
      const resultA = evaluator.evaluate(hand(card('K','spade'), card('2','club'), card('3','diamond')));
      const resultB = evaluator.evaluate(hand(card('Q','spade'), card('4','club'), card('A','diamond')));
      const cmpAB = evaluator.compare(resultA, resultB);
      const cmpBA = evaluator.compare(resultB, resultA);
      expect(cmpAB).toBe(1);
      expect(cmpBA).toBe(-1);
    });
  });

  // ────────────────────────────────────────────
  // TC-HE-023~025: compare 勝負判定
  // ────────────────────────────────────────────

  describe('compare — 勝負判定', () => {
    it('TC-HE-023: 三公 vs 9pt — 三公必勝', () => {
      const samGong = evaluator.evaluate(hand(card('J','spade'), card('Q','heart'), card('K','diamond')));
      const ninePoint = evaluator.evaluate(hand(card('9','spade'), card('K','heart'), card('J','diamond')));
      expect(evaluator.compare(samGong, ninePoint)).toBe(1);
    });

    it('TC-HE-024: 9pt vs 三公 — 三公必勝（9pt 輸）', () => {
      const ninePoint = evaluator.evaluate(hand(card('9','spade'), card('K','heart'), card('J','diamond')));
      const samGong = evaluator.evaluate(hand(card('J','spade'), card('Q','heart'), card('K','diamond')));
      expect(evaluator.compare(ninePoint, samGong)).toBe(-1);
    });

    it('TC-HE-025: 高點數勝（9pt vs 8pt）', () => {
      const ninePoint = evaluator.evaluate(hand(card('9','spade'), card('K','heart'), card('J','diamond')));
      const eightPoint = evaluator.evaluate(hand(card('8','spade'), card('K','heart'), card('J','diamond')));
      expect(evaluator.compare(ninePoint, eightPoint)).toBe(1);
    });

    it('TC-HE-026: 低點數敗（5pt vs 7pt）', () => {
      const fivePoint = evaluator.evaluate(hand(card('5','spade'), card('K','heart'), card('J','diamond')));
      const sevenPoint = evaluator.evaluate(hand(card('7','spade'), card('K','heart'), card('J','diamond')));
      expect(evaluator.compare(fivePoint, sevenPoint)).toBe(-1);
    });
  });

  // ────────────────────────────────────────────
  // compareHands 整合測試
  // ────────────────────────────────────────────

  describe('compareHands — 閒家 vs 莊家', () => {
    it('閒家三公 vs 莊家 9pt → win', () => {
      const playerHand = hand(card('J','spade'), card('Q','heart'), card('K','diamond'));
      const bankerHand = hand(card('9','spade'), card('K','heart'), card('J','diamond'));
      expect(evaluator.compareHands(playerHand, bankerHand)).toBe('win');
    });

    it('閒家 9pt vs 莊家三公 → lose', () => {
      const playerHand = hand(card('9','spade'), card('K','heart'), card('J','diamond'));
      const bankerHand = hand(card('J','spade'), card('Q','heart'), card('K','diamond'));
      expect(evaluator.compareHands(playerHand, bankerHand)).toBe('lose');
    });

    it('同點且同花同值 → tie', () => {
      const playerHand = hand(card('8','spade'), card('K','heart'), card('J','diamond'));
      const bankerHand = hand(card('8','spade'), card('K','heart'), card('J','diamond'));
      expect(evaluator.compareHands(playerHand, bankerHand)).toBe('tie');
    });
  });

  // ────────────────────────────────────────────
  // getPayoutMultiplier 測試
  // ────────────────────────────────────────────

  describe('getPayoutMultiplier — 賠率倍數', () => {
    it('三公 → N=3', () => {
      const result = evaluator.evaluate(hand(card('J','spade'), card('Q','heart'), card('K','diamond')));
      expect(evaluator.getPayoutMultiplier(result)).toBe(3);
    });

    it('9點 → N=2', () => {
      const result = evaluator.evaluate(hand(card('9','spade'), card('K','heart'), card('J','diamond')));
      expect(evaluator.getPayoutMultiplier(result)).toBe(2);
    });

    it('8點（非三公）→ N=1', () => {
      const result = evaluator.evaluate(hand(card('8','spade'), card('K','heart'), card('J','diamond')));
      expect(evaluator.getPayoutMultiplier(result)).toBe(1);
    });

    it('0點（非三公）→ N=1', () => {
      const result = evaluator.evaluate(hand(card('2','spade'), card('4','heart'), card('4','club')));
      expect(result.is_sam_gong).toBe(false);
      expect(evaluator.getPayoutMultiplier(result)).toBe(1);
    });
  });

  // ────────────────────────────────────────────
  // 邊界條件與整數運算驗證
  // ────────────────────────────────────────────

  describe('邊界條件', () => {
    it('TC-HE-整數運算: 9+9+9=27 mod 10=7（禁止浮點）', () => {
      const h = hand(card('9','spade'), card('9','heart'), card('9','diamond'));
      const result = evaluator.evaluate(h);
      expect(result.points).toBe(7);
      expect(Number.isInteger(result.points)).toBe(true);
    });

    it('evaluate 輸入非 3 張牌時應拋出錯誤', () => {
      expect(() => {
        evaluator.evaluate([card('A','spade'), card('K','heart')]);
      }).toThrow();
    });

    it('所有三公牌型確認：10/J/Q/K 組合', () => {
      const values = ['10', 'J', 'Q', 'K'];
      for (const v of values) {
        expect(calcPoint(v)).toBe(0);
      }
    });

    // ────────────────────────────────────────────
    // D8 tiebreak：A 因花色排名低而落敗（覆蓋 maxSuitA < maxSuitB → -1）
    // ────────────────────────────────────────────

    it('TC-HE-027: tiebreak — A 花色 < B 花色時 compare 返回 -1（A=club, B=spade）', () => {
      // hand A: 2♣+3♣+K♣ = 5pt, maxSuit=club(1)
      // hand B: 2♠+3♣+K♦ = 5pt, maxSuit=spade(4)
      // A 點數相同，但 A.maxSuit(1) < B.maxSuit(4) → -1
      const resultA = evaluator.evaluate(hand(card('2','club'), card('3','club'), card('K','club')));
      const resultB = evaluator.evaluate(hand(card('2','spade'), card('3','club'), card('K','diamond')));
      expect(evaluator.compare(resultA, resultB)).toBe(-1);
    });

    it('TC-HE-028: tiebreak — A 牌值 < B 牌值時 compare 返回 -1（同花色，A=Q♠ B=K♠）', () => {
      // hand A: Q♠+4♣+A♦ = 5pt, maxSuit=spade(4), maxValueRank=12(Q)
      // hand B: K♠+2♣+3♦ = 5pt, maxSuit=spade(4), maxValueRank=13(K)
      // A 點數相同，最大花色相同，A.maxValue(12) < B.maxValue(13) → -1
      const resultA = evaluator.evaluate(hand(card('Q','spade'), card('4','club'), card('A','diamond')));
      const resultB = evaluator.evaluate(hand(card('K','spade'), card('2','club'), card('3','diamond')));
      expect(evaluator.compare(resultA, resultB)).toBe(-1);
    });

    it('TC-HE-029: tiebreak — A 含未知花色應安全降級為 0（A.??0 防禦分支）', () => {
      // 直接構造含有未知花色的 Card（繞過 makeCard，測試防禦分支）
      const unknownSuitCard: import('../../src/game/HandEvaluator').Card = {
        value: '2', suit: 'joker', point: 2,
      };
      const handWithUnknown = [
        unknownSuitCard,
        card('3','club'),
        card('K','club'),
      ];
      // 同點數 5pt，A 含未知花色（suit_rank=0 via ??0），B 含 club(1)
      const resultA = evaluator.evaluate(handWithUnknown);
      const resultB = evaluator.evaluate(hand(card('2','club'), card('3','club'), card('K','club')));
      // A 的 maxSuit=max(0,1,1)=1, B 的 maxSuit=max(1,1,1)=1 → 同花色 → 比牌值
      // A.maxValue=K(13), B.maxValue=K(13) → 平手
      expect(evaluator.compare(resultA, resultB)).toBe(0);
    });

    it('TC-HE-029b: tiebreak — B 含未知花色應安全降級為 0（B.??0 防禦分支）', () => {
      // 把未知花色放在 B 手牌，以覆蓋 b.hand.map 的 ??0 分支（line 153）
      const unknownSuitCard: import('../../src/game/HandEvaluator').Card = {
        value: '2', suit: 'joker', point: 2,
      };
      const handBWithUnknown = [
        unknownSuitCard,
        card('3','club'),
        card('K','club'),
      ];
      const resultA = evaluator.evaluate(hand(card('2','club'), card('3','club'), card('K','club')));
      const resultB = evaluator.evaluate(handBWithUnknown);
      // A.maxSuit=max(1,1,1)=1, B.maxSuit=max(0,1,1)=1 → 同花色 → 比牌值 → 平手
      expect(evaluator.compare(resultA, resultB)).toBe(0);
    });

    it('TC-HE-030: tiebreak — A 含未知牌值應安全降級為 0（A.??0 防禦分支）', () => {
      // 直接構造含有未知牌值的 Card
      const unknownValueCard: import('../../src/game/HandEvaluator').Card = {
        value: 'JOKER', suit: 'spade', point: 0,
      };
      const handWithUnknown = [
        unknownValueCard,
        card('3','spade'),
        card('K','spade'),
      ];
      // 0+3+0=3pt（JOKER point=0），B 也 3pt
      const resultA = evaluator.evaluate(handWithUnknown);
      const resultB = evaluator.evaluate(hand(card('3','spade'), card('K','spade'), card('Q','spade')));
      // A: maxSuit=spade(4), maxValue=max(0,3,13)=13(K) via ??0 for JOKER
      // B: maxSuit=spade(4), maxValue=max(13,13,12)=13(K)
      // A.maxSuit = B.maxSuit, A.maxValue = B.maxValue → 平手
      expect(evaluator.compare(resultA, resultB)).toBe(0);
    });

    it('TC-HE-030b: tiebreak — B 含未知牌值應安全降級為 0（B.??0 防禦分支）', () => {
      // 把未知牌值放在 B 手牌，覆蓋 b.hand.map 的 ??0 分支（line 160）
      const unknownValueCard: import('../../src/game/HandEvaluator').Card = {
        value: 'JOKER', suit: 'spade', point: 0,
      };
      const handBWithUnknown = [
        unknownValueCard,
        card('3','spade'),
        card('K','spade'),
      ];
      const resultA = evaluator.evaluate(hand(card('3','spade'), card('K','spade'), card('Q','spade')));
      const resultB = evaluator.evaluate(handBWithUnknown);
      // A: maxSuit=spade(4), maxValue=max(13,13,12)=13(K)
      // B: maxSuit=spade(4), maxValue=max(0,3,13)=13(K) via ??0 for JOKER → 平手
      expect(evaluator.compare(resultA, resultB)).toBe(0);
    });
  });
});
