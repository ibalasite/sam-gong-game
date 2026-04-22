/**
 * SamGongRoom 單元測試（骨架）
 *
 * 對應 BDD Feature: tests/features/server/game_flow.feature
 *
 * 覆蓋範圍：
 * - Room onCreate：初始化狀態、廳別設定
 * - onJoin：JWT 驗證、籌碼門檻、座位分配
 * - onLeave：重連視窗、自動 Fold
 * - 訊息處理：banker_bet / call / fold / see_cards / send_chat / report_player
 * - 遊戲流程：waiting → dealing → banker-bet → player-bet → showdown → settled
 * - 輪莊邏輯
 * - 防沉迷整合
 *
 * 注意：
 * - SamGongRoom 依賴 Colyseus 環境（@colyseus/core）
 * - 完整整合測試需 Colyseus Testing 套件（@colyseus/testing）
 * - 本骨架以 Jest + Mock 形式驗證業務邏輯；
 *   端對端 Room 生命週期測試建議使用 @colyseus/testing
 *
 * TODO（v1.0 完整實作）：
 * - 整合 @colyseus/testing 套件（ColyseusTestServer）
 * - 補充完整 Scenario：60s 無人解散、30s 重連逾時、防沉迷訊號
 * - 補充 DeckManager Mock（發固定手牌）
 * - 補充 AntiAddictionManager Mock（成人/未成年計時）
 */

import { SamGongRoom, TIER_CONFIGS, VALID_PHASES } from '../../src/rooms/SamGongRoom';

// ──────────────────────────────────────────────
// Mock 設定（Colyseus 核心依賴）
// ──────────────────────────────────────────────

/**
 * 建立 Mock Client 物件
 * 模擬 Colyseus Client 介面，提供 send / auth / sessionId
 */
function createMockClient(options: {
  player_id: string;
  display_name?: string;
  chip_balance?: number;
  is_minor?: boolean;
  avatar_url?: string;
  sessionId?: string;
}) {
  const sentMessages: Array<{ type: string; data: unknown }> = [];

  return {
    sessionId: options.sessionId ?? `session_${options.player_id}`,
    auth: {
      player_id: options.player_id,
      display_name: options.display_name ?? `Player_${options.player_id}`,
      chip_balance: options.chip_balance ?? 100000,
      is_minor: options.is_minor ?? false,
      avatar_url: options.avatar_url ?? '',
    },
    send(type: string, data: unknown) {
      sentMessages.push({ type, data });
    },
    getSentMessages() {
      return sentMessages;
    },
    getLastMessage() {
      return sentMessages[sentMessages.length - 1];
    },
    clearMessages() {
      sentMessages.length = 0;
    },
  };
}

// ──────────────────────────────────────────────
// 測試群組
// ──────────────────────────────────────────────

