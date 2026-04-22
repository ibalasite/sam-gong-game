/**
 * SettlementEngine — 三公結算引擎
 *
 * 規格來源：EDD §3.6 SettlementEngine, PRD §5.3
 *
 * 核心規格：
 * - Winner: net_chips = N × banker_bet_amount（N = payout multiplier）
 * - Loser:  net_chips = -called_bet
 * - InsolventWinner: net_chips = -called_bet（莊家破產後未獲支付）
 * - allFold: pot=0, rake=0, 莊家 escrow 退回，所有 net_chips=0
 * - Rake: floor(pot × 5%) min 1 when pot>0; rake=0 when pot=0
 * - pot = sum(losers' called_bets)（贏家/平手的 called_bet 不入底池）
 * - 籌碼守恆: sum(all net_chips) + rake === 0
 */

import { HandEvaluator, Card, HandResult } from './HandEvaluator';

/** 玩家結算輸入 DTO */
export interface PlayerSettlementDTO {
  player_id: string;
  seat_index: number;
  /** 跟注額（Fold 時為 0） */
  called_bet: number;
  /** 是否棄牌 */
  is_folded: boolean;
  /** 手牌（Fold 時可為空） */
  hand: Card[];
}

/** 單筆玩家結算結果 */
export interface SettlementResultDTO {
  player_id: string;
  seat_index: number;
  /** 淨籌碼變動（正=贏，負=輸，0=Fold/平手） */
  net_chips: number;
  /** 實際下注額 */
  bet_amount: number;
  /** 總返回額（贏家 = called_bet + N×banker_bet；輸家/Fold = 0；平手 = called_bet） */
  payout_amount: number;
  /** 'win'|'lose'|'fold'|'tie'|'insolvent_win' */
  result: string;
  /** 'sam_gong'|'9'|'8'|...|'0'|'fold' */
  hand_type: string;
  /** 是否三公 */
  is_sam_gong: boolean;
  /** 賠率倍數 */
  payout_multiplier: number;
}

/** 結算引擎輸入 */
export interface SettlementInput {
  /** 所有玩家（含莊家） */
  players: PlayerSettlementDTO[];
  /** 莊家座位索引 */
  banker_seat_index: number;
  /** 莊家的籌碼餘額（escrow 已扣除後） */
  banker_chip_balance: number;
  /** 莊家下注額（已 escrow） */
  banker_bet_amount: number;
}

/** 結算引擎輸出 */
export interface SettlementOutput {
  winners: SettlementResultDTO[];
  losers: SettlementResultDTO[];
  ties: SettlementResultDTO[];
  folders: SettlementResultDTO[];
  /** 莊家破產後未獲支付的贏家；net_chips = -called_bet */
  insolvent_winners: SettlementResultDTO[];
  /** 莊家結算結果 */
  banker_settlement: SettlementResultDTO;
  /** floor(pot × 0.05)，pot>0 時最少 1 */
  rake_amount: number;
  /** 輸家閒家下注額加總 */
  pot_amount: number;
  banker_insolvent: boolean;
  banker_remaining_chips: number;
  all_fold: boolean;
}

/**
 * SettlementEngine — 執行三公結算
 */
export class SettlementEngine {
  private readonly evaluator: HandEvaluator;

  constructor() {
    this.evaluator = new HandEvaluator();
  }

  /**
   * 計算 rake
   * rake = pot > 0 ? Math.max(Math.floor(pot × 0.05), 1) : 0
   * 空底池守衛：pot=0 時 rake=0，不適用最少 1 籌碼
   *
   * @param pot 底池（輸家閒家下注額加總）
   * @returns rake_amount
   */
  calcRake(pot: number): number {
    if (pot <= 0) return 0;
    return Math.max(Math.floor(pot * 0.05), 1);
  }

