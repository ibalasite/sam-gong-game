/**
 * SamGongRoom — Colyseus Room 骨架
 *
 * 規格來源：EDD §3.1 Room Design
 *
 * 注意：
 * - 所有遊戲邏輯在 Server 端執行（Server-Authoritative）
 * - 手牌透過私人訊息推送，不放入公開 Schema
 * - Colyseus 0.15.x API：使用 this.onMessage<T>('type', handler) 於 onCreate 內註冊
 */

import { Room, Client } from '@colyseus/core';
import {
  SamGongState,
  PlayerState,
  SettlementEntry,
  SettlementState,
  TierConfig,
} from '../schema/SamGongState';
import { HandEvaluator, Card, makeCard } from '../game/HandEvaluator';
import { SettlementEngine } from '../game/SettlementEngine';
import { BankerRotation } from '../game/BankerRotation';

// ──── Message Type Definitions ────

interface RoomOptions {
  tier?: string;
  tutorial_mode?: boolean;
  room_type?: 'matchmaking' | 'private';
  room_id?: string;
}

interface JoinOptions {
  token: string;
}

interface AuthToken {
  player_id: string;
  display_name: string;
  chip_balance: number;
  avatar_url?: string;
  is_minor?: boolean;
}

interface BankerBetMessage {
  amount: number;
}

interface CallFoldMessage {
  // empty payload
}

interface SeeCardsMessage {
  // empty payload
}

interface ChatMessage {
  text: string;
}

interface ReportMessage {
  target_id: string;
  message_id: string;
  reason: string;
}

interface AntiAddictionConfirmMessage {
  type: 'adult';
}

/** 廳別設定對照表 */
export const TIER_CONFIGS: Record<string, { entry_chips: number; min_bet: number; max_bet: number; quick_bets: number[] }> = {
  '青銅廳': { entry_chips: 1000,     min_bet: 100,    max_bet: 500,    quick_bets: [100, 200, 300, 500] },
  '白銀廳': { entry_chips: 10000,    min_bet: 1000,   max_bet: 5000,   quick_bets: [1000, 2000, 3000, 5000] },
  '黃金廳': { entry_chips: 100000,   min_bet: 10000,  max_bet: 50000,  quick_bets: [10000, 20000, 30000, 50000] },
  '鉑金廳': { entry_chips: 1000000,  min_bet: 100000, max_bet: 500000, quick_bets: [100000, 200000, 300000, 500000] },
  '鑽石廳': { entry_chips: 10000000, min_bet: 1000000, max_bet: 5000000, quick_bets: [1000000, 2000000, 3000000, 5000000] },
};

/** 狀態機所有合法 phase 值（EDD §3.5） */
export const VALID_PHASES = ['waiting', 'dealing', 'banker-bet', 'player-bet', 'showdown', 'settled'] as const;
export type Phase = typeof VALID_PHASES[number];

/**
 * SamGongRoom — 三公遊戲 Colyseus Room
 *
 * 繼承自 Room<SamGongState>，管理：
 * - 玩家加入/離開/重連
 * - 遊戲狀態機（waiting → dealing → banker-bet → player-bet → showdown → settled）
 * - 訊息處理（banker_bet, call, fold, see_cards, send_chat, report_player）
 * - 結算與輪莊
 */
export class SamGongRoom extends Room<SamGongState> {
  maxClients = 6;

  private handEvaluator: HandEvaluator = new HandEvaluator();
  private settlementEngine: SettlementEngine = new SettlementEngine();
  private bankerRotation: BankerRotation = new BankerRotation();

  /** 各玩家手牌（Server-only，不同步至 Client） */
  private playerHands: Map<string, Card[]> = new Map();

  /** Phase 計時器 */
  private phaseTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** 斷線重連計時器 */
  private disconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** 等待中房間自動解散計時器 */
  private waitingTimer?: ReturnType<typeof setTimeout>;

  // ──────────────────────────────────────────────
  // onCreate
  // ──────────────────────────────────────────────

