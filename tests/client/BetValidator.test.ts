/**
 * BetValidator.test.ts
 * Client 端下注驗證器完整測試（TDD）
 *
 * 覆蓋：
 * - 各廳別 min/max bet 邊界條件
 * - 籌碼不足情境
 * - 負數/零/浮點數輸入
 * - validateByHall 便利方法
 */

import {
  BetValidator,
  HALL_BET_CONFIG,
  HallType,
} from '../../client/src/validators/BetValidator';

describe('BetValidator', () => {
  let validator: BetValidator;

  beforeEach(() => {
    validator = new BetValidator();
  });

  // ── 青銅廳（min=100, max=500）────────────────────────────────────────────

  describe('青銅廳 (bronze: min=100, max=500)', () => {
    const { minBet, maxBet } = HALL_BET_CONFIG.bronze;

    it('TC-01: amount=minBet → valid', () => {
      const result = validator.validate(minBet, minBet, maxBet, 10_000);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('TC-02: amount=maxBet → valid', () => {
      const result = validator.validate(maxBet, minBet, maxBet, 10_000);
      expect(result.valid).toBe(true);
    });

    it('TC-03: amount < minBet → BELOW_MIN', () => {
      const result = validator.validate(99, minBet, maxBet, 10_000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('BELOW_MIN');
    });

    it('TC-04: amount > maxBet → ABOVE_MAX', () => {
      const result = validator.validate(501, minBet, maxBet, 10_000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('ABOVE_MAX');
    });

    it('TC-05: amount=minBet, balance=0 → INSUFFICIENT_CHIPS', () => {
      const result = validator.validate(minBet, minBet, maxBet, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INSUFFICIENT_CHIPS');
    });

    it('TC-06: amount=minBet, balance=minBet-1 → INSUFFICIENT_CHIPS', () => {
      const result = validator.validate(minBet, minBet, maxBet, minBet - 1);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INSUFFICIENT_CHIPS');
    });
  });

  // ── 白銀廳（min=1000, max=5000）──────────────────────────────────────────

  describe('白銀廳 (silver: min=1000, max=5000)', () => {
    const { minBet, maxBet } = HALL_BET_CONFIG.silver;

    it('TC-07: amount=minBet → valid', () => {
      expect(validator.validate(minBet, minBet, maxBet, 100_000).valid).toBe(true);
    });

    it('TC-08: amount=maxBet → valid', () => {
      expect(validator.validate(maxBet, minBet, maxBet, 100_000).valid).toBe(true);
    });

    it('TC-09: amount < minBet → BELOW_MIN', () => {
      const result = validator.validate(999, minBet, maxBet, 100_000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('BELOW_MIN');
    });

    it('TC-10: amount > maxBet → ABOVE_MAX', () => {
      const result = validator.validate(5001, minBet, maxBet, 100_000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('ABOVE_MAX');
    });
  });

  // ── 黃金廳（min=10000, max=50000）────────────────────────────────────────

  describe('黃金廳 (gold: min=10000, max=50000)', () => {
    const { minBet, maxBet } = HALL_BET_CONFIG.gold;

    it('TC-11: amount=minBet, balance=minBet → valid', () => {
      expect(validator.validate(minBet, minBet, maxBet, minBet).valid).toBe(true);
    });

    it('TC-12: amount=maxBet, balance=maxBet → valid', () => {
      expect(validator.validate(maxBet, minBet, maxBet, maxBet).valid).toBe(true);
    });

    it('TC-13: amount > maxBet → ABOVE_MAX (優先於 INSUFFICIENT_CHIPS)', () => {
      // amount 超出 max，即使 balance 不足，也應先回 ABOVE_MAX
      const result = validator.validate(50_001, minBet, maxBet, 1_000);
      expect(result.error).toBe('ABOVE_MAX');
    });
  });

  // ── 鉑金廳（min=100000, max=500000）──────────────────────────────────────

  describe('鉑金廳 (platinum: min=100000, max=500000)', () => {
    const { minBet, maxBet } = HALL_BET_CONFIG.platinum;

    it('TC-14: amount=minBet, balance=minBet → valid', () => {
      expect(validator.validate(minBet, minBet, maxBet, minBet).valid).toBe(true);
    });

    it('TC-15: amount=50000 < minBet → BELOW_MIN', () => {
      const result = validator.validate(50_000, minBet, maxBet, 1_000_000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('BELOW_MIN');
    });
  });

  // ── 鑽石廳（min=1000000, max=5000000）───────────────────────────────────

  describe('鑽石廳 (diamond: min=1000000, max=5000000)', () => {
    const { minBet, maxBet } = HALL_BET_CONFIG.diamond;

    it('TC-16: amount=minBet, balance=minBet → valid', () => {
      expect(validator.validate(minBet, minBet, maxBet, minBet).valid).toBe(true);
    });

    it('TC-17: amount=maxBet+1 → ABOVE_MAX', () => {
      const result = validator.validate(maxBet + 1, minBet, maxBet, 10_000_000);
      expect(result.error).toBe('ABOVE_MAX');
    });
  });

  // ── 邊界條件 ─────────────────────────────────────────────────────────────

  describe('邊界條件', () => {
    it('TC-18: amount=0 → NOT_INTEGER（零不是正整數）', () => {
      const result = validator.validate(0, 100, 500, 10_000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('NOT_INTEGER');
    });

    it('TC-19: amount 負數 → NOT_INTEGER（負數不是正整數）', () => {
      const result = validator.validate(-100, 100, 500, 10_000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('NOT_INTEGER');
    });

    it('TC-19b: amount 浮點數 → NOT_INTEGER（浮點數不是整數）', () => {
      const result = validator.validate(100.5, 100, 500, 10_000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('NOT_INTEGER');
    });

    it('TC-19c: amount=NaN → NOT_INTEGER', () => {
      const result = validator.validate(NaN, 100, 500, 10_000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('NOT_INTEGER');
    });

    it('TC-20: amount=minBet=maxBet, balance=minBet → valid (廳別只有一個合法值)', () => {
      const result = validator.validate(100, 100, 100, 100);
      expect(result.valid).toBe(true);
    });

    it('TC-21: amount 剛好等於 balance（等於 maxBet 之內）→ valid', () => {
      const result = validator.validate(300, 100, 500, 300);
      expect(result.valid).toBe(true);
    });
  });

  // ── validateByHall 便利方法 ────────────────────────────────────────────

  describe('validateByHall()', () => {
    const halls: HallType[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

    halls.forEach((hall) => {
      const { minBet, maxBet } = HALL_BET_CONFIG[hall];

      it(`TC-hall-${hall}: minBet valid for ${hall}`, () => {
        const result = validator.validateByHall(minBet, hall, minBet);
        expect(result.valid).toBe(true);
      });

      it(`TC-hall-${hall}: below min → BELOW_MIN for ${hall}`, () => {
        const result = validator.validateByHall(minBet - 1, hall, 10_000_000);
        expect(result.error).toBe('BELOW_MIN');
      });

      it(`TC-hall-${hall}: above max → ABOVE_MAX for ${hall}`, () => {
        const result = validator.validateByHall(maxBet + 1, hall, 10_000_000);
        expect(result.error).toBe('ABOVE_MAX');
      });
    });

    it('TC-22: validateByHall balance=0 → INSUFFICIENT_CHIPS', () => {
      const result = validator.validateByHall(100, 'bronze', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INSUFFICIENT_CHIPS');
    });
  });
});
