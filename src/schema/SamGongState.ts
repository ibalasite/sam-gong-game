/**
 * SamGongState — Colyseus Room State Schema
 *
 * 規格來源：EDD §3.2 Room State Schema
 *
 * 注意：
 * - 手牌（hand）不在公開 Schema，透過私人訊息推送（防止洩漏）
 * - session_id 為 Server-only 欄位，不加 @type 裝飾，不廣播至 Client
 * - chip_balance 採用「開放籌碼」設計，對房間內所有玩家可見
 */

import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';

// ──── 卡牌 Schema ────

export class Card extends Schema {
  @type('string') suit: string = '';    // 'spade'|'heart'|'diamond'|'club'
  @type('string') value: string = '';   // '2'|...|'10'|'J'|'Q'|'K'|'A'
  @type('number') point: number = 0;   // A=1, 2-9=面值, 10/J/Q/K=0
}

// ──── 結算子物件 ────

export class SettlementEntry extends Schema {
  @type('string') player_id: string = '';
  @type('number') seat_index: number = 0;
  /** 淨籌碼變動：正=贏，負=輸，0=Fold/平手；insolvent_winner 情境：net_chips = -called_bet（非零） */
  @type('number') net_chips: number = 0;
  @type('number') bet_amount: number = 0;
  /** 總返回額；贏家 = called_bet + N×banker_bet；輸家/Fold = 0；平手 = called_bet */
  @type('number') payout_amount: number = 0;
  /** 'win'|'lose'|'fold'|'tie'|'insolvent_win' */
  @type('string') result: string = '';
  /** 'sam_gong'|'9'|'8'|...|'0'|'fold' */
  @type('string') hand_type: string = '';
  @type('boolean') is_sam_gong: boolean = false;
}

export class SettlementState extends Schema {
  @type([SettlementEntry]) winners = new ArraySchema<SettlementEntry>();
  @type([SettlementEntry]) losers = new ArraySchema<SettlementEntry>();
  @type([SettlementEntry]) ties = new ArraySchema<SettlementEntry>();
  @type([SettlementEntry]) folders = new ArraySchema<SettlementEntry>();
  /** 莊家破產後未獲支付；net_chips = -called_bet（非零） */
  @type([SettlementEntry]) insolvent_winners = new ArraySchema<SettlementEntry>();
  @type('number') rake_amount: number = 0;
  /** 輸家下注額加總（抽水底數） */
  @type('number') pot_amount: number = 0;
  @type('boolean') banker_insolvent: boolean = false;
  @type('number') banker_remaining_chips: number = 0;
  /** 全員棄牌 */
  @type('boolean') all_fold: boolean = false;
}

// ──── 玩家狀態 ────

export class PlayerState extends Schema {
  @type('string') player_id: string = '';

  /**
   * session_id 為 Server-only 欄位，不加 @type 裝飾，不廣播至 Client。
   * Client 識別自身 session 使用連線建立時 Server 推送的私人訊息：
   * { type: 'my_session_info', session_id, player_id }
   */
  session_id: string = '';

  @type('number') seat_index: number = 0;

  /**
   * chip_balance 廣播策略（Open Information 設計）：
   * 採用「開放籌碼」設計，所有玩家的 chip_balance 對房間內其他玩家可見。
   * 即時餘額（含 escrow 預扣後）
   */
  @type('number') chip_balance: number = 0;

  @type('number') bet_amount: number = 0;
  @type('boolean') is_connected: boolean = true;
  @type('boolean') is_folded: boolean = false;
  @type('boolean') has_acted: boolean = false;
  @type('boolean') is_banker: boolean = false;
  @type('string') display_name: string = '';
  @type('string') avatar_url: string = '';

  // 手牌僅透過 filterBy 或私人訊息發送，不放入公開 Schema
  // hand: Card[] — 不在此 Schema（防止洩漏）
}

// ──── 廳別設定 ────

export class TierConfig extends Schema {
  /** '青銅廳'|'白銀廳'|'黃金廳'|'鉑金廳'|'鑽石廳' */
  @type('string') tier_name: string = '';
  @type('number') entry_chips: number = 0;
  @type('number') min_bet: number = 0;
  @type('number') max_bet: number = 0;
  /**
   * 快捷下注金額（Client UI hint）
   * 注意：Server 處理實際下注時獨立驗證 banker_bet ∈ [min_bet, max_bet]，
   * 不信任 Client 傳入的快速下注金額。
   */
  @type(['number']) quick_bet_amounts = new ArraySchema<number>();
}

// ──── 配對狀態 ────

export class MatchmakingStatus extends Schema {
  @type('boolean') is_expanding: boolean = false;
  /** 擴展配對的相鄰廳別名稱 */
  @type(['string']) expanded_tiers = new ArraySchema<string>();
  @type('number') wait_seconds: number = 0;
}

// ──── 主 Room State ────

export class SamGongState extends Schema {
  // ── 玩家管理 ──
  /** key = seat_index.toString()（'0'~'5'） */
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();

  // ── 牌局控制 ──
  /** 'waiting'|'dealing'|'banker-bet'|'player-bet'|'showdown'|'settled' */
  @type('string') phase: string = 'waiting';
  @type('number') banker_seat_index: number = -1;
  /** 順時鐘輪莊序列（seat_index） */
  @type(['number']) banker_rotation_queue = new ArraySchema<number>();

  // ── 下注管理 ──
  @type('number') banker_bet_amount: number = 0;
  @type('number') min_bet: number = 0;
  @type('number') max_bet: number = 0;
  @type('number') current_pot: number = 0;

  // ── 計時器 ──
  /** Server Unix ms（Client 以此計算剩餘時間） */
  @type('number') action_deadline_timestamp: number = 0;

  // ── 牌組管理（Server-only，不同步至 Client） ──
  // deck: number[] — 僅在 Server 記憶體中，不在此 Schema

  // ── 局數 ──
  @type('number') round_number: number = 0;
  /** 當前行動玩家座位（player-bet phase） */
  @type('number') current_player_turn_seat: number = -1;

  // ── 結算 ──
  @type(SettlementState) settlement = new SettlementState();

  // ── 廳別設定 ──
  @type(TierConfig) tier_config = new TierConfig();

  // ── 房間設定 ──
  /** 教學模式（tutorial_mode=true） */
  @type('boolean') is_tutorial: boolean = false;
  /** 房間 ID（6位大寫英數字，私人房間） */
  @type('string') room_id: string = '';
  /** 'matchmaking'|'private' */
  @type('string') room_type: string = 'matchmaking';

  // ── 配對狀態 ──
  @type(MatchmakingStatus) matchmaking_status = new MatchmakingStatus();
}