  /**
   * Room 建立時執行
   * - 初始化 SamGongState
   * - 設定廳別設定
   * - 啟動 60s 等待計時器
   * - 註冊訊息 handlers
   */
  async onCreate(options: RoomOptions): Promise<void> {
    this.setState(new SamGongState());

    // 設定廳別
    const tierName = options.tier ?? '青銅廳';
    const tierCfg = TIER_CONFIGS[tierName] ?? TIER_CONFIGS['青銅廳'];

    this.state.tier_config.tier_name = tierName;
    this.state.tier_config.entry_chips = tierCfg.entry_chips;
    this.state.tier_config.min_bet = tierCfg.min_bet;
    this.state.tier_config.max_bet = tierCfg.max_bet;
    tierCfg.quick_bets.forEach((b) => this.state.tier_config.quick_bet_amounts.push(b));

    this.state.min_bet = tierCfg.min_bet;
    this.state.max_bet = tierCfg.max_bet;
    this.state.phase = 'waiting';
    this.state.is_tutorial = options.tutorial_mode ?? false;
    this.state.room_type = options.room_type ?? 'matchmaking';
    this.state.room_id = options.room_id ?? '';

    // 60s 無人加入自動解散
    this.waitingTimer = setTimeout(() => {
      if (this.state.players.size === 0) {
        this.disconnect();
      }
    }, 60_000);

    // ── 訊息 Handlers（Colyseus 0.15.x API） ──

    this.onMessage<BankerBetMessage>('banker_bet', (client, message) => {
      this.handleBankerBet(client, message);
    });

    this.onMessage<CallFoldMessage>('call', (client, _message) => {
      this.handleCall(client);
    });

    this.onMessage<CallFoldMessage>('fold', (client, _message) => {
      this.handleFold(client);
    });

    this.onMessage<SeeCardsMessage>('see_cards', (client, _message) => {
      this.handleSeeCards(client);
    });

    this.onMessage<ChatMessage>('send_chat', (client, message) => {
      this.handleChat(client, message);
    });

    this.onMessage<ReportMessage>('report_player', (client, message) => {
      this.handleReport(client, message);
    });

    this.onMessage<AntiAddictionConfirmMessage>('confirm_anti_addiction', (client, message) => {
      // 嚴格驗證 payload：只接受 { type: 'adult' }
      if (!message || message.type !== 'adult') {
        client.send('error', { code: 'invalid_payload', message: 'confirm_anti_addiction payload must be { type: "adult" }' });
        return;
      }
      const auth = client.auth as AuthToken;
      // 重置成人防沉迷計時器
      console.log(`[AntiAddiction] Adult warning confirmed by player ${auth?.player_id}`);
    });
  }

  // ──────────────────────────────────────────────
  // onJoin
  // ──────────────────────────────────────────────

  /**
   * 玩家加入 Room
   * - 驗證 JWT（由 Colyseus onAuth 預先處理）
   * - 驗證 chip_balance ≥ entry_chips
   * - 分配座位
   * - 初始化 PlayerState
   * - ≥ 2 人時啟動遊戲
   */
  async onJoin(client: Client, options: JoinOptions): Promise<void> {
    const auth = client.auth as AuthToken;

    if (!auth || !auth.player_id) {
      throw new Error('Unauthorized: missing auth token');
    }

    // 驗證籌碼門檻
    if (auth.chip_balance < this.state.tier_config.entry_chips) {
      throw new Error(`insufficient_chips: need ${this.state.tier_config.entry_chips}, have ${auth.chip_balance}`);
    }

    // 分配座位（找最小可用 seat_index）
    const usedSeats = new Set(
      (Array.from(this.state.players.values()) as PlayerState[]).map((p) => p.seat_index),
    );
    let seatIndex = 0;
    while (usedSeats.has(seatIndex)) seatIndex++;

    if (seatIndex >= this.maxClients) {
      throw new Error('room_full');
    }

    // 初始化 PlayerState
    const player = new PlayerState();
    player.player_id = auth.player_id;
    player.session_id = client.sessionId;
    player.seat_index = seatIndex;
    player.chip_balance = auth.chip_balance;
    player.display_name = auth.display_name ?? 'Player';
    player.avatar_url = auth.avatar_url ?? '';
    player.is_connected = true;
    player.is_banker = false;

    this.state.players.set(String(seatIndex), player);

    // 推送 my_session_info（Client 識別自身 session）
    client.send('my_session_info', {
      session_id: client.sessionId,
      player_id: auth.player_id,
    });

    // 清除等待計時器
    if (this.waitingTimer) {
      clearTimeout(this.waitingTimer);
      this.waitingTimer = undefined;
    }

    // ≥ 2 人時啟動遊戲
    if (this.state.players.size >= 2 && this.state.phase === 'waiting') {
      this.startNewRound();
    }
  }