  /**
   * 執行完整結算
   *
   * @param input 結算輸入
   * @returns 結算輸出
   * @throws Error 若籌碼守恆驗證失敗
   */
  settle(input: SettlementInput): SettlementOutput {
    const {
      players,
      banker_seat_index,
      banker_chip_balance,
      banker_bet_amount,
    } = input;

    // 分離莊家與閒家
    const bankerDTO = players.find((p) => p.seat_index === banker_seat_index);
    if (!bankerDTO) {
      throw new Error(`SettlementEngine: banker not found at seat ${banker_seat_index}`);
    }

    const nonBankerPlayers = players.filter((p) => p.seat_index !== banker_seat_index);

    // ── allFold 全員棄牌判定 ──
    const allFolded = nonBankerPlayers.every((p) => p.is_folded);

    if (allFolded) {
      return this.settleAllFold(bankerDTO, nonBankerPlayers, banker_bet_amount, banker_chip_balance);
    }

    // ── 評估每位閒家手牌（相對莊家） ──
    const bankerResult = this.evaluator.evaluate(bankerDTO.hand);

    interface PlayerComparison {
      dto: PlayerSettlementDTO;
      result: 'win' | 'lose' | 'tie' | 'fold';
      handResult: HandResult | null;
      multiplier: number;
    }

    const comparisons: PlayerComparison[] = nonBankerPlayers.map((p) => {
      if (p.is_folded) {
        return { dto: p, result: 'fold' as const, handResult: null, multiplier: 0 };
      }

      const playerResult = this.evaluator.evaluate(p.hand);
      const outcome = this.evaluator.compareHands(p.hand, bankerDTO.hand);
      const multiplier = outcome === 'win'
        ? this.evaluator.getPayoutMultiplier(playerResult)
        : 0;

      return { dto: p, result: outcome, handResult: playerResult, multiplier };
    });

    // ── 計算底池（只有輸家的 called_bet） ──
    const losers = comparisons.filter((c) => c.result === 'lose');
    const potAmount = losers.reduce((sum, c) => sum + c.dto.called_bet, 0);
    const rakeAmount = this.calcRake(potAmount);

    // ── 莊家可支付籌碼（escrow 後餘額） ──
    let bankerRemainingChips = banker_chip_balance;
    let bankerInsolvent = false;

    // ── 處理贏家（順時針座位順序，先到先得） ──
    const winners = comparisons.filter((c) => c.result === 'win');
    const tiesList = comparisons.filter((c) => c.result === 'tie');
    const foldersList = comparisons.filter((c) => c.result === 'fold');

    // 按 seat_index 排序（順時針，數字升序視為順時針）
    winners.sort((a, b) => a.dto.seat_index - b.dto.seat_index);

    const winnerResults: SettlementResultDTO[] = [];
    const insolventWinnerResults: SettlementResultDTO[] = [];

    for (const w of winners) {
      const payout = w.multiplier * banker_bet_amount; // N × banker_bet

      if (bankerRemainingChips >= payout && !bankerInsolvent) {
        // 莊家有足夠籌碼支付
        bankerRemainingChips -= payout;

        const handResult = w.handResult!;
        winnerResults.push({
          player_id: w.dto.player_id,
          seat_index: w.dto.seat_index,
          net_chips: payout,
          bet_amount: w.dto.called_bet,
          payout_amount: w.dto.called_bet + payout,
          result: 'win',
          hand_type: handResult.hand_type,
          is_sam_gong: handResult.is_sam_gong,
          payout_multiplier: w.multiplier,
        });
      } else {
        // 莊家破產，此贏家無法獲支付
        bankerInsolvent = true;

        const handResult = w.handResult!;
        insolventWinnerResults.push({
          player_id: w.dto.player_id,
          seat_index: w.dto.seat_index,
          net_chips: -w.dto.called_bet, // 虧損 called_bet，非零
          bet_amount: w.dto.called_bet,
          payout_amount: 0,
          result: 'insolvent_win',
          hand_type: handResult.hand_type,
          is_sam_gong: handResult.is_sam_gong,
          payout_multiplier: w.multiplier,
        });
      }
    }

    // ── 輸家結算 ──
    const loserResults: SettlementResultDTO[] = losers.map((l) => {
      const handResult = l.handResult!;
      return {
        player_id: l.dto.player_id,
        seat_index: l.dto.seat_index,
        net_chips: -l.dto.called_bet,
        bet_amount: l.dto.called_bet,
        payout_amount: 0,
        result: 'lose',
        hand_type: handResult.hand_type,
        is_sam_gong: handResult.is_sam_gong,
        payout_multiplier: 0,
      };
    });

    // ── 平手結算（退注，net_chips=0） ──
    const tieResults: SettlementResultDTO[] = tiesList.map((t) => {
      const handResult = t.handResult!;
      return {
        player_id: t.dto.player_id,
        seat_index: t.dto.seat_index,
        net_chips: 0,
        bet_amount: t.dto.called_bet,
        payout_amount: t.dto.called_bet, // 退回原注
        result: 'tie',
        hand_type: handResult.hand_type,
        is_sam_gong: handResult.is_sam_gong,
        payout_multiplier: 0,
      };
    });

    // ── 棄牌結算 ──
    const folderResults: SettlementResultDTO[] = foldersList.map((f) => ({
      player_id: f.dto.player_id,
      seat_index: f.dto.seat_index,
      net_chips: 0,
      bet_amount: 0,
      payout_amount: 0,
      result: 'fold',
      hand_type: 'fold',
      is_sam_gong: false,
      payout_multiplier: 0,
    }));

    // ── 莊家結算 ──
    // 莊家收入 = 底池 - rake - 支付給贏家 + 破產時未能退回給 insolvent winners 的 called_bet
    //
    // 籌碼守恆分析（破產情境）：
    // - insolvent winner 的 called_bet 已扣除 escrow，無法退回 → 歸莊家（補償部分損失）
    // - banker_net = losers_pot - rake - paidWinnerPayouts + insolventWinnerBets
    const totalWinnerPayouts = winnerResults.reduce(
      (sum, w) => sum + w.net_chips,
      0,
    );
    // insolvent winners 的 called_bet 歸莊家（他們的資金無處可去，補償莊家損失）
    const totalInsolventBets = insolventWinnerResults.reduce(
      (sum, iw) => sum + iw.bet_amount,
      0,
    );
    const bankerNetChips =
      potAmount - rakeAmount - totalWinnerPayouts + totalInsolventBets;

    const bankerSettlement: SettlementResultDTO = {
      player_id: bankerDTO.player_id,
      seat_index: bankerDTO.seat_index,
      net_chips: bankerNetChips,
      bet_amount: banker_bet_amount,
      payout_amount: bankerNetChips >= 0 ? banker_bet_amount + bankerNetChips : 0,
      result: bankerNetChips >= 0 ? 'win' : 'lose',
      hand_type: bankerResult.hand_type,
      is_sam_gong: bankerResult.is_sam_gong,
      payout_multiplier: 0,
    };

    // ── 籌碼守恆驗證 ──
    const allNetChips = [
      ...winnerResults.map((r) => r.net_chips),
      ...insolventWinnerResults.map((r) => r.net_chips),
      ...loserResults.map((r) => r.net_chips),
      ...tieResults.map((r) => r.net_chips),
      ...folderResults.map((r) => r.net_chips),
      bankerSettlement.net_chips,
    ];
    const chipSum = allNetChips.reduce((a, b) => a + b, 0);

    if (chipSum + rakeAmount !== 0) {
      const msg = `SettlementEngine: chip conservation VIOLATED — sum(net_chips)=${chipSum}, rake=${rakeAmount}, total=${chipSum + rakeAmount}`;
      console.error(`[CRITICAL] ${msg}`);
      throw new Error(msg);
    }

    return {
      winners: winnerResults,
      losers: loserResults,
      ties: tieResults,
      folders: folderResults,
      insolvent_winners: insolventWinnerResults,
      banker_settlement: bankerSettlement,
      rake_amount: rakeAmount,
      pot_amount: potAmount,
      banker_insolvent: bankerInsolvent,
      banker_remaining_chips: bankerRemainingChips,
      all_fold: false,
    };
  }

