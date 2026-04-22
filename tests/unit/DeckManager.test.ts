/**
 * DeckManager 單元測試
 *
 * 規格來源：EDD §3.6 DeckManager
 *
 * 覆蓋範圍：
 * - buildDeck()：52 張牌建立
 * - shuffle()：Fisher-Yates（統計分佈驗證）
 * - deal(n)：發牌張數、剩餘牌數、耗盡拋錯
 * - loadTutorialScript()：教學固定劇本載入
 * - dealTutorialBankerHand() / dealTutorialPlayerHand()：固定手牌
 * - reset()：重置狀態
 */

import { DeckManager, CardDTO } from '../../src/game/DeckManager';

// ──────────────────────────────────────────────
// 輔助函式
// ──────────────────────────────────────────────

/** 計算手牌點數 mod 10 */
function calcPoints(hand: CardDTO[]): number {
  return hand.reduce((sum, c) => sum + c.point, 0) % 10;
}

/** 判斷是否三公 */
function isSamGong(hand: CardDTO[]): boolean {
  return hand.every((c) => ['10', 'J', 'Q', 'K'].includes(c.value));
}

// ──────────────────────────────────────────────
// 測試群組
// ──────────────────────────────────────────────

describe('DeckManager', () => {
  let deck: DeckManager;

  beforeEach(() => {
    deck = new DeckManager();
  });

  // ────────────────────────────────────────────
  // buildDeck
  // ────────────────────────────────────────────

  describe('buildDeck()', () => {
    it('TC-DM-001: buildDeck 後剩餘 52 張牌', () => {
      deck.buildDeck();
      expect(deck.getRemainingCount()).toBe(52);
    });

    it('TC-DM-002: buildDeck 可重複呼叫（重置狀態）', () => {
      deck.buildDeck();
      deck.deal(3);
      expect(deck.getRemainingCount()).toBe(49);

      deck.buildDeck(); // 重置
      expect(deck.getRemainingCount()).toBe(52);
    });
  });

  // ────────────────────────────────────────────
  // shuffle
  // ────────────────────────────────────────────

  describe('shuffle()', () => {
    it('TC-DM-003: shuffle 後仍為 52 張牌', () => {
      deck.buildDeck();
      deck.shuffle();
      expect(deck.getRemainingCount()).toBe(52);
    });

    it('TC-DM-004: shuffle 後可發出所有花色（統計驗證）', () => {
      deck.buildDeck();
      deck.shuffle();

      const allCards = deck.deal(52);
      const suits = new Set(allCards.map((c) => c.suit));
      const values = new Set(allCards.map((c) => c.value));

      // 應包含所有 4 種花色
      expect(suits.size).toBe(4);
      expect(suits).toContain('spade');
      expect(suits).toContain('heart');
      expect(suits).toContain('diamond');
      expect(suits).toContain('club');

      // 應包含所有 13 種牌值
      expect(values.size).toBe(13);
    });

    it('TC-DM-005: 空牌組時 shuffle 拋出錯誤', () => {
      // 未呼叫 buildDeck
      expect(() => deck.shuffle()).toThrow(
        'DeckManager.shuffle: deck is empty, call buildDeck() first',
      );
    });

    it('TC-DM-006: shuffle 改變牌序（洗後頭 5 張與未洗時不同）', () => {
      // 驗證 shuffle 確實改變了牌序，而非維持建構時的固定順序
      const deck1 = new DeckManager();
      deck1.buildDeck();
      // 不洗牌，取出頭 5 張（固定順序）
      const unshuffled = deck1.deal(5);

      const deck2 = new DeckManager();
      deck2.buildDeck();
      deck2.shuffle();
      // 洗牌後取出頭 5 張
      const shuffled = deck2.deal(5);

      // 洗牌後應有 5 張且花色/牌值為合法值
      expect(shuffled).toHaveLength(5);
      expect(unshuffled).toHaveLength(5);

      // 洗牌後頭 5 張應與固定順序不同（機率 1 - 1/(52×51×50×49×48) ≈ 100%）
      const sameAsUnshuffled = shuffled.every(
        (c, i) => c.value === unshuffled[i].value && c.suit === unshuffled[i].suit,
      );
      expect(sameAsUnshuffled).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // deal
  // ────────────────────────────────────────────

  describe('deal()', () => {
    beforeEach(() => {
      deck.buildDeck();
      deck.shuffle();
    });

    it('TC-DM-007: deal(3) 返回 3 張牌', () => {
      const hand = deck.deal(3);
      expect(hand).toHaveLength(3);
    });

    it('TC-DM-008: deal(3) 返回正確結構的 CardDTO', () => {
      const hand = deck.deal(3);
      const validSuits = new Set(['spade', 'heart', 'diamond', 'club']);
      const validValues = new Set(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);

      for (const card of hand) {
        expect(validSuits).toContain(card.suit);
        expect(validValues).toContain(card.value);
        expect(typeof card.point).toBe('number');
        expect(card.point).toBeGreaterThanOrEqual(0);
        expect(card.point).toBeLessThanOrEqual(9);
      }
    });

    it('TC-DM-009: deal 後剩餘牌數正確減少', () => {
      expect(deck.getRemainingCount()).toBe(52);
      deck.deal(3);
      expect(deck.getRemainingCount()).toBe(49);
      deck.deal(3);
      expect(deck.getRemainingCount()).toBe(46);
    });

    it('TC-DM-010: deal(52) 發完全部牌', () => {
      const all = deck.deal(52);
      expect(all).toHaveLength(52);
      expect(deck.getRemainingCount()).toBe(0);
    });

    it('TC-DM-011: 牌組耗盡時 deal 拋出錯誤', () => {
      deck.deal(52);
      expect(() => deck.deal(1)).toThrow('insufficient cards');
    });

    it('TC-DM-012: CardDTO point 值正確（10/J/Q/K=0, A=1, 2-9=面值）', () => {
      deck.buildDeck(); // 重新建立，不洗牌，確認固定順序

      // 牌張 0 = ♠A（point=1）, 1 = ♠2（point=2）, ..., 9 = ♠10（point=0）
      const cards = deck.deal(10);

      const aceOfSpade = cards[0]; // index 0 = ♠A
      expect(aceOfSpade.value).toBe('A');
      expect(aceOfSpade.suit).toBe('spade');
      expect(aceOfSpade.point).toBe(1);

      const tenOfSpade = cards[9]; // index 9 = ♠10
      expect(tenOfSpade.value).toBe('10');
      expect(tenOfSpade.point).toBe(0);
    });
  });

  // ────────────────────────────────────────────
  // Tutorial Mode
  // ────────────────────────────────────────────

  describe('Tutorial Mode（loadTutorialScript / dealTutorial*）', () => {
    it('TC-DM-013: R1 莊家手牌為三公（K♠ Q♥ J♦）', () => {
      deck.loadTutorialScript(1);
      const hand = deck.dealTutorialBankerHand();

      expect(hand).toHaveLength(3);
      expect(isSamGong(hand)).toBe(true);
    });

    it('TC-DM-014: R1 閒家手牌點數為 1pt（A♠ 2♣ 8♦）', () => {
      deck.loadTutorialScript(1);
      const hand = deck.dealTutorialPlayerHand('P1');

      expect(hand).toHaveLength(3);
      expect(calcPoints(hand)).toBe(1);
    });

    it('TC-DM-015: R2 莊家手牌點數為 5pt（5♠ A♥ 9♦）', () => {
      deck.loadTutorialScript(2);
      const hand = deck.dealTutorialBankerHand();

      expect(calcPoints(hand)).toBe(5);
    });

    it('TC-DM-016: R2 閒家手牌點數為 3pt（3♦ K♣ Q♠）', () => {
      deck.loadTutorialScript(2);
      const hand = deck.dealTutorialPlayerHand('P1');

      expect(calcPoints(hand)).toBe(3);
    });

    it('TC-DM-017: R3 莊家手牌點數為 6pt（2♠ 4♥ K♦）', () => {
      deck.loadTutorialScript(3);
      const hand = deck.dealTutorialBankerHand();

      expect(calcPoints(hand)).toBe(6);
    });

    it('TC-DM-018: R3 閒家手牌點數為 6pt（6♥ J♠ Q♣）', () => {
      deck.loadTutorialScript(3);
      const hand = deck.dealTutorialPlayerHand('P1');

      expect(calcPoints(hand)).toBe(6);
    });

    it('TC-DM-019: R3 force_tie=true（教程合約強制平局）', () => {
      deck.loadTutorialScript(3);
      const round = deck.getTutorialRound();

      expect(round).not.toBeNull();
      expect(round!.force_tie).toBe(true);
      expect(round!.expected_outcome).toBe('tie');
    });

    it('TC-DM-020: 未載入劇本時 dealTutorialBankerHand 拋出錯誤', () => {
      expect(() => deck.dealTutorialBankerHand()).toThrow(
        'no tutorial script loaded',
      );
    });

    it('TC-DM-021: 未載入劇本時 dealTutorialPlayerHand 拋出錯誤', () => {
      expect(() => deck.dealTutorialPlayerHand('P1')).toThrow(
        'no tutorial script loaded',
      );
    });

    it('TC-DM-022: 無效玩家 key 拋出錯誤', () => {
      deck.loadTutorialScript(1);
      expect(() => deck.dealTutorialPlayerHand('P99')).toThrow(
        "player key 'P99' not found",
      );
    });

    it('TC-DM-023: 所有教學牌張唯一性（18 張不重複）', () => {
      const seen = new Set<string>();

      for (const round of [1, 2, 3] as const) {
        deck.loadTutorialScript(round);

        const bankerHand = deck.dealTutorialBankerHand();
        for (const c of bankerHand) {
          const key = `${c.value}_${c.suit}`;
          expect(seen.has(key)).toBe(false); // 不應重複
          seen.add(key);
        }

        const playerHand = deck.dealTutorialPlayerHand('P1');
        for (const c of playerHand) {
          const key = `${c.value}_${c.suit}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }

      expect(seen.size).toBe(18); // 3 輪 × 6 張 = 18 張唯一牌
    });
  });

  // ────────────────────────────────────────────
  // reset
  // ────────────────────────────────────────────

  describe('reset()', () => {
    it('TC-DM-024: reset 後剩餘牌數為 0', () => {
      deck.buildDeck();
      deck.reset();

      expect(deck.getRemainingCount()).toBe(0);
    });

    it('TC-DM-025: reset 後 getTutorialRound 返回 null', () => {
      deck.loadTutorialScript(1);
      deck.reset();

      expect(deck.getTutorialRound()).toBeNull();
    });

    it('TC-DM-026: reset 後可重新 buildDeck', () => {
      deck.buildDeck();
      deck.deal(10);
      deck.reset();

      deck.buildDeck();
      expect(deck.getRemainingCount()).toBe(52);
    });
  });
});
