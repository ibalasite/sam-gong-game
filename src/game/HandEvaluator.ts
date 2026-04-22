/**
 * HandEvaluator — 三公牌型判定與比牌邏輯
 *
 * 規格來源：EDD §3.6 HandEvaluator
 */

/** 撲克牌表示 */
export interface Card {
  /** 牌值：'A'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K' */
  value: string;
  /** 花色：'spade'|'heart'|'diamond'|'club' */
  suit: string;
  /** 計分點數：A=1, 2-9=面值, 10/J/Q/K=0 */
  point: number;
}

/** 手牌評估結果 */
export interface HandResult {
  /** 0-9（三公時 points=0，is_sam_gong=true） */
  points: number;
  /** 是否為三公（3 張均為 10/J/Q/K） */
  is_sam_gong: boolean;
  /** 'sam_gong'|'9'|'8'|...|'0' */
  hand_type: string;
  /** 原始手牌 */
  hand: Card[];
}

/**
 * D8 tiebreak 花色權重
 * spade=4 > heart=3 > diamond=2 > club=1
 */
const SUIT_RANK: Record<string, number> = {
  spade: 4,
  heart: 3,
  diamond: 2,
  club: 1,
};

/**
 * D8 tiebreak 牌值權重（獨立於 point 計算，不可混用）
 * A=1, 2=2, ..., 10=10, J=11, Q=12, K=13
 */
const VALUE_RANK: Record<string, number> = {
  A: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
};

/**
 * 三公牌值集合：這些牌的 point = 0
 */
const SAM_GONG_VALUES = new Set(['10', 'J', 'Q', 'K']);

/**
 * 計算單張牌的計分點數
 * A=1, 2-9=面值, 10/J/Q/K=0
 */
export function calcPoint(value: string): number {
  if (SAM_GONG_VALUES.has(value)) return 0;
  if (value === 'A') return 1;
  return parseInt(value, 10);
}

/**
 * 建立 Card 物件（自動計算 point）
 */
export function makeCard(value: string, suit: string): Card {
  return { value, suit, point: calcPoint(value) };
}

/**
 * HandEvaluator — 手牌點數計算、三公判定、D8 比牌
 */
export class HandEvaluator {
  /**
   * 評估 3 張牌的手牌結果
   * - 點數 = sum(points) mod 10（整數運算，禁止浮點）
   * - 三公：三張牌均在 {10, J, Q, K} 集合中
   *
   * @param hand 三張牌陣列
   * @returns HandResult
   */
  evaluate(hand: Card[]): HandResult {
    if (hand.length !== 3) {
      throw new Error(`HandEvaluator.evaluate: expected 3 cards, got ${hand.length}`);
    }

    // 三公判定：三張牌的 value 全部在 SAM_GONG_VALUES 中
    const isSamGong = hand.every((c) => SAM_GONG_VALUES.has(c.value));

    // 點數計算：整數加法後取 mod 10（禁止浮點）
    const rawSum = hand[0].point + hand[1].point + hand[2].point;
    const points = rawSum % 10;

    const handType = isSamGong ? 'sam_gong' : String(points);

    return {
      points,
      is_sam_gong: isSamGong,
      hand_type: handType,
      hand,
    };
  }

  /**
   * 比較兩個 HandResult，決定勝負
   * 比較順序：
   * 1. is_sam_gong（三公 > 非三公）
   * 2. points（高點數勝）
   * 3. D8 tiebreak（花色 → 牌值）
   *
   * @param a 手牌 A
   * @param b 手牌 B
   * @returns 1 = a 勝, -1 = b 勝, 0 = 平手
   */
  compare(a: HandResult, b: HandResult): 1 | -1 | 0 {
    // Step 1：三公判定
    if (a.is_sam_gong && !b.is_sam_gong) return 1;
    if (!a.is_sam_gong && b.is_sam_gong) return -1;

    // Step 2：點數比較
    if (a.points > b.points) return 1;
    if (a.points < b.points) return -1;

    // Step 3：D8 tiebreak
    return this.tiebreak(a, b);
  }

  /**
   * D8 tiebreak：同點數時的平局打破規則
   * Step1：比手牌中最大花色（SUIT_RANK: spade=4 > heart=3 > diamond=2 > club=1）
   * Step2：比手牌中最大牌值（VALUE_RANK: K=13 > ... > 2=2 > A=1）
   * 兩步皆同 → 平手（return 0）
   *
   * @param a 手牌 A 結果
   * @param b 手牌 B 結果
   * @returns 1 = a 勝, -1 = b 勝, 0 = 平手
   */
  private tiebreak(a: HandResult, b: HandResult): 1 | -1 | 0 {
    // Step 1：最大花色比較
    const maxSuitA = Math.max(...a.hand.map((c) => SUIT_RANK[c.suit] ?? 0));
    const maxSuitB = Math.max(...b.hand.map((c) => SUIT_RANK[c.suit] ?? 0));

    if (maxSuitA > maxSuitB) return 1;
    if (maxSuitA < maxSuitB) return -1;

    // Step 2：最大牌值比較（使用 VALUE_RANK，非 point）
    const maxValueA = Math.max(...a.hand.map((c) => VALUE_RANK[c.value] ?? 0));
    const maxValueB = Math.max(...b.hand.map((c) => VALUE_RANK[c.value] ?? 0));

    if (maxValueA > maxValueB) return 1;
    if (maxValueA < maxValueB) return -1;

    return 0;
  }

  /**
   * 判斷閒家相對莊家的勝負結果
   *
   * @param playerHand 閒家手牌
   * @param bankerHand 莊家手牌
   * @returns 'win' | 'lose' | 'tie'
   */
  compareHands(playerHand: Card[], bankerHand: Card[]): 'win' | 'lose' | 'tie' {
    const playerResult = this.evaluate(playerHand);
    const bankerResult = this.evaluate(bankerHand);
    const cmp = this.compare(playerResult, bankerResult);

    if (cmp === 1) return 'win';
    if (cmp === -1) return 'lose';
    return 'tie';
  }

  /**
   * 計算賠率倍數 N
   * 三公 = 3, 9點 = 2, 0-8點（非三公）= 1, 平手 = 0
   *
   * @param result 手牌評估結果
   * @returns N 倍數
   */
  getPayoutMultiplier(result: HandResult): number {
    if (result.is_sam_gong) return 3;
    if (result.points === 9) return 2;
    return 1;
  }
}