  // ──────────────────────────────────────────────
  // onLeave
  // ──────────────────────────────────────────────

  /**
   * 玩家離開 Room
   * - consented=true：即時 Fold（遊戲進行中）
   * - consented=false：啟動 30s 重連計時器
   */
  async onLeave(client: Client, consented: boolean): Promise<void> {
    const auth = client.auth as AuthToken;
    const playerState = this.findPlayerByAuth(auth);

    if (!playerState) return;

    if (consented) {
      // 主動離開：即時處理
      this.handlePlayerLeave(playerState);
    } else {
      // 非預期斷線：啟動重連視窗
      playerState.is_connected = false;

      const reconnectPromise = this.allowReconnection(client, 30);

      const disconnectTimer = setTimeout(() => {
        // 30s 超時：自動 Fold 並移除
        this.handlePlayerLeave(playerState);
      }, 30_500);

      this.disconnectTimers.set(client.sessionId, disconnectTimer);

      try {
        const reconnectedClient = await reconnectPromise;
        // 重連成功
        clearTimeout(disconnectTimer);
        this.disconnectTimers.delete(client.sessionId);
        playerState.is_connected = true;
        playerState.session_id = reconnectedClient.sessionId;

        // 重新推送手牌
        const hand = this.playerHands.get(auth.player_id);
        if (hand) {
          reconnectedClient.send('myHand', { cards: hand });
        }

        // 重新推送 session info
        reconnectedClient.send('my_session_info', {
          session_id: reconnectedClient.sessionId,
          player_id: auth.player_id,
        });
      } catch {
        // 重連失敗（超時）：已由 setTimeout 處理
        this.disconnectTimers.delete(client.sessionId);
      }
    }
  }

  // ──────────────────────────────────────────────
  // onDispose
  // ──────────────────────────────────────────────

  /**
   * Room 銷毀時執行
   * - 清理所有計時器
   * - 寫入 game_sessions 記錄（TODO: DB integration）
   * - 釋放資源
   */
  async onDispose(): Promise<void> {
    // 清理 phase 計時器
    for (const timer of this.phaseTimers.values()) {
      clearTimeout(timer);
    }
    this.phaseTimers.clear();

    // 清理斷線計時器
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();

    if (this.waitingTimer) {
      clearTimeout(this.waitingTimer);
    }

    // TODO: 寫入 game_sessions（room_id, round_number, banker_id, banker_seat_index,
    //       banker_bet_amount, rake_amount, pot_amount, banker_insolvent, all_fold,
    //       settlement_payload, started_at, ended_at）
    console.log(`[SamGongRoom] Room disposed after ${this.state.round_number} rounds`);
  }

  // ──────────────────────────────────────────────
  // Game Flow
  // ──────────────────────────────────────────────

  /**
   * 開始新一局
   * - 決定/輪換莊家
   * - 清空手牌
   * - 進入 dealing phase
   */
  private startNewRound(): void {
    this.state.round_number += 1;
    this.state.phase = 'dealing';
    this.playerHands.clear();

    const players = Array.from(this.state.players.values()) as PlayerState[];

    // 首局決定莊家
    if (this.state.banker_seat_index === -1) {
      this.state.banker_seat_index = this.bankerRotation.determineFirstBanker(players);
    }

    // 標記莊家
    players.forEach((p) => {
      p.is_banker = p.seat_index === this.state.banker_seat_index;
      p.bet_amount = 0;
      p.has_acted = false;
      p.is_folded = false;
    });

    // TODO: DeckManager 發牌（使用 crypto.randomInt Fisher-Yates）
    // 暫時用空牌組佔位
    // this.deckManager.buildDeck();
    // this.deckManager.shuffle();
    // players.forEach(p => { this.playerHands.set(p.player_id, this.deckManager.deal(3)); });

    // 進入莊家下注 phase
    this.state.phase = 'banker-bet';
    this.state.action_deadline_timestamp = Date.now() + 30_000;

    const bankerTimer = setTimeout(() => {
      // 30s 超時：自動最低下注
      this.handleAutoMinBet();
    }, 30_000);
    this.phaseTimers.set('banker_bet', bankerTimer);
  }

