/**
 * TutorialScriptEngine — 教學固定劇本引擎
 *
 * 規格來源：EDD §3.6 TutorialScriptEngine, REQ-012
 *
 * 核心規格：
 * - tutorial_mode=true 時使用固定牌序（非隨機洗牌）
 * - 3 輪固定劇本：R1（三公展示）、R2（普通比點）、R3（平局概念）
 * - 18 張牌均唯一（同一副牌中不出現重複牌張）
 * - DeckManager.loadTutorialScript(round) 呼叫此引擎取得固定牌序
 *
 * 劇本設計（PRD REQ-012 AC-5）：
 * R1: 莊家三公 vs 閒家 1pt → 展示三公最高牌型（banker_win）
 * R2: 莊家 5pt vs 閒家 3pt → 展示普通比點（banker_win）
 * R3: 莊家 6pt vs 閒家 6pt + force_tie=true → 展示平局概念（tie）
 *
 * 注意：Q7（Open Question）確定後，Game Designer 需最終確認牌面序列。
 */

/** 單張牌表示（教學劇本用） */
export interface TutorialCard {
  /** 牌值：'A'|'2'~'9'|'10'|'J'|'Q'|'K' */
  value: string;
  /** 花色：'spade'|'heart'|'diamond'|'club' */
  suit: string;
}

/** 教學輪次資料 */
export interface TutorialRound {
  /** 輪次編號 1|2|3 */
  round: 1 | 2 | 3;
  /** 莊家手牌（固定 3 張） */
  banker_hand: [TutorialCard, TutorialCard, TutorialCard];
  /**
   * 閒家手牌（固定 3 張，key=seat_index string）
   * 教學模式固定 1 位閒家（seat P1）
   */
  player_hands: Record<string, [TutorialCard, TutorialCard, TutorialCard]>;
  /**
   * 是否強制平局（R3 用）
   * true 時依教程合約強制 tie，不執行 D8 tiebreak
   */
  force_tie: boolean;
  /** 預期結果 */
  expected_outcome: 'banker_win' | 'player_win' | 'tie';
  /** 提示文字 i18n key */
  hint_i18n_key: string;
}

/**
 * 精確牌面序列（EDD §3.6 暫定版本，待 Q7 Game Designer 最終確認）
 *
 * 牌張唯一性驗證：
 * R1: K♠ Q♥ J♦ | A♠ 2♣ 8♦   → 6 張
 * R2: 5♠ A♥ 9♦ | 3♦ K♣ Q♠   → 6 張（注意：3♦ 與 R1 8♦ 花色不同，唯一）
 * R3: 2♠ 4♥ K♦ | 6♥ J♠ Q♣   → 6 張
 * 合計 18 張，全部唯一（無重複牌張）
 */
const TUTORIAL_SCRIPTS: Record<1 | 2 | 3, TutorialRound> = {
  1: {
    round: 1,
    banker_hand: [
      { value: 'K', suit: 'spade' },   // K♠ = 0pt
      { value: 'Q', suit: 'heart' },   // Q♥ = 0pt
      { value: 'J', suit: 'diamond' }, // J♦ = 0pt
      // 三公（is_sam_gong=true, points=0）
    ],
    player_hands: {
      P1: [
        { value: 'A', suit: 'spade' },   // A♠ = 1pt
        { value: '2', suit: 'club' },    // 2♣ = 2pt
        { value: '8', suit: 'diamond' }, // 8♦ = 8pt → sum=11, mod10=1pt
        // 1pt → banker 三公勝
      ],
    },
    force_tie: false,
    expected_outcome: 'banker_win',
    hint_i18n_key: 'tutorial.hint.sam_gong',
  },

  2: {
    round: 2,
    banker_hand: [
      { value: '5', suit: 'spade' },   // 5♠ = 5pt
      { value: 'A', suit: 'heart' },   // A♥ = 1pt
      { value: '9', suit: 'diamond' }, // 9♦ = 9pt → sum=15, mod10=5pt
    ],
    player_hands: {
      P1: [
        { value: '3', suit: 'diamond' }, // 3♦ = 3pt
        { value: 'K', suit: 'club' },    // K♣ = 0pt
        { value: 'Q', suit: 'spade' },   // Q♠ = 0pt → sum=3, mod10=3pt
        // 3pt < 5pt → banker 勝
      ],
    },
    force_tie: false,
    expected_outcome: 'banker_win',
    hint_i18n_key: 'tutorial.hint.compare_points',
  },

  3: {
    round: 3,
    banker_hand: [
      { value: '2', suit: 'spade' },  // 2♠ = 2pt
      { value: '4', suit: 'heart' },  // 4♥ = 4pt
      { value: 'K', suit: 'diamond' }, // K♦ = 0pt → sum=6, mod10=6pt
    ],
    player_hands: {
      P1: [
        { value: '6', suit: 'heart' }, // 6♥ = 6pt
        { value: 'J', suit: 'spade' }, // J♠ = 0pt
        { value: 'Q', suit: 'club' },  // Q♣ = 0pt → sum=6, mod10=6pt
        // 6pt = 6pt, force_tie=true → 展示平局概念
      ],
    },
    force_tie: true,
    expected_outcome: 'tie',
    hint_i18n_key: 'tutorial.hint.tie',
  },
};

/**
 * TutorialScriptEngine — 教學固定劇本引擎
 *
 * 用法：
 * ```typescript
 * const engine = new TutorialScriptEngine();
 * const script = engine.loadScript(1);
 * // script.banker_hand → 固定莊家牌
 * // script.player_hands['P1'] → 固定閒家牌
 * // script.expected_outcome → 'banker_win'
 * ```
 */
export class TutorialScriptEngine {
  /**
   * 載入指定輪次的教學劇本
   *
   * @param round 輪次編號（1|2|3）
   * @returns TutorialRound 固定劇本資料
   * @throws Error 若 round 不在 1~3 範圍內
   */
  loadScript(round: 1 | 2 | 3): TutorialRound {
    const script = TUTORIAL_SCRIPTS[round];
    if (!script) {
      throw new Error(`TutorialScriptEngine.loadScript: invalid round ${round}, expected 1|2|3`);
    }
    return script;
  }

  /**
   * 驗證牌面序列唯一性
   * 確保 3 輪 18 張牌中無重複牌張
   *
   * @returns true 若所有牌張唯一，否則 false
   */
  validateUniqueness(): boolean {
    const seen = new Set<string>();

    for (const round of [1, 2, 3] as const) {
      const script = TUTORIAL_SCRIPTS[round];

      // 莊家牌
      for (const card of script.banker_hand) {
        const key = `${card.value}_${card.suit}`;
        if (seen.has(key)) return false;
        seen.add(key);
      }

      // 閒家牌
      for (const hand of Object.values(script.player_hands)) {
        for (const card of hand) {
          const key = `${card.value}_${card.suit}`;
          if (seen.has(key)) return false;
          seen.add(key);
        }
      }
    }

    return true;
  }

  /**
   * 取得所有輪次劇本（用於測試驗證）
   *
   * @returns Record<1|2|3, TutorialRound>
   */
  getAllScripts(): Record<1 | 2 | 3, TutorialRound> {
    return { ...TUTORIAL_SCRIPTS };
  }
}
