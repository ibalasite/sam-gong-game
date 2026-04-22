/**
 * BetValidator.ts
 * 下注輸入驗證器。
 *
 * 純業務邏輯，無任何外部依賴，100% 可單元測試。
 */

// ── 廳別設定 ─────────────────────────────────────────────────────────────────

export type HallType = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface HallBetConfig {
  minBet: number;
  maxBet: number;
}

/**
 * 廳別最低/最高注額設定（依 PDD 規格）
 *
 * | 廳別   | 最低注      | 最高注        |
 * |--------|-------------|---------------|
 * | 青銅廳 | 100         | 500           |
 * | 白銀廳 | 1,000       | 5,000         |
 * | 黃金廳 | 10,000      | 50,000        |
 * | 鉑金廳 | 100,000     | 500,000       |
 * | 鑽石廳 | 1,000,000   | 5,000,000     |
 */
export const HALL_BET_CONFIG: Record<HallType, HallBetConfig> = {
  bronze:   { minBet: 100,       maxBet: 500       },
  silver:   { minBet: 1_000,     maxBet: 5_000     },
  gold:     { minBet: 10_000,    maxBet: 50_000    },
  platinum: { minBet: 100_000,   maxBet: 500_000   },
  diamond:  { minBet: 1_000_000, maxBet: 5_000_000 },
};

// ── 驗證結果型別 ──────────────────────────────────────────────────────────────

export type BetValidationError =
  | 'BELOW_MIN'
  | 'ABOVE_MAX'
  | 'INSUFFICIENT_CHIPS'
  | 'NOT_INTEGER';

export interface BetValidationResult {
  valid: boolean;
  error?: BetValidationError;
}

// ── BetValidator ──────────────────────────────────────────────────────────────

/**
 * BetValidator
 *
 * 職責：在 Client 端對用戶輸入的下注金額進行合法性驗證，
 * 防止非法請求送達 Server。
 *
 * 驗證順序（優先序）：
 * 0. amount 非正整數         → NOT_INTEGER
 * 1. amount < minBet        → BELOW_MIN
 * 2. amount > maxBet        → ABOVE_MAX
 * 3. amount > currentBalance → INSUFFICIENT_CHIPS
 *
 * 注意：amount 必須為正整數，非整數/負數/零 → NOT_INTEGER。
 */
export class BetValidator {
  /**
   * 驗證下注金額是否合法。
   *
   * @param amount         - 玩家欲下注金額
   * @param minBet         - 廳別最低注
   * @param maxBet         - 廳別最高注
   * @param currentBalance - 玩家當前籌碼餘額
   * @returns BetValidationResult — { valid: true } 或 { valid: false, error: ... }
   */
  public validate(
    amount: number,
    minBet: number,
    maxBet: number,
    currentBalance: number,
  ): BetValidationResult {
    // 0. 必須為正整數（非整數或非數字視為非法）
    if (!Number.isInteger(amount) || amount <= 0) {
      return { valid: false, error: 'NOT_INTEGER' };
    }

    // 1. 低於最低注（含零/負數）
    if (amount < minBet) {
      return { valid: false, error: 'BELOW_MIN' };
    }

    // 2. 高於最高注
    if (amount > maxBet) {
      return { valid: false, error: 'ABOVE_MAX' };
    }

    // 3. 籌碼不足
    if (amount > currentBalance) {
      return { valid: false, error: 'INSUFFICIENT_CHIPS' };
    }

    return { valid: true };
  }

  /**
   * 便利方法：依廳別名稱驗證。
   *
   * @param amount         - 玩家欲下注金額
   * @param hall           - 廳別名稱
   * @param currentBalance - 玩家當前籌碼餘額
   */
  public validateByHall(
    amount: number,
    hall: HallType,
    currentBalance: number,
  ): BetValidationResult {
    const config = HALL_BET_CONFIG[hall];
    return this.validate(amount, config.minBet, config.maxBet, currentBalance);
  }
}