  /**
   * 處理全員棄牌（all_fold）情境
   * - pot=0, rake=0
   * - 莊家 escrow 退回（net_chips=0）
   * - 所有閒家 net_chips=0
   *
   * @param banker_chip_balance 莊家 escrow 扣除後的籌碼餘額（用於計算 banker_remaining_chips）
   */
  private settleAllFold(
    bankerDTO: PlayerSettlementDTO,
    nonBankerPlayers: PlayerSettlementDTO[],
    banker_bet_amount: number,
    banker_chip_balance: number,
  ): SettlementOutput {
    const folderResults: SettlementResultDTO[] = nonBankerPlayers.map((p) => ({
      player_id: p.player_id,
      seat_index: p.seat_index,
      net_chips: 0,
      bet_amount: 0,
      payout_amount: 0,
      result: 'fold',
      hand_type: 'fold',
      is_sam_gong: false,
      payout_multiplier: 0,
    }));

    // 莊家 escrow 退回，net_chips=0
    const bankerSettlement: SettlementResultDTO = {
      player_id: bankerDTO.player_id,
      seat_index: bankerDTO.seat_index,
      net_chips: 0,
      bet_amount: banker_bet_amount,
      payout_amount: banker_bet_amount, // escrow 全額退回
      result: 'fold', // all_fold 情境莊家無輸贏
      hand_type: 'fold',
      is_sam_gong: false,
      payout_multiplier: 0,
    };

    // 守恆驗證：all_fold 時所有 net_chips=0，rake=0，sum=0
    const chipSum = folderResults.reduce((s, r) => s + r.net_chips, 0) + bankerSettlement.net_chips;
    if (chipSum + 0 !== 0) {
      throw new Error(`SettlementEngine: allFold chip conservation VIOLATED — sum=${chipSum}`);
    }

    return {
      winners: [],
      losers: [],
      ties: [],
      folders: folderResults,
      insolvent_winners: [],
      banker_settlement: bankerSettlement,
      rake_amount: 0,
      pot_amount: 0,
      banker_insolvent: false,
      // escrow 已扣除後餘額 + 退回的 escrow = 莊家最終籌碼總額
      banker_remaining_chips: banker_chip_balance + banker_bet_amount,
      all_fold: true,
    };
  }
}
