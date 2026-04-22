/**
 * BankerRotation 單元測試
 *
 * 對應 BDD Feature: tests/features/server/banker_rotation.feature
 * 至少 8 個測試案例，覆蓋：
 * - 首局莊家選定（最多籌碼、同籌碼處理）
 * - 正常輪莊（順時針、環繞邊界）
 * - 跳過破產莊家
 * - 所有候選均不合格
 * - 中途離場處理
 * - Fold 玩家正常參與輪莊
 */

import { BankerRotation, PlayerState } from '../../src/game/BankerRotation';

// ──── 輔助函式 ────

const MIN_BET = 100; // 青銅廳

function p(
  seat: number,
  chips: number,
  playerId?: string,
  isConnected: boolean = true,
): PlayerState {
  return {
    player_id: playerId ?? `p${seat}`,
    seat_index: seat,
    chip_balance: chips,
    is_connected: isConnected,
  };
}

// ──── 測試群組 ────

describe('BankerRotation', () => {
  let rotation: BankerRotation;

  beforeEach(() => {
    rotation = new BankerRotation();
  });

  // ────────────────────────────────────────────
  // determineFirstBanker
  // ────────────────────────────────────────────

  describe('determineFirstBanker — 首局莊家選定', () => {
    it('TC-BR-001: 持最多籌碼者擔任首局莊家', () => {
      const players = [p(0, 5000), p(1, 3000), p(2, 2000)];
      expect(rotation.determineFirstBanker(players)).toBe(0);
    });

    it('TC-BR-002: 同籌碼時按進入順序（最小 seat_index 優先）', () => {
      const players = [p(0, 5000), p(1, 5000)];
      expect(rotation.determineFirstBanker(players)).toBe(0);
    });

    it('TC-BR-003: 多人同籌碼時最小 seat_index 優先（非 seat=0 的最大籌碼群）', () => {
      const players = [p(0, 3000), p(1, 5000), p(2, 5000), p(3, 5000)];
      // 最大籌碼 5000 中最小 seat_index = 1
      expect(rotation.determineFirstBanker(players)).toBe(1);
    });

    it('determineFirstBanker: 空陣列應拋出錯誤', () => {
      expect(() => rotation.determineFirstBanker([])).toThrow();
    });
  });

  // ────────────────────────────────────────────
  // rotate
  // ────────────────────────────────────────────

  describe('rotate — 正常輪莊', () => {
    it('TC-BR-004: seat 0 → seat 1（4 人桌順時針）', () => {
      const players = [p(0, 5000), p(1, 3000), p(2, 2000), p(3, 1000)];
      expect(rotation.rotate(0, players)).toBe(1);
    });

    it('TC-BR-005: 環繞邊界（seat 3 → seat 0，4 人桌）', () => {
      const players = [p(0, 5000), p(1, 3000), p(2, 2000), p(3, 1000)];
      expect(rotation.rotate(3, players)).toBe(0);
    });

    it('TC-BR-006: 2 人桌循環（seat 0 → seat 1 → seat 0）', () => {
      const players = [p(0, 5000), p(1, 3000)];
      expect(rotation.rotate(0, players)).toBe(1);
      expect(rotation.rotate(1, players)).toBe(0);
    });

    it('TC-BR-007: 6 人桌環繞（seat 5 → seat 0）', () => {
      const players = [p(0,5000), p(1,4000), p(2,3000), p(3,2000), p(4,1500), p(5,1000)];
      expect(rotation.rotate(5, players)).toBe(0);
    });

    it('TC-BR-008: 輪莊序列完整循環 3 人桌（0→1→2→0）', () => {
      const players = [p(0, 5000), p(1, 3000), p(2, 2000)];
      const seq = [0];
      for (let i = 0; i < 3; i++) {
        seq.push(rotation.rotate(seq[seq.length - 1], players));
      }
      expect(seq).toEqual([0, 1, 2, 0]);
    });

    it('rotate: 空陣列應拋出錯誤', () => {
      expect(() => rotation.rotate(0, [])).toThrow();
    });
  });

  // ────────────────────────────────────────────
  // skipInsolventBanker
  // ────────────────────────────────────────────

  describe('skipInsolventBanker — 跳過籌碼不足莊家', () => {
    it('TC-BR-009: chip=0 的玩家應被跳過', () => {
      const players = [p(0, 5000), p(1, 0), p(2, 3000)];
      // rotate 後輪至 seat=1，skipInsolventBanker 從 seat=1 開始
      const next = rotation.skipInsolventBanker(1, players, MIN_BET);
      expect(next).toBe(2);
    });

    it('TC-BR-010: chip < min_bet（50 < 100）應被跳過', () => {
      const players = [p(0, 5000), p(1, 50), p(2, 3000)];
      const next = rotation.skipInsolventBanker(1, players, MIN_BET);
      expect(next).toBe(2);
    });

    it('TC-BR-011: 連續跳過多位破產莊家', () => {
      const players = [p(0, 5000), p(1, 0), p(2, 50), p(3, 3000), p(4, 2000)];
      // 從 seat=1 開始，跳過 seat=1(0) 和 seat=2(50)，返回 seat=3
      const next = rotation.skipInsolventBanker(1, players, MIN_BET);
      expect(next).toBe(3);
    });

    it('TC-BR-012: 環繞邊界跳過（seat=2 輪至 seat=0 但 chip=0，返回 seat=1）', () => {
      const players = [p(0, 0), p(1, 5000), p(2, 3000)];
      // rotate(2, players) = 0, skipInsolventBanker(0, ...) → 跳過 0，返回 1
      const next = rotation.skipInsolventBanker(0, players, MIN_BET);
      expect(next).toBe(1);
    });

    it('TC-BR-013: 所有玩家籌碼不足 → 返回 -1', () => {
      const players = [p(0, 50), p(1, 30), p(2, 0)];
      const next = rotation.skipInsolventBanker(0, players, MIN_BET);
      expect(next).toBe(-1);
    });
  });

  // ────────────────────────────────────────────
  // rotateWithSkip（完整輪莊流程）
  // ────────────────────────────────────────────

  describe('rotateWithSkip — 完整輪莊（rotate + skip）', () => {
    it('TC-BR-014: 正常輪莊 seat=0 → seat=1（無破產玩家）', () => {
      const players = [p(0, 5000), p(1, 3000), p(2, 2000)];
      expect(rotation.rotateWithSkip(0, players, MIN_BET)).toBe(1);
    });

    it('TC-BR-015: 輪莊後跳過破產莊家（seat=0→seat=1(破產)→seat=2）', () => {
      const players = [p(0, 5000), p(1, 0), p(2, 3000)];
      expect(rotation.rotateWithSkip(0, players, MIN_BET)).toBe(2);
    });

    it('TC-BR-016: 所有候選均不合格 → -1', () => {
      const players = [p(0, 5000), p(1, 0), p(2, 0)];
      // rotate(0) = 1, skipInsolventBanker(1) → 跳過 1, 跳過 2, 跳過 0(已檢查)?
      // 注意：skipInsolventBanker 最多檢查 seats.length 個，不含起始已合格的 seat
      // 在此案例：只有 seat=0 合格，但 seat=0 是前任莊家，rotate 後先從 seat=1 開始
      // skipInsolventBanker(1, [0,1,2], 100) →
      //   seat=1(0<100 skip), seat=2(0<100 skip), seat=0(5000>=100 OK)
      // 所以返回 0，不是 -1
      // 更正測試：必須所有人都不合格
      const allBroken = [p(0, 50), p(1, 30), p(2, 0)];
      expect(rotation.rotateWithSkip(0, allBroken, MIN_BET)).toBe(-1);
    });
  });

  // ────────────────────────────────────────────
  // 中途離場與 Fold 玩家
  // ────────────────────────────────────────────

  describe('中途離場與 Fold 玩家輪莊', () => {
    it('TC-BR-017: 中途離場玩家從 players 列表移除，輪莊跳過該座位', () => {
      // seat=2 已離場，players 只有 [0,1,3]
      const players = [p(0, 5000), p(1, 3000), p(3, 2000)];
      // 當前莊家 seat=1，rotate → seat=3（跳過不存在的 seat=2）
      const next = rotation.rotate(1, players);
      expect(next).toBe(3);
    });

    it('TC-BR-018: Fold 玩家正常參與輪莊（不跳過）', () => {
      // Fold 玩家仍在 players 列表中（is_folded 在 BankerRotation 層不做過濾）
      const players = [p(0, 5000), p(1, 3000), p(2, 2000), p(3, 1500)];
      // 即使 seat=1 本局 fold，輪莊仍正常到 seat=1
      expect(rotation.rotate(0, players)).toBe(1);
    });

    it('TC-BR-019: 4 人桌輪莊完整循環驗證（0→1→2→3→0）', () => {
      const players = [p(0, 5000), p(1, 3000), p(2, 2000), p(3, 1000)];
      const sequence = [0];
      for (let i = 0; i < 4; i++) {
        sequence.push(rotation.rotate(sequence[sequence.length - 1], players));
      }
      expect(sequence).toEqual([0, 1, 2, 3, 0]);
    });
  });

  // ────────────────────────────────────────────
  // 邊界條件覆蓋
  // ────────────────────────────────────────────

  describe('邊界條件', () => {
    it('TC-BR-020: rotate — 當前莊家不在玩家列表中，從最小 seat 開始', () => {
      // seat=5 已離場，但 currentBankerSeat=5
      const players = [p(1, 3000), p(2, 2000), p(3, 1000)];
      // 因 seat=5 不在列表中，回傳最小 seat=1
      expect(rotation.rotate(5, players)).toBe(1);
    });

    it('TC-BR-021: skipInsolventBanker — startSeat 不在列表中，從最小 seat 開始', () => {
      // startSeat=5 不在列表 [0,1,2] 中
      const players = [p(0, 200), p(1, 50), p(2, 300)];
      // 從最小 seat=0 開始，seat=0(200>=100 OK) → 返回 0
      expect(rotation.skipInsolventBanker(5, players, MIN_BET)).toBe(0);
    });

    it('TC-BR-022: skipInsolventBanker — 空陣列返回 -1', () => {
      expect(rotation.skipInsolventBanker(0, [], MIN_BET)).toBe(-1);
    });

    it('TC-BR-023: rotateWithSkip — 前任莊家合格仍可再次擔任（3 人桌只有 seat=0 合格）', () => {
      // seat=1(0<100), seat=2(0<100) 不合格
      // rotate(0) = seat=1, skipInsolventBanker(1) → 跳過1,跳過2,回到seat=0 → 0
      const players = [p(0, 5000), p(1, 0), p(2, 0)];
      expect(rotation.rotateWithSkip(0, players, MIN_BET)).toBe(0);
    });
  });
});