  /**
   * 莊家 30s 超時自動最低下注
   */
  private handleAutoMinBet(): void {
    if (this.state.phase !== 'banker-bet') return;

    const bankerPlayer = (Array.from(this.state.players.values()) as PlayerState[])
      .find((p) => p.seat_index === this.state.banker_seat_index);

    if (!bankerPlayer) {
      // 莊家已離場，回到等待階段（避免以 banker_bet_amount=0 繼續遊戲）
      console.warn('[SamGongRoom] handleAutoMinBet: banker not found, aborting round');
      this.state.phase = 'waiting';
      return;
    }

    // 若莊家籌碼不足最低注，取其現有餘額（不讓 chip_balance 為負）
    const autoBetAmount = Math.min(this.state.min_bet, bankerPlayer.chip_balance);
    this.state.banker_bet_amount = autoBetAmount;
    bankerPlayer.bet_amount = autoBetAmount;
    bankerPlayer.chip_balance -= autoBetAmount;

    this.startPlayerBetPhase();
  }

  /**
   * 開始閒家下注 phase
   */
  private startPlayerBetPhase(): void {
    this.phaseTimers.delete('banker_bet');
    this.state.phase = 'player-bet';

    // 找第一位未行動的閒家
    const firstPlayer = this.getNextPlayerToAct();
    if (firstPlayer === -1) {
      // 所有閒家已行動或無閒家
      this.startShowdown();
      return;
    }

    this.state.current_player_turn_seat = firstPlayer;
    this.state.action_deadline_timestamp = Date.now() + 30_000;

    const timer = setTimeout(() => {
      // 30s 超時：自動 Fold
      const player = (Array.from(this.state.players.values()) as PlayerState[])
        .find((p) => p.seat_index === this.state.current_player_turn_seat);
      if (player && !player.has_acted) {
        player.is_folded = true;
        player.has_acted = true;
      }
      this.advancePlayerTurn();
    }, 30_000);
    this.phaseTimers.set('player_bet', timer);
  }

  /**
   * 輪至下一位閒家行動
   */
  private advancePlayerTurn(): void {
    const timer = this.phaseTimers.get('player_bet');
    if (timer) {
      clearTimeout(timer);
      this.phaseTimers.delete('player_bet');
    }

    const next = this.getNextPlayerToAct();
    if (next === -1) {
      this.startShowdown();
      return;
    }

    this.state.current_player_turn_seat = next;
    this.state.action_deadline_timestamp = Date.now() + 30_000;

    const newTimer = setTimeout(() => {
      const player = (Array.from(this.state.players.values()) as PlayerState[])
        .find((p) => p.seat_index === this.state.current_player_turn_seat);
      if (player && !player.has_acted) {
        player.is_folded = true;
        player.has_acted = true;
      }
      this.advancePlayerTurn();
    }, 30_000);
    this.phaseTimers.set('player_bet', newTimer);
  }

  /**
   * 取得下一個待行動的閒家 seat_index（-1 = 無）
   */
  private getNextPlayerToAct(): number {
    const players = (Array.from(this.state.players.values()) as PlayerState[])
      .filter((p) => p.seat_index !== this.state.banker_seat_index && !p.has_acted)
      .sort((a, b) => a.seat_index - b.seat_index);

    return players.length > 0 ? players[0].seat_index : -1;
  }

  /**
   * 開始 showdown phase
   */
  private startShowdown(): void {
    this.state.phase = 'showdown';

    // 廣播所有未 Fold 玩家手牌
    const revealedHands: Record<string, Card[]> = {};
    for (const [playerId, hand] of this.playerHands.entries()) {
      const player = (Array.from(this.state.players.values()) as PlayerState[])
        .find((p) => p.player_id === playerId && !p.is_folded);
      if (player) {
        revealedHands[String(player.seat_index)] = hand;
      }
    }
    this.broadcast('showdown_reveal', { hands: revealedHands });

    // 執行結算
    this.executeSettlement();
  }

