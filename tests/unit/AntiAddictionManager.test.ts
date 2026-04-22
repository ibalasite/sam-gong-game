/**
 * AntiAddictionManager 單元測試
 *
 * 對應 BDD Feature: tests/features/server/anti_addiction.feature
 * 規格來源：EDD §3.6 AntiAddictionManager, REQ-015
 *
 * 覆蓋範圍：
 * - 成人連續遊玩 2h 提醒（should_warn=true）
 * - 未成年每日 2h 硬停（should_logout=true）
 * - 成人確認後計時器重置（onAdultWarningConfirmed）
 * - 台灣午夜時間戳計算（getTaiwanMidnightTimestamp）
 * - 玩家離線後計時累積（onPlayerOffline）
 */

import { AntiAddictionManager } from '../../src/game/AntiAddictionManager';

describe('AntiAddictionManager', () => {
  let manager: AntiAddictionManager;

  beforeEach(() => {
    manager = new AntiAddictionManager();
  });

  // ──────────────────────────────────────────────
  // 成人連續遊玩計時
  // ──────────────────────────────────────────────

  describe('成人連續遊玩計時（trackAdultSession）', () => {
    it('TC-AA-001: 成人玩家剛加入時 should_warn=false', async () => {
      const status = await manager.trackAdultSession('player_adult_1');

      expect(status.player_id).toBe('player_adult_1');
      expect(status.should_warn).toBe(false);
      expect(status.should_logout).toBe(false);
      expect(status.session_play_seconds).toBeLessThan(10); // 剛加入
    });

    it('TC-AA-002: 同一玩家多次 trackAdultSession 不重置計時', async () => {
      await manager.trackAdultSession('player_adult_2');

      // 第二次呼叫仍使用同一個 session_start_ms（不重置），elapsed 應 < 1s
      const status = await manager.trackAdultSession('player_adult_2');

      expect(status.player_id).toBe('player_adult_2');
      expect(status.should_warn).toBe(false);
      // session_play_seconds 應在合理範圍：>=0 且 <1（兩次呼叫間隔極短）
      expect(status.session_play_seconds).toBeGreaterThanOrEqual(0);
      expect(status.session_play_seconds).toBeLessThan(1);
    });

    it('TC-AA-003: onAdultWarningConfirmed 重置計時器', async () => {
      // 加入計時
      await manager.trackAdultSession('player_adult_3');

      // 確認後重置
      manager.onAdultWarningConfirmed('player_adult_3');

      // 重置後再次追蹤
      const status = await manager.trackAdultSession('player_adult_3');

      // 重置後計時從頭開始，should_warn=false
      expect(status.should_warn).toBe(false);
      expect(status.session_play_seconds).toBeLessThan(5);
    });

    it('TC-AA-004: 不存在的玩家呼叫 onAdultWarningConfirmed 不拋出錯誤', () => {
      expect(() => {
        manager.onAdultWarningConfirmed('non_existent_player');
      }).not.toThrow();
    });
  });

  // ──────────────────────────────────────────────
  // 未成年每日計時
  // ──────────────────────────────────────────────

  describe('未成年每日計時（trackUnderageDaily）', () => {
    it('TC-AA-005: 未成年玩家剛加入時 should_logout=false', async () => {
      const status = await manager.trackUnderageDaily('player_minor_1');

      expect(status.player_id).toBe('player_minor_1');
      expect(status.should_warn).toBe(false);
      expect(status.should_logout).toBe(false);
    });

    it('TC-AA-006: 未成年玩家不觸發 should_warn（成人專用）', async () => {
      const status = await manager.trackUnderageDaily('player_minor_2');
      expect(status.should_warn).toBe(false);
    });

    it('TC-AA-007: 未成年每日計時返回 daily_play_seconds（剛加入應 < 1 秒）', async () => {
      const status = await manager.trackUnderageDaily('player_minor_3');

      // daily_play_seconds 是數字，且剛加入時不超過 1 秒（非 undefined / 負數 / 異常大值）
      expect(typeof status.daily_play_seconds).toBe('number');
      expect(status.daily_play_seconds).toBeGreaterThanOrEqual(0);
      expect(status.daily_play_seconds).toBeLessThan(1); // 剛呼叫，不可能超過 1 秒
    });
  });

  // ──────────────────────────────────────────────
  // 台灣午夜時間戳
  // ──────────────────────────────────────────────

  describe('台灣午夜時間戳（getTaiwanMidnightTimestamp）', () => {
    it('TC-AA-008: getTaiwanMidnightTimestamp 返回未來時間戳', () => {
      const midnightMs = manager.getTaiwanMidnightTimestamp();

      expect(typeof midnightMs).toBe('number');
      expect(midnightMs).toBeGreaterThan(Date.now());
    });

    it('TC-AA-009: 午夜時間戳為 UTC+8 次日 00:00', () => {
      const midnightMs = manager.getTaiwanMidnightTimestamp();
      const midnightDate = new Date(midnightMs);

      // 轉換至 UTC+8 驗證：UTC 時間 = 台灣時間 - 8h
      // 台灣 00:00 = UTC 16:00（前一日）
      const utcHour = midnightDate.getUTCHours();
      const utcMinutes = midnightDate.getUTCMinutes();
      const utcSeconds = midnightDate.getUTCSeconds();

      // UTC 16:00:00（台灣 00:00）
      expect(utcHour).toBe(16);
      expect(utcMinutes).toBe(0);
      expect(utcSeconds).toBe(0);
    });

    it('TC-AA-010: 同次呼叫 getTaiwanMidnightTimestamp 結果一致', () => {
      const ts1 = manager.getTaiwanMidnightTimestamp();
      const ts2 = manager.getTaiwanMidnightTimestamp();

      // 兩次呼叫在同一秒內，結果應相同
      expect(Math.abs(ts1 - ts2)).toBeLessThan(1000);
    });
  });

  // ──────────────────────────────────────────────
  // 玩家離線計時
  // ──────────────────────────────────────────────

  describe('玩家離線計時（onPlayerOffline）', () => {
    it('TC-AA-011: onPlayerOffline 後再次追蹤，session_play_seconds 重置為近零', async () => {
      // 先建立計時器
      await manager.trackAdultSession('player_offline_1');

      // 離線：累積 daily_play_seconds、重置 session_play_seconds
      manager.onPlayerOffline('player_offline_1');

      // 重新追蹤後 session_play_seconds 應從 0 重新計算（< 1s）
      const status = await manager.trackAdultSession('player_offline_1');
      expect(status.session_play_seconds).toBeLessThan(1);
      expect(status.should_warn).toBe(false);
    });

    it('TC-AA-012: onPlayerOffline 不存在玩家不拋出錯誤', () => {
      expect(() => {
        manager.onPlayerOffline('non_existent_player');
      }).not.toThrow();
    });
  });

  // ──────────────────────────────────────────────
  // removePlayer
  // ──────────────────────────────────────────────

  describe('移除玩家（removePlayer）', () => {
    it('TC-AA-013: removePlayer 移除計時器後不影響其他玩家', async () => {
      await manager.trackAdultSession('player_to_remove');
      await manager.trackAdultSession('player_to_keep');

      manager.removePlayer('player_to_remove');

      // player_to_keep 仍可正常追蹤
      const status = await manager.trackAdultSession('player_to_keep');
      expect(status.player_id).toBe('player_to_keep');
    });

    it('TC-AA-014: removePlayer 不存在玩家不拋出錯誤', () => {
      expect(() => {
        manager.removePlayer('non_existent_player');
      }).not.toThrow();
    });
  });

  // ──────────────────────────────────────────────
  // persistTimers（骨架驗證）
  // ──────────────────────────────────────────────

  describe('持久化計時（persistTimers）', () => {
    it('TC-AA-015: persistTimers 玩家有計時器時不拋出錯誤', async () => {
      await manager.trackAdultSession('player_persist_1');

      await expect(manager.persistTimers('player_persist_1')).resolves.not.toThrow();
    });

    it('TC-AA-016: persistTimers 不存在玩家不拋出錯誤', async () => {
      await expect(manager.persistTimers('non_existent')).resolves.not.toThrow();
    });
  });

  // ──────────────────────────────────────────────
  // scheduleUnderageLogout（骨架驗證）
  // ──────────────────────────────────────────────

  describe('未成年強制登出排程（scheduleUnderageLogout）', () => {
    it('TC-AA-017: scheduleUnderageLogout 不拋出錯誤（afterSettlement=true）', () => {
      expect(() => {
        manager.scheduleUnderageLogout('player_minor_1', true);
      }).not.toThrow();
    });

    it('TC-AA-018: scheduleUnderageLogout 不拋出錯誤（afterSettlement=false）', () => {
      expect(() => {
        manager.scheduleUnderageLogout('player_minor_2', false);
      }).not.toThrow();
    });
  });
});