describe('SamGongRoom', () => {
  // 注意：SamGongRoom 的完整 Colyseus 生命週期測試需要 @colyseus/testing。
  // 以下測試聚焦於可直接單元測試的業務邏輯（不依賴 Colyseus server 啟動）。

  describe('廳別設定（Tier Config）', () => {
    it('TC-ROOM-001: TIER_CONFIGS 青銅廳設定正確', () => {
      // 從實際 TIER_CONFIGS 匯出驗證，與 EDD §3.3 對齊
      const bronze = TIER_CONFIGS['青銅廳'];

      expect(bronze).toBeDefined();
      expect(bronze.entry_chips).toBe(1000);
      expect(bronze.min_bet).toBe(100);
      expect(bronze.max_bet).toBe(500);
      expect(bronze.quick_bets).toEqual([100, 200, 300, 500]);
    });

    it('TC-ROOM-002: 鑽石廳設定值正確', () => {
      // 從實際 TIER_CONFIGS 匯出驗證，與 EDD §3.3 對齊
      const diamond = TIER_CONFIGS['鑽石廳'];

      expect(diamond).toBeDefined();
      expect(diamond.entry_chips).toBe(10000000);
      expect(diamond.min_bet).toBe(1000000);
      expect(diamond.max_bet).toBe(5000000);
      expect(diamond.quick_bets).toEqual([1000000, 2000000, 3000000, 5000000]);
    });
  });

  describe('Mock Client 輔助函式', () => {
    it('TC-ROOM-003: createMockClient 建立正確的 Client 物件', () => {
      const client = createMockClient({
        player_id: 'player_1',
        chip_balance: 50000,
      });

      expect(client.auth.player_id).toBe('player_1');
      expect(client.auth.chip_balance).toBe(50000);
      expect(client.auth.is_minor).toBe(false);
      expect(client.sessionId).toBe('session_player_1');
    });

    it('TC-ROOM-004: Mock Client send() 記錄訊息', () => {
      const client = createMockClient({ player_id: 'p1' });

      client.send('error', { code: 'test_error' });
      client.send('my_session_info', { session_id: 'abc', player_id: 'p1' });

      const messages = client.getSentMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ type: 'error', data: { code: 'test_error' } });
      expect(messages[1].type).toBe('my_session_info');
    });
  });

  describe('Phase 狀態機驗證', () => {
    it('TC-ROOM-005: Phase 枚舉值定義正確（驗證實際 VALID_PHASES 匯出）', () => {
      // 從實際 VALID_PHASES 匯出驗證，與 EDD §3.5 對齊
      expect(VALID_PHASES).toContain('waiting');
      expect(VALID_PHASES).toContain('dealing');
      expect(VALID_PHASES).toContain('banker-bet');
      expect(VALID_PHASES).toContain('player-bet');
      expect(VALID_PHASES).toContain('showdown');
      expect(VALID_PHASES).toContain('settled');
      expect(VALID_PHASES).toHaveLength(6);
    });
  });

  describe('SamGongRoom 類別存在性驗證', () => {
    it('TC-ROOM-006: SamGongRoom 可被 import', () => {
      // 確認模組可正常載入（不依賴 Colyseus server）
      expect(SamGongRoom).toBeDefined();
      expect(typeof SamGongRoom).toBe('function');
    });
  });

  // ──────────────────────────────────────────────
  // TODO 項目（需整合 @colyseus/testing）
  // ──────────────────────────────────────────────

  describe.skip('Room 生命週期（需 @colyseus/testing）', () => {
    /**
     * TC-ROOM-010: onCreate 初始化狀態
     * Given: SamGongRoom 建立（青銅廳）
     * Then: state.phase === 'waiting'
     *       state.tier_config.min_bet === 100
     *       state.round_number === 0
     *       state.banker_seat_index === -1
     */
    it('TC-ROOM-010: onCreate 初始化狀態正確', async () => {
      // TODO: 使用 @colyseus/testing ColyseusTestServer
      // const server = new ColyseusTestServer();
      // const room = await server.createRoom('sam_gong', { tier: '青銅廳' });
      // expect(room.state.phase).toBe('waiting');
    });

    /**
     * TC-ROOM-011: onJoin 籌碼不足拒絕
     * Given: 玩家 chip_balance=500（青銅廳 entry=1000）
     * Then: onJoin 拋出 'insufficient_chips' 錯誤
     */
    it('TC-ROOM-011: onJoin 籌碼不足拒絕', async () => {
      // TODO
    });

    /**
     * TC-ROOM-012: 2 人加入後自動開始遊戲
     * Given: 玩家 A、B 加入（均符合籌碼門檻）
     * Then: state.phase === 'banker-bet'（dealing 快速完成）
     *       state.banker_seat_index !== -1
     */
    it('TC-ROOM-012: 2 人加入後自動進入遊戲', async () => {
      // TODO
    });

    /**
     * TC-ROOM-013: 莊家下注驗證（valid）
     * Given: phase==='banker-bet', banker player sends { amount: 100 }
     * Then: state.banker_bet_amount === 100
     *       state.phase === 'player-bet'
     */
    it('TC-ROOM-013: 莊家下注（valid）', async () => {
      // TODO
    });

    /**
     * TC-ROOM-014: 莊家下注超出範圍（invalid）
     * Given: phase==='banker-bet', banker sends { amount: 1000 }（max_bet=500）
     * Then: Server 推送 error { code: 'bet_out_of_range' }
     */
    it('TC-ROOM-014: 莊家下注超出範圍', async () => {
      // TODO
    });

    /**
     * TC-ROOM-015: 閒家跟注（Call）
     * Given: phase==='player-bet', 輪次到閒家
     * Then: player.bet_amount === banker_bet_amount
     *       player.has_acted === true
     */
    it('TC-ROOM-015: 閒家跟注（Call）', async () => {
      // TODO
    });

    /**
     * TC-ROOM-016: 閒家棄牌（Fold）
     * Given: phase==='player-bet', 輪次到閒家
     * Then: player.is_folded === true
     *       player.bet_amount === 0
     */
    it('TC-ROOM-016: 閒家棄牌（Fold）', async () => {
      // TODO
    });

    /**
     * TC-ROOM-017: 結算後進入下一局
     * Given: showdown 完成，籌碼更新
     * Then: 5s 後 state.phase === 'banker-bet'（下一局）
     *       莊家已輪換
     */
    it('TC-ROOM-017: 結算後 5s 進入下一局', async () => {
      // TODO
    });

    /**
     * TC-ROOM-018: 30s 無人加入自動解散
     * Given: Room 建立後無玩家加入
     * When: 等待 60s
     * Then: Room onDispose 被呼叫
     */
    it('TC-ROOM-018: 60s 無人加入自動解散', async () => {
      // TODO
    });

    /**
     * TC-ROOM-019: 斷線重連（30s 內重連成功）
     * Given: 玩家斷線（consented=false）
     * When: 25s 內重連
     * Then: playerState.is_connected === true
     *       重新推送 myHand
     */
    it('TC-ROOM-019: 斷線 25s 內重連成功', async () => {
      // TODO
    });

    /**
     * TC-ROOM-020: 防沉迷（成人 2h 提醒）
     * Given: 玩家連續遊玩 ≥ 2h
     * Then: Server 推送 anti_addiction_warning { type: 'adult', session_minutes: 120 }
     */
    it('TC-ROOM-020: 成人 2h 防沉迷提醒', async () => {
      // TODO
    });
  });
});