  /**
   * 執行結算
   */
  private executeSettlement(): void {
    const players = Array.from(this.state.players.values()) as PlayerState[];
    const bankerPlayer = players.find((p) => p.seat_index === this.state.banker_seat_index);

    if (!bankerPlayer) {
      console.error('[SamGongRoom] Settlement failed: banker not found');
      return;
    }

    const settlementPlayers = players.map((p) => ({
      player_id: p.player_id,
      seat_index: p.seat_index,
      called_bet: p.bet_amount,
      is_folded: p.is_folded,
      hand: this.playerHands.get(p.player_id) ?? [],
    }));

    try {
      const result = this.settlementEngine.settle({
        players: settlementPlayers,
        banker_seat_index: this.state.banker_seat_index,
        banker_chip_balance: bankerPlayer.chip_balance,
        banker_bet_amount: this.state.banker_bet_amount,
      });

      // 更新 Room State 結算結果
      const settlement = new SettlementState();
      settlement.rake_amount = result.rake_amount;
      settlement.pot_amount = result.pot_amount;
      settlement.banker_insolvent = result.banker_insolvent;
      settlement.banker_remaining_chips = result.banker_remaining_chips;
      settlement.all_fold = result.all_fold;

      const toEntry = (r: (typeof result.winners)[0]): SettlementEntry => {
        const e = new SettlementEntry();
        e.player_id = r.player_id;
        e.seat_index = r.seat_index;
        e.net_chips = r.net_chips;
        e.bet_amount = r.bet_amount;
        e.payout_amount = r.payout_amount;
        e.result = r.result;
        e.hand_type = r.hand_type;
        e.is_sam_gong = r.is_sam_gong;
        return e;
      };

      result.winners.forEach((r) => settlement.winners.push(toEntry(r)));
      result.losers.forEach((r) => settlement.losers.push(toEntry(r)));
      result.ties.forEach((r) => settlement.ties.push(toEntry(r)));
      result.folders.forEach((r) => settlement.folders.push(toEntry(r)));
      result.insolvent_winners.forEach((r) => settlement.insolvent_winners.push(toEntry(r)));

      this.state.settlement = settlement;
      this.state.phase = 'settled';

      // 更新每位玩家籌碼（含莊家）
      //
      // ── 重要：chip_balance 已在下注時扣除 escrow ──
      // 閒家下注/跟注時：chip_balance -= called_bet（escrow 預扣）
      // 莊家下注時：chip_balance -= banker_bet_amount（escrow 預扣）
      //
      // 閒家（非莊家）：使用 payout_amount（總返回額）直接加回
      //   - 贏家：payout_amount = called_bet + N×banker_bet → 返回本金+盈餘
      //   - 輸家：payout_amount = 0 → 不返還（escrow 已扣，無需再扣）
      //   - 平手：payout_amount = called_bet → 返回本金
      //   - 棄牌：payout_amount = 0, bet_amount = 0 → 無任何扣除，不返還
      //   - InsolventWinner：payout_amount = 0 → 不返還（escrow 已扣）
      //
      // 莊家：使用 net_chips（相對 post-escrow 的增減）
      //   - net_chips = pot - rake - winner_payouts + insolvent_bets
      const bankerSeat = this.state.banker_seat_index;

      const nonBankerResults = [
        ...result.winners,
        ...result.losers,
        ...result.ties,
        ...result.folders,
        ...result.insolvent_winners,
      ];

      for (const r of nonBankerResults) {
        const playerState = players.find((p) => p.seat_index === r.seat_index);
        if (playerState) {
          playerState.chip_balance += r.payout_amount;
        }
      }

      // 莊家 chip_balance 以 (banker_bet_amount + net_chips) 調整
      // 原因：chip_balance 已是 post-escrow 狀態（-banker_bet_amount 已扣）
      //   delta = banker_bet_amount + net_chips
      //   = 退回 escrow + 純損益
      //   - 全員棄牌：banker_bet_amount + 0 = 返還 escrow
      //   - 莊家贏：banker_bet_amount + bankerNetChips（>0）= 返還 escrow + 盈餘
      //   - 莊家輸：banker_bet_amount + bankerNetChips（<0）= 返還部分 escrow + 淨損失
      const bankerState = players.find((p) => p.seat_index === bankerSeat);
      if (bankerState) {
        bankerState.chip_balance += this.state.banker_bet_amount + result.banker_settlement.net_chips;
      }

      // 5s 後自動開始下一局
      const nextRoundTimer = setTimeout(() => {
        this.phaseTimers.delete('next_round');
        if (this.state.players.size >= 2) {
          this.resetForNextRound();
          this.startNewRound();
        } else {
          this.state.phase = 'waiting';
          this.waitingTimer = setTimeout(() => {
            if (this.state.players.size < 2) {
              this.disconnect();
            }
          }, 60_000);
        }
      }, 5_000);
      this.phaseTimers.set('next_round', nextRoundTimer);

    } catch (err) {
      console.error('[SamGongRoom] Settlement error:', err);
    }
  }

