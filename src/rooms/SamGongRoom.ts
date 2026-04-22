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
} from '../schema/SamGongState';
import { HandEvaluator, Card, makeCard } from '../game/HandEvaluator';
import { SettlementEngine } from '../game/SettlementEngine';
import { BankerRotation } from '../game/BankerRotation';
import { DeckManager, CardDTO } from '../game/DeckManager';
import { AntiAddictionManager } from '../game/AntiAddictionManager';

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
  private deckManager: DeckManager = new DeckManager();
  private antiAddictionManager: AntiAddictionManager = new AntiAddictionManager();

  /** 各玩家手牌（Server-only，不同步至 Client） */
  private playerHands: Map<string, Card[]> = new Map();

  /** Phase 計時器 */
  private phaseTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** 斷線重連計時器 */
  private disconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** 等待中房間自動解散計時器 */
  private waitingTimer?: ReturnType<typeof setTimeout>;

  // ──────────────────────────────────────────────
  // onAuth — JWT 驗證（dev mode 自動 bypass）
  // ──────────────────────────────────────────────

  async onAuth(_client: Client, options: JoinOptions): Promise<AuthToken> {
    const isDev = process.env['NODE_ENV'] !== 'production';

    // ── Dev mode bypass ──────────────────────────────────────────────────
    if (isDev) {
      const nickname = (options as unknown as { nickname?: string }).nickname ?? 'DevPlayer';
      const playerId = 'dev_' + Math.random().toString(36).slice(2, 10);
      console.log(`[onAuth] DEV MODE — auto auth for "${nickname}" (${playerId})`);
      return {
        player_id: playerId,
        display_name: nickname,
        chip_balance: 100_000,   // 10萬測試籌碼
        avatar_url: '',
        is_minor: false,
      };
    }

    // ── Production: verify JWT ───────────────────────────────────────────
    const token = options?.token;
    if (!token) {
      throw new Error('Unauthorized: missing auth token');
    }

    try {
      // TODO: replace with real JWT verification using jsonwebtoken + public key
      // const payload = jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
      // return payload as AuthToken;
      throw new Error('JWT verification not implemented — use dev mode (NODE_ENV=development)');
    } catch (e) {
      throw new Error('Unauthorized: invalid token');
    }
  }

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
      if (!auth?.player_id) return;

      // 重置成人防沉迷計時器
      this.antiAddictionManager.onAdultWarningConfirmed(auth.player_id);
      console.log(`[AntiAddiction] Adult warning confirmed and timer reset for player ${auth.player_id}`);
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
  async onJoin(client: Client, _options: JoinOptions): Promise<void> {
    const auth = client.auth as AuthToken;

    if (!auth || !auth.player_id) {
      throw new Error('Unauthorized: missing auth token');
    }

    const isDev = process.env['NODE_ENV'] !== 'production';

    // 驗證籌碼門檻（dev mode 跳過）
    if (!isDev && auth.chip_balance < this.state.tier_config.entry_chips) {
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
    // BUG-20260422-001：中途加入（phase !== 'waiting'）時標記為排隊，
    // 本局不參與任何行動；resetForNextRound 時清除旗標正式入局。
    player.is_waiting_next_round = this.state.phase !== 'waiting';
    if (player.is_waiting_next_round) {
      player.has_acted = true;  // 避免被 getNextPlayerToAct 選中
      player.is_folded = false;
    }

    this.state.players.set(String(seatIndex), player);

    // 廣播最新 Room State（純 JSON，供 Client 識別玩家列表）
    this.broadcastRoomState();

    // 推送 my_session_info（Client 識別自身 session）
    client.send('my_session_info', {
      session_id: client.sessionId,
      player_id: auth.player_id,
    });

    // 防沉迷路由（KYC is_minor）
    if (auth.is_minor) {
      // 未成年：追蹤每日遊玩時間，達上限時發送 underage_stop 並踢出（WS 4003）
      const status = await this.antiAddictionManager.trackUnderageDaily(auth.player_id);
      if (status.should_logout) {
        const midnight = this.antiAddictionManager.getTaiwanMidnightTimestamp();
        client.send('anti_addiction_signal', {
          type: 'underage',
          daily_minutes_remaining: 0,
          midnight_timestamp: midnight,
        });
        this.antiAddictionManager.scheduleUnderageLogout(auth.player_id, false);
        client.leave(4003);
        return;
      }
    } else {
      // 成人：追蹤連續遊玩時間，達 2h 時發送 adult_warning
      const status = await this.antiAddictionManager.trackAdultSession(auth.player_id);
      if (status.should_warn) {
        client.send('anti_addiction_warning', {
          type: 'adult',
          session_minutes: Math.floor(status.session_play_seconds / 60),
        });
      }
    }

    // 清除等待計時器
    if (this.waitingTimer) {
      clearTimeout(this.waitingTimer);
      this.waitingTimer = undefined;
    }

    // BUG-20260422-009：≥ 2 人 → 3 秒倒數再開局（讓玩家看到「遊戲即將開始」提示）
    if (this.state.players.size >= 2 && this.state.phase === 'waiting') {
      if (!this.phaseTimers.has('game_start')) {
        const COUNTDOWN_MS = 3_000;
        this.state.action_deadline_timestamp = Date.now() + COUNTDOWN_MS;
        this.broadcastRoomState();
        const startTimer = setTimeout(() => {
          this.phaseTimers.delete('game_start');
          // 倒數結束再次確認：仍有 ≥ 2 人且還在等待中才開局
          if (this.state.players.size >= 2 && this.state.phase === 'waiting') {
            this.startNewRound();
          } else {
            this.state.action_deadline_timestamp = 0;
            this.broadcastRoomState();
          }
        }, COUNTDOWN_MS);
        this.phaseTimers.set('game_start', startTimer);
      }
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

    // BUG-20260422-001：僅現役玩家參與發牌 / 輪莊 / 下注，排除中途加入排隊者
    const players = (Array.from(this.state.players.values()) as PlayerState[])
      .filter((p) => !p.is_waiting_next_round);

    // 首局決定莊家
    if (this.state.banker_seat_index === -1) {
      this.state.banker_seat_index = this.bankerRotation.determineFirstBanker(players);
    }

    // 標記莊家（僅現役）
    players.forEach((p) => {
      p.is_banker = p.seat_index === this.state.banker_seat_index;
      p.bet_amount = 0;
      p.has_acted = false;
      p.is_folded = false;
    });
    // 排隊玩家確保不被選為莊家、不被選為行動對象
    (Array.from(this.state.players.values()) as PlayerState[])
      .filter((p) => p.is_waiting_next_round)
      .forEach((p) => {
        p.is_banker = false;
        p.has_acted = true;
        p.bet_amount = 0;
        p.is_folded = false;
      });

    // DeckManager 發牌（使用 crypto.randomInt Fisher-Yates）
    if (this.state.is_tutorial) {
      // 教學模式：使用固定劇本（round 1~3 循環）
      const tutorialRound = ((this.state.round_number - 1) % 3 + 1) as 1 | 2 | 3;
      this.deckManager.loadTutorialScript(tutorialRound);

      // 莊家固定牌
      const bankerPlayer = players.find((p) => p.seat_index === this.state.banker_seat_index);
      if (bankerPlayer) {
        const bankerCards = this.deckManager.dealTutorialBankerHand();
        const bankerHand: Card[] = bankerCards.map((c: CardDTO) => makeCard(c.value, c.suit));
        this.playerHands.set(bankerPlayer.player_id, bankerHand);
      }

      // 閒家固定牌
      const nonBankerPlayers = players.filter((p) => p.seat_index !== this.state.banker_seat_index);
      nonBankerPlayers.forEach((p, idx) => {
        const playerKey = `P${idx + 1}`;
        try {
          const playerCards = this.deckManager.dealTutorialPlayerHand(playerKey);
          const hand: Card[] = playerCards.map((c: CardDTO) => makeCard(c.value, c.suit));
          this.playerHands.set(p.player_id, hand);
        } catch {
          // 若教學劇本無此 key，使用第一位玩家手牌
          const playerCards = this.deckManager.dealTutorialPlayerHand('P1');
          const hand: Card[] = playerCards.map((c: CardDTO) => makeCard(c.value, c.suit));
          this.playerHands.set(p.player_id, hand);
        }
      });
    } else {
      // 一般模式：隨機洗牌後發牌（crypto.randomInt Fisher-Yates）
      this.deckManager.buildDeck();
      this.deckManager.shuffle();
      players.forEach((p) => {
        const dealtCards = this.deckManager.deal(3);
        const hand: Card[] = dealtCards.map((c: CardDTO) => makeCard(c.value, c.suit));
        this.playerHands.set(p.player_id, hand);
      });
    }

    // BUG-20260422-009：先廣播 room_state（含最新 banker_seat_index）再送 myHand，
    // 讓 Client 的發牌動畫能從正確的莊家座位飛出，而非還是 -1 的空位。
    this.broadcastRoomState();

    // 發送私人手牌給每位玩家
    this.clients.forEach((client) => {
      const auth = client.auth as AuthToken;
      if (!auth?.player_id) return;
      const hand = this.playerHands.get(auth.player_id);
      if (hand) {
        client.send('myHand', { cards: hand });
      }
    });

    // 變更追蹤 BUG-20260422-001：移除遊戲開局時的房間鎖定。
    // 依 PRD §5.0.3，中途加入者應排隊至下一局，不應被拒於房間之外。
    // 中途加入者以 PlayerState.is_waiting_next_round=true 旗標區隔，
    // 不進當前局的發牌 / 下注 / 輪莊；resetForNextRound 時清除旗標正式入局。

    // 進入莊家下注 phase
    this.state.phase = 'banker-bet';
    this.state.action_deadline_timestamp = Date.now() + 30_000;

    // 廣播最新 Room State（新局開始）
    this.broadcastRoomState();

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
    // BUG-20260422-002：莊家下注屬 escrow，不進 current_pot。獎池只由閒家 call 累加。

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

    // 廣播最新 Room State（進入 player-bet phase）
    this.broadcastRoomState();

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

    // 廣播最新 Room State（輪至下一位閒家）
    this.broadcastRoomState();

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
    // BUG-20260422-001：排除 mid-game join 排隊者（雖然 has_acted=true 已間接排除，仍顯式過濾較清晰）
    const players = (Array.from(this.state.players.values()) as PlayerState[])
      .filter((p) => p.seat_index !== this.state.banker_seat_index
        && !p.has_acted
        && !p.is_waiting_next_round)
      .sort((a, b) => a.seat_index - b.seat_index);

    return players.length > 0 ? players[0].seat_index : -1;
  }

  /**
   * 開始 showdown phase
   */
  private startShowdown(): void {
    this.state.phase = 'showdown';

    // 廣播最新 Room State（phase = showdown）
    this.broadcastRoomState();

    // 廣播所有未 Fold 玩家手牌（含預計算牌形，讓 client 逐座顯示）
    const revealedHands: Record<string, Card[]> = {};
    for (const [playerId, hand] of this.playerHands.entries()) {
      const player = (Array.from(this.state.players.values()) as PlayerState[])
        .find((p) => p.player_id === playerId && !p.is_folded);
      if (player) {
        revealedHands[String(player.seat_index)] = hand;
      }
    }
    // 預計算每位玩家的牌形（hand_type, points, is_sam_gong）
    const handTypes: Record<string, { hand_type: string; points: number; is_sam_gong: boolean }> = {};
    for (const [seatKey, hand] of Object.entries(revealedHands)) {
      try {
        const res = this.handEvaluator.evaluate(hand);
        handTypes[seatKey] = { hand_type: res.hand_type, points: res.points, is_sam_gong: res.is_sam_gong };
      } catch (_) { /* skip */ }
    }
    this.broadcast('showdown_reveal', { hands: revealedHands, hand_types: handTypes });

    // 延遲 3 秒讓玩家看牌，再執行結算
    const showdownTimer = setTimeout(() => {
      this.phaseTimers.delete('showdown_delay');
      this.executeSettlement();
    }, 3_000);
    this.phaseTimers.set('showdown_delay', showdownTimer);
  }

  /**
   * 執行結算
   */
  private executeSettlement(): void {
    // BUG-20260422-001 regression fix：結算只含本局現役玩家，
    // 中途加入排隊者（is_waiting_next_round=true）未發牌，必須排除，
    // 否則 SettlementEngine/HandEvaluator 會因空手牌拋 "expected 3 cards, got 0"。
    const players = (Array.from(this.state.players.values()) as PlayerState[])
      .filter((p) => !p.is_waiting_next_round);
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

      // 廣播最新 Room State（含結算結果 + 更新後籌碼）
      this.broadcastRoomState();

      // Write-Through 防沉迷計時資料至 PostgreSQL/Redis（每局 settled 後）
      players.forEach((p) => {
        this.antiAddictionManager.persistTimers(p.player_id).catch((err) => {
          console.error(`[SamGongRoom] AntiAddiction persistTimers failed for ${p.player_id}:`, err);
        });
      });

      // 5s 後自動開始下一局
      const nextRoundTimer = setTimeout(() => {
        this.phaseTimers.delete('next_round');
        if (this.state.players.size >= 2) {
          this.resetForNextRound();
          // resetForNextRound 可能因無合格莊家而提早 return（phase='waiting'）
          if (this.state.phase === 'waiting') {
            // BUG-20260422-001：房間於遊戲中亦開放加入，unlock() 保留為無害守備
            this.broadcastRoomState();
          } else {
            this.startNewRound();
          }
        } else {
          this.state.phase = 'waiting';
          this.unlock();  // 重新開放加入
          this.broadcastRoomState();
          this.waitingTimer = setTimeout(() => {
            if (this.state.players.size < 2) {
              this.disconnect();
            }
          }, 60_000);
        }
      }, 5_000);
      this.phaseTimers.set('next_round', nextRoundTimer);

    } catch (err) {
      // 結算失敗：recovery — 5s 後重置並重新開局，避免 client 永久卡住
      console.error('[SamGongRoom] Settlement error (recovering):', err);
      this.state.phase = 'waiting';
      this.unlock();
      this.broadcastRoomState();
      const recoveryTimer = setTimeout(() => {
        this.phaseTimers.delete('settlement_recovery');
        if (this.state.players.size >= 2) {
          this.playerHands.clear();
          this.resetForNextRound();
          if (this.state.phase !== 'waiting') {
            this.startNewRound();
          }
        }
      }, 3_000);
      this.phaseTimers.set('settlement_recovery', recoveryTimer);
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
      // BUG-20260422-001：清除 mid-game join 旗標，排隊玩家於下一局正式入局
      player.is_waiting_next_round = false;
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

    // BUG-20260422-001：中途加入排隊玩家不得行動
    if (player.is_waiting_next_round) {
      client.send('error', { code: 'waiting_next_round', message: 'You joined mid-game; please wait for next round' });
      return;
    }

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
    // BUG-20260422-002：莊家下注屬 escrow，不進 current_pot。獎池只由閒家 call 累加。

    this.startPlayerBetPhase();
  }

  /**
   * 處理閒家跟注（Call）
   * 驗證：phase==='player-bet', 本人輪次, chip_balance ≥ banker_bet_amount
   */
  private handleCall(client: Client): void {
    const player = this.findPlayerByClient(client);
    if (!player) return;

    // BUG-20260422-001：中途加入排隊玩家不得行動
    if (player.is_waiting_next_round) {
      client.send('error', { code: 'waiting_next_round', message: 'You joined mid-game; please wait for next round' });
      return;
    }

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
    this.state.current_pot += this.state.banker_bet_amount;  // ← 閒家跟注入池

    this.advancePlayerTurn();
  }

  /**
   * 處理閒家棄牌（Fold）
   * 驗證：phase==='player-bet', 本人輪次
   */
  private handleFold(client: Client): void {
    const player = this.findPlayerByClient(client);
    if (!player) return;

    // BUG-20260422-001：中途加入排隊玩家不得行動
    if (player.is_waiting_next_round) {
      client.send('error', { code: 'waiting_next_round', message: 'You joined mid-game; please wait for next round' });
      return;
    }

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

    // BUG-20260422-009：若倒數中有人離場導致 < 2 人，取消遊戲倒數
    if (this.state.players.size < 2 && this.phaseTimers.has('game_start')) {
      clearTimeout(this.phaseTimers.get('game_start') as ReturnType<typeof setTimeout>);
      this.phaseTimers.delete('game_start');
      this.state.action_deadline_timestamp = 0;
      this.broadcastRoomState();
    }

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
  // State Broadcast Helper
  // ──────────────────────────────────────────────

  /**
   * 廣播完整 Room State 至所有 Client（純 JSON，繞過 Schema 序列化）
   * 用途：解決 @colyseus/schema 版本不一致導致 Client 端無法解碼 Schema 的問題。
   * Client 以此訊息為主要狀態來源，不依賴 Colyseus schema sync。
   */
  private broadcastRoomState(): void {
    const players: Array<{
      seat_index: number; player_id: string; display_name: string;
      chip_balance: number; is_banker: boolean; is_folded: boolean;
      has_acted: boolean; bet_amount: number;
      is_waiting_next_round: boolean;
    }> = [];

    this.state.players.forEach((p) => {
      players.push({
        seat_index: p.seat_index,
        player_id: p.player_id,
        display_name: p.display_name,
        chip_balance: p.chip_balance,
        is_banker: p.is_banker,
        is_folded: p.is_folded,
        has_acted: p.has_acted,
        bet_amount: p.bet_amount,
        // BUG-20260422-001：Client 可據此顯示「等待下一局」提示
        is_waiting_next_round: p.is_waiting_next_round,
      });
    });

    // Serialize settlement (ArraySchema → plain array)
    const toArr = (col: { forEach: (fn: (e: SettlementEntry) => void) => void } | null | undefined) => {
      const arr: Array<{
        player_id: string; seat_index: number; net_chips: number;
        bet_amount: number; payout_amount: number; result: string;
        hand_type: string; is_sam_gong: boolean;
      }> = [];
      if (col && typeof col.forEach === 'function') {
        col.forEach((e) => arr.push({
          player_id: e.player_id,
          seat_index: e.seat_index,
          net_chips: e.net_chips,
          bet_amount: e.bet_amount,
          payout_amount: e.payout_amount,
          result: e.result,
          hand_type: e.hand_type,
          is_sam_gong: e.is_sam_gong,
        }));
      }
      return arr;
    };

    const s = this.state.settlement;
    const settlement = (s && this.state.phase === 'settled') ? {
      rake_amount: s.rake_amount,
      pot_amount: s.pot_amount,
      banker_insolvent: s.banker_insolvent,
      all_fold: s.all_fold,
      winners: toArr(s.winners),
      losers: toArr(s.losers),
      ties: toArr(s.ties),
      folders: toArr(s.folders),
      insolvent_winners: toArr(s.insolvent_winners),
    } : null;

    const quickBets: number[] = [];
    if (this.state.tier_config?.quick_bet_amounts) {
      this.state.tier_config.quick_bet_amounts.forEach((v: number) => quickBets.push(v));
    }

    this.broadcast('room_state', {
      phase: this.state.phase,
      current_pot: this.state.current_pot,
      current_player_turn_seat: this.state.current_player_turn_seat,
      banker_bet_amount: this.state.banker_bet_amount,
      banker_seat_index: this.state.banker_seat_index,
      // BUG-20260422-011：action_deadline_timestamp 必須下發，
      // Client 才能畫遊戲開始倒數 + 輪到誰的頭頂計時器
      action_deadline_timestamp: this.state.action_deadline_timestamp,
      min_bet: this.state.min_bet,
      max_bet: this.state.max_bet,
      hall_name: this.state.tier_config?.tier_name || '青銅廳',
      quick_bet_amounts: quickBets,
      players,
      settlement,
    });
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
