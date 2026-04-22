/**
 * DeckManager — 洗牌與發牌管理
 *
 * 規格來源：EDD §3.6 DeckManager
 *
 * 核心規格：
 * - 使用 crypto.randomInt 執行 Fisher-Yates Knuth Shuffle（禁止 Math.random()）
 * - 52 張牌以 0-51 整數表示，對應 Card DTO
 * - tutorial_mode 時使用 TutorialScriptEngine 固定牌序（PRD REQ-012 AC-5）
 * - 每局開始前呼叫 buildDeck() + shuffle()（或 loadTutorialScript()）
 *
 * 牌張編碼：
 * - 0-12:  ♠（spade）   A,2,3,...,K
 * - 13-25: ♥（heart）   A,2,3,...,K
 * - 26-38: ♦（diamond） A,2,3,...,K
 * - 39-51: ♣（club）    A,2,3,...,K
 */

import { randomInt } from 'crypto';
import { TutorialScriptEngine, TutorialCard } from './TutorialScriptEngine';

/** 牌張 DTO（供 Room 使用） */
export interface CardDTO {
  /** 牌值：'A'|'2'~'9'|'10'|'J'|'Q'|'K' */
  value: string;
  /** 花色：'spade'|'heart'|'diamond'|'club' */
  suit: string;
  /** 計分點數：A=1, 2-9=面值, 10/J/Q/K=0 */
  point: number;
}

/** 花色順序（對應牌張 0-51 分組） */
const SUITS: string[] = ['spade', 'heart', 'diamond', 'club'];

/** 牌值順序（A,2,...,10,J,Q,K）*/
const VALUES: string[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** 牌值到點數映射 */
const VALUE_TO_POINT: Record<string, number> = {
  A: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 0,
  J: 0,
  Q: 0,
  K: 0,
};

/**
 * 將牌張索引（0-51）轉換為 CardDTO
 *
 * @param index 牌張索引（0-51）
 * @returns CardDTO
 */
function indexToCard(index: number): CardDTO {
  const suitIdx = Math.floor(index / 13);
  const valueIdx = index % 13;
  const suit = SUITS[suitIdx];
  const value = VALUES[valueIdx];
  return { value, suit, point: VALUE_TO_POINT[value] };
}

/**
 * 將 TutorialCard 轉換為 CardDTO
 *
 * @param card TutorialCard
 * @returns CardDTO
 */
function tutorialCardToDTO(card: TutorialCard): CardDTO {
  return {
    value: card.value,
    suit: card.suit,
    point: VALUE_TO_POINT[card.value] ?? 0,
  };
}

/**
 * DeckManager — 管理牌組的建立、洗牌與發牌
 *
 * 使用方式：
 * ```typescript
 * const deck = new DeckManager();
 *
 * // 一般模式（隨機洗牌）
 * deck.buildDeck();
 * deck.shuffle();
 * const hand = deck.deal(3); // 發 3 張給一位玩家
 *
 * // 教學模式（固定牌序）
 * deck.loadTutorialScript(1); // 載入 R1 劇本
 * const bankerHand = deck.dealTutorialBankerHand();
 * const playerHand = deck.dealTutorialPlayerHand('P1');
 * ```
 */
export class DeckManager {
  /** 牌組（0-51 整數，Fisher-Yates 洗牌後的順序） */
  private deck: number[] = [];

  /** 當前發牌指針 */
  private dealPointer: number = 0;

  /** 教學模式劇本（tutorial_mode 時設定） */
  private tutorialRound: ReturnType<TutorialScriptEngine['loadScript']> | null = null;

  private tutorialEngine: TutorialScriptEngine = new TutorialScriptEngine();

  /**
   * 建立完整 52 張牌組
   * 順序：♠A~K, ♥A~K, ♦A~K, ♣A~K
   */
  buildDeck(): void {
    this.deck = Array.from({ length: 52 }, (_, i) => i);
    this.dealPointer = 0;
    this.tutorialRound = null;
  }

  /**
   * Fisher-Yates Knuth Shuffle
   * 使用 crypto.randomInt（禁止 Math.random()）
   *
   * @throws Error 若在 buildDeck() 前呼叫
   */
  shuffle(): void {
    if (this.deck.length === 0) {
      throw new Error('DeckManager.shuffle: deck is empty, call buildDeck() first');
    }

    for (let i = this.deck.length - 1; i > 0; i--) {
      // crypto.randomInt(min, max) 生成 [min, max) 範圍的安全隨機整數
      const j = randomInt(0, i + 1);
      const tmp = this.deck[i];
      this.deck[i] = this.deck[j];
      this.deck[j] = tmp;
    }
  }

  /**
   * 從牌組發 count 張牌
   *
   * @param count 發牌張數（通常為 3）
   * @returns CardDTO[]
   * @throws Error 若剩餘牌數不足
   */
  deal(count: number): CardDTO[] {
    if (this.dealPointer + count > this.deck.length) {
      throw new Error(
        `DeckManager.deal: insufficient cards — need ${count}, remaining ${this.deck.length - this.dealPointer}`,
      );
    }

    const cards: CardDTO[] = [];
    for (let i = 0; i < count; i++) {
      cards.push(indexToCard(this.deck[this.dealPointer++]));
    }
    return cards;
  }

  /**
   * 載入教學劇本（tutorial_mode=true 時使用）
   * 設定固定牌序，覆蓋隨機洗牌
   *
   * @param round 輪次編號（1|2|3）
   */
  loadTutorialScript(round: 1 | 2 | 3): void {
    this.tutorialRound = this.tutorialEngine.loadScript(round);
    this.deck = [];
    this.dealPointer = 0;
  }

  /**
   * 發教學模式莊家固定手牌
   *
   * @returns CardDTO[]（3 張固定牌）
   * @throws Error 若未載入教學劇本
   */
  dealTutorialBankerHand(): CardDTO[] {
    if (!this.tutorialRound) {
      throw new Error('DeckManager.dealTutorialBankerHand: no tutorial script loaded, call loadTutorialScript() first');
    }
    return this.tutorialRound.banker_hand.map(tutorialCardToDTO);
  }

  /**
   * 發教學模式閒家固定手牌
   *
   * @param playerKey 閒家 key（如 'P1'）
   * @returns CardDTO[]（3 張固定牌）
   * @throws Error 若未載入教學劇本或閒家 key 不存在
   */
  dealTutorialPlayerHand(playerKey: string): CardDTO[] {
    if (!this.tutorialRound) {
      throw new Error('DeckManager.dealTutorialPlayerHand: no tutorial script loaded, call loadTutorialScript() first');
    }

    const hand = this.tutorialRound.player_hands[playerKey];
    if (!hand) {
      throw new Error(`DeckManager.dealTutorialPlayerHand: player key '${playerKey}' not found in tutorial script`);
    }

    return hand.map(tutorialCardToDTO);
  }

  /**
   * 取得當前教學劇本資料（用於 SamGongRoom 判斷是否 force_tie）
   *
   * @returns TutorialRound | null
   */
  getTutorialRound(): ReturnType<TutorialScriptEngine['loadScript']> | null {
    return this.tutorialRound;
  }

  /**
   * 取得剩餘牌數（用於測試驗證）
   *
   * @returns 剩餘牌數
   */
  getRemainingCount(): number {
    return this.deck.length - this.dealPointer;
  }

  /**
   * 重置牌組（用於測試或下一局重新開始）
   */
  reset(): void {
    this.deck = [];
    this.dealPointer = 0;
    this.tutorialRound = null;
  }
}