  /**
   * 重置 State 為下一局
   * - 保留 is_banker、chip_balance、player_id
   * - 清空下注、行動狀態、手牌
   * - 輪莊
   */
  private resetForNextRound(): void {
    this.state.players.forEach((player) => {
      player.bet_amount = 0;
      player.has_acted = false;
      player.is_folded = false;
    });

    this.state.banker_bet_amount = 0;
    this.state.current_pot = 0;
    this.state.action_deadline_timestamp = 0;
    this.state.current_player_turn_seat = -1;
    this.state.settlement = new SettlementState();

    this.playerHands.clear();

    // 輪莊
    const players = Array.from(this.state.players.values()) as PlayerState[];
    const nextBankerSeat = this.bankerRotation.rotateWithSkip(
      this.state.banker_seat_index,
      players,
      this.state.min_bet,
    );

    if (nextBankerSeat === -1) {
      // 無合格莊家，進入等待
      this.state.phase = 'waiting';
      return;
    }

    this.state.banker_seat_index = nextBankerSeat;

    players.forEach((p) => {
      p.is_banker = p.seat_index === nextBankerSeat;
    });
  }

  // ──────────────────────────────────────────────
  // Message Handlers
  // ──────────────────────────────────────────────

  /**
   * 處理莊家下注
   * 驗證：phase==='banker-bet', is_banker, min_bet ≤ amount ≤ max_bet, amount ≤ chip_balance
   */
  private handleBankerBet(client: Client, message: BankerBetMessage): void {
    const player = this.findPlayerByClient(client);
    if (!player) return;

    if (this.state.phase !== 'banker-bet') {
      client.send('error', { code: 'invalid_phase', message: 'Not in banker-bet phase' });
      return;
    }

    if (!player.is_banker) {
      client.send('error', { code: 'not_banker', message: 'You are not the banker' });
      return;
    }

    const { amount } = message;

    // amount 必須為正整數（非整數/負數視為非法）
    if (!Number.isInteger(amount) || amount <= 0) {
      client.send('error', { code: 'invalid_bet_amount', message: 'Bet amount must be a positive integer' });
      return;
    }

    if (amount < this.state.min_bet || amount > this.state.max_bet) {
      client.send('error', { code: 'bet_out_of_range', message: `Bet must be between ${this.state.min_bet} and ${this.state.max_bet}` });
      return;
    }

    if (player.chip_balance < amount) {
      client.send('error', { code: 'insufficient_chips', message: 'Insufficient chips' });
      return;
    }

    // 清除自動下注計時器
    const timer = this.phaseTimers.get('banker_bet');
    if (timer) {
      clearTimeout(timer);
      this.phaseTimers.delete('banker_bet');
    }

    // Escrow 扣除
    player.chip_balance -= amount;
    player.bet_amount = amount;
    this.state.banker_bet_amount = amount;

    this.startPlayerBetPhase();
  }

  /**
   * 處理閒家跟注（Call）
   * 驗證：phase==='player-bet', 本人輪次, chip_balance ≥ banker_bet_amount
   */
  private handleCall(client: Client): void {
    const player = this.findPlayerByClient(client);
    if (!player) return;

    if (this.state.phase !== 'player-bet') {
      client.send('error', { code: 'invalid_phase', message: 'Not in player-bet phase' });
      return;
    }

    if (player.seat_index !== this.state.current_player_turn_seat) {
      client.send('error', { code: 'not_your_turn', message: 'Not your turn' });
      return;
    }

    if (player.chip_balance < this.state.banker_bet_amount) {
      client.send('error', { code: 'insufficient_chips', message: 'Insufficient chips to call' });
      return;
    }

    // Escrow 扣除
    player.chip_balance -= this.state.banker_bet_amount;
    player.bet_amount = this.state.banker_bet_amount;
    player.has_acted = true;

    this.advancePlayerTurn();
  }

  /**
   * 處理閒家棄牌（Fold）
   * 驗證：phase==='player-bet', 本人輪次
   */
  private handleFold(client: Client): void {
    const player = this.findPlayerByClient(client);
    if (!player) return;

    if (this.state.phase !== 'player-bet') {
      client.send('error', { code: 'invalid_phase', message: 'Not in player-bet phase' });
      return;
    }

    if (player.seat_index !== this.state.current_player_turn_seat) {
      client.send('error', { code: 'not_your_turn', message: 'Not your turn' });
      return;
    }

    player.is_folded = true;
    player.bet_amount = 0;
    player.has_acted = true;

    this.advancePlayerTurn();
  }

  /**
   * 處理莊家查看手牌（see_cards）
   * 驗證：phase==='banker-bet', is_banker
   */
  private handleSeeCards(client: Client): void {
    const player = this.findPlayerByClient(client);
    if (!player) return;

    if (this.state.phase !== 'banker-bet') {
      client.send('error', { code: 'invalid_phase', message: 'Not in banker-bet phase' });
      return;
    }

    if (!player.is_banker) {
      client.send('error', { code: 'not_banker', message: 'Only banker can see cards' });
      return;
    }

    const hand = this.playerHands.get(player.player_id);
    if (hand) {
      client.send('myHand', { cards: hand });
    }
  }

  /**
   * 處理聊天訊息
   * 驗證：text.length ≤ 200
   */
  private handleChat(client: Client, message: ChatMessage): void {
    const player = this.findPlayerByClient(client);
    if (!player) return;

    if (!message.text || message.text.trim().length === 0 || message.text.length > 200) {
      client.send('send_message_rejected', { reason: 'content_filter' });
      return;
    }

    // 廣播至房間（不含發送者自身可選）
    this.broadcast('chat_message', {
      player_id: player.player_id,
      seat_index: player.seat_index,
      display_name: player.display_name,
      text: message.text,
      timestamp: Date.now(),
    });
  }

  /**
   * 處理舉報玩家
   */
  private handleReport(client: Client, message: ReportMessage): void {
    const reporter = this.findPlayerByClient(client);
    if (!reporter) return;

    // 驗證 payload 欄位長度，防止日誌注入與超大 payload 攻擊
    if (
      !message.target_id || typeof message.target_id !== 'string' || message.target_id.length > 100 ||
      !message.message_id || typeof message.message_id !== 'string' || message.message_id.length > 100 ||
      !message.reason || typeof message.reason !== 'string' || message.reason.length > 500
    ) {
      client.send('error', { code: 'invalid_payload', message: 'Invalid report payload' });
      return;
    }

    // TODO: 寫入 player_reports 表
    console.log(`[Report] player ${reporter.player_id} reported ${message.target_id}, reason: ${message.reason}`);
  }

  /**
   * 處理玩家離場（自願或超時）
   */
  private handlePlayerLeave(playerState: PlayerState): void {
    // 遊戲進行中：自動 Fold
    if (
      this.state.phase === 'player-bet' &&
      playerState.seat_index === this.state.current_player_turn_seat &&
      !playerState.has_acted
    ) {
      playerState.is_folded = true;
      playerState.bet_amount = 0;
      playerState.has_acted = true;
      this.advancePlayerTurn();
    }

    // 從房間移除
    const seatKey = String(playerState.seat_index);
    this.state.players.delete(seatKey);
    this.playerHands.delete(playerState.player_id);

    // 若剩餘玩家不足 2 人且在等待中，啟動解散計時器
    if (this.state.players.size < 2 && this.state.phase === 'waiting') {
      if (!this.waitingTimer) {
        this.waitingTimer = setTimeout(() => {
          this.disconnect();
        }, 60_000);
      }
    }
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  /**
   * 透過 client.auth 反查 PlayerState
   */
  private findPlayerByAuth(auth: AuthToken): PlayerState | undefined {
    if (!auth) return undefined;
    return (Array.from(this.state.players.values()) as PlayerState[])
      .find((p) => p.player_id === auth.player_id);
  }

  /**
   * 透過 Client 物件反查 PlayerState
   */
  private findPlayerByClient(client: Client): PlayerState | undefined {
    const auth = client.auth as AuthToken;
    return this.findPlayerByAuth(auth);
  }
}
