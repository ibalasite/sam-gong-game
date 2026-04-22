/**
 * AntiAddictionUIManager.test.ts
 * 防沉迷 UI 管理器測試（TDD）
 *
 * 覆蓋：
 * - 成人提醒觸發/隱藏
 * - 確認後 WS 發送 { type: 'adult' }
 * - 2h 計時器重置
 * - 未成年倒數計時
 * - 倒數歸零強制登出回呼
 * - destroy() 清理計時器
 */

import { UIManager } from '../../client/src/managers/UIManager';
import { NetworkManager, IColyseusClient, IColyseusRoom } from '../../client/src/managers/NetworkManager';
import {
  AntiAddictionUIManager,
  ADULT_WARNING_INTERVAL_MS,
  ITimer,
} from '../../client/src/managers/AntiAddictionUIManager';

// ── 假計時器（Fake Timer）────────────────────────────────────────────────────

interface FakeTimerEntry {
  id: number;
  fn: () => void;
  delay: number;
  remaining: number;
  repeat: boolean;
}

class FakeTimer implements ITimer {
  private _idCounter = 0;
  private _entries: Map<number, FakeTimerEntry> = new Map();

  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = ++this._idCounter;
    this._entries.set(id, { id, fn, delay: ms, remaining: ms, repeat: false });
    return id as unknown as ReturnType<typeof setTimeout>;
  }

  clearTimeout(id: ReturnType<typeof setTimeout>): void {
    this._entries.delete(id as unknown as number);
  }

  setInterval(fn: () => void, ms: number): ReturnType<typeof setInterval> {
    const id = ++this._idCounter;
    this._entries.set(id, { id, fn, delay: ms, remaining: ms, repeat: true });
    return id as unknown as ReturnType<typeof setInterval>;
  }

  clearInterval(id: ReturnType<typeof setInterval>): void {
    this._entries.delete(id as unknown as number);
  }

  /**
   * 推進虛擬時間 ms 毫秒，逐步觸發所有到期計時器。
   * 支援 interval 在同一次 advance 內多次觸發。
   */
  advance(ms: number): void {
    let remaining = ms;

    while (remaining > 0) {
      // 找到最早到期的計時器
      let minRemaining = remaining;
      this._entries.forEach((entry) => {
        if (entry.remaining < minRemaining) {
          minRemaining = entry.remaining;
        }
      });

      // 推進到該計時器到期
      const step = Math.min(minRemaining, remaining);
      remaining -= step;

      const toFire: FakeTimerEntry[] = [];
      const toRemove: number[] = [];

      this._entries.forEach((entry) => {
        entry.remaining -= step;
        if (entry.remaining <= 0) {
          toFire.push(entry);
          if (!entry.repeat) {
            toRemove.push(entry.id);
          } else {
            entry.remaining = entry.delay;
          }
        }
      });

      toRemove.forEach((id) => this._entries.delete(id));
      // 觸發回呼（可能導致新的計時器被加入或現有計時器被清除）
      toFire.forEach((entry) => {
        // 確認計時器仍然存在（可能已被清除）
        if (toRemove.includes(entry.id) || this._entries.has(entry.id) || !entry.repeat) {
          entry.fn();
        }
      });

      // 若沒有任何計時器可以前進，跳出避免無限迴圈
      if (this._entries.size === 0) break;
    }
  }

  /** 目前活躍計時器數量 */
  get activeCount(): number {
    return this._entries.size;
  }
}

// ── Mock Colyseus Room ────────────────────────────────────────────────────────

function makeMockRoom(): { room: IColyseusRoom; sentMessages: Array<{ type: string; payload: unknown }> } {
  const sentMessages: Array<{ type: string; payload: unknown }> = [];
  const room: IColyseusRoom = {
    id: 'room-001',
    sessionId: 'session-abc',
    send(type: string, payload?: unknown) {
      sentMessages.push({ type, payload });
    },
    leave(_consented?: boolean) {},
  };
  return { room, sentMessages };
}

function makeMockClient(room: IColyseusRoom): IColyseusClient {
  return {
    joinById: jest.fn().mockResolvedValue(room),
    reconnect: jest.fn().mockResolvedValue(room),
  };
}

// ── 測試 ──────────────────────────────────────────────────────────────────────

describe('AntiAddictionUIManager', () => {
  let uiManager: UIManager;
  let networkManager: NetworkManager;
  let fakeTimer: FakeTimer;
  let manager: AntiAddictionUIManager;
  let sentMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    uiManager = new UIManager();

    const { room, sentMessages: msgs } = makeMockRoom();
    sentMessages = msgs;

    const mockClient = makeMockClient(room);
    networkManager = new NetworkManager(mockClient);
    await networkManager.connect('room-001');

    fakeTimer = new FakeTimer();
    manager = new AntiAddictionUIManager(uiManager, networkManager, fakeTimer);
  });

  afterEach(() => {
    manager.destroy();
  });

  // ── 成人提醒 ──────────────────────────────────────────────────────────────

  describe('handleAdultWarning()', () => {
    it('TC-AA-01: 觸發後 UI 顯示成人提醒', () => {
      manager.handleAdultWarning();
      const state = uiManager.getState();
      expect(state.antiAddictionVisible).toBe(true);
      expect(state.antiAddictionType).toBe('adult');
    });

    it('TC-AA-02: 觸發後 adultWarningCount 遞增', () => {
      manager.handleAdultWarning();
      manager.handleAdultWarning();
      expect(manager.getState().adultWarningCount).toBe(2);
    });

    it('TC-AA-03: 重複觸發不會疊加計時器（僅保留最後一個）', () => {
      manager.handleAdultWarning();
      manager.handleAdultWarning();
      manager.handleAdultWarning();
      // 只有一個計時器（目前無計時器，因為 handleAdultWarning 本身不設定計時器）
      expect(fakeTimer.activeCount).toBe(0);
    });
  });

  // ── 確認成人提醒 ──────────────────────────────────────────────────────────

  describe('confirmAdultWarning()', () => {
    it('TC-AA-04: 確認後 UI 隱藏警告', () => {
      manager.handleAdultWarning();
      manager.confirmAdultWarning();
      const state = uiManager.getState();
      expect(state.antiAddictionVisible).toBe(false);
    });

    it('TC-AA-05: 確認後發送 confirm_anti_addiction，payload={ type: "adult" }', () => {
      manager.handleAdultWarning();
      manager.confirmAdultWarning();
      const msg = sentMessages.find((m) => m.type === 'confirm_anti_addiction');
      expect(msg).toBeDefined();
      expect(msg?.payload).toEqual({ type: 'adult' });
    });

    it('TC-AA-06: 確認後啟動 2h 計時器，計時到期再次觸發成人提醒', () => {
      manager.handleAdultWarning();
      manager.confirmAdultWarning();

      // 此時應有 1 個計時器（2h）
      expect(fakeTimer.activeCount).toBe(1);

      // 推進 2h
      fakeTimer.advance(ADULT_WARNING_INTERVAL_MS);

      // 重新觸發成人提醒
      expect(uiManager.getState().antiAddictionVisible).toBe(true);
      expect(manager.getState().adultWarningCount).toBe(2);
    });

    it('TC-AA-07: 多次確認，計時器不重疊（舊計時器被清除）', () => {
      manager.handleAdultWarning();
      manager.confirmAdultWarning(); // 啟動第 1 個 2h 計時
      manager.handleAdultWarning();
      manager.confirmAdultWarning(); // 清除第 1 個，啟動第 2 個

      expect(fakeTimer.activeCount).toBe(1); // 只有一個活躍計時器
    });
  });

  // ── 未成年強制停止 ────────────────────────────────────────────────────────

  describe('handleUnderageStop()', () => {
    it('TC-AA-08: 觸發後 UI 顯示未成年警告', () => {
      manager.handleUnderageStop(30);
      const state = uiManager.getState();
      expect(state.antiAddictionVisible).toBe(true);
      expect(state.antiAddictionType).toBe('underage');
    });

    it('TC-AA-09: 每秒倒數，剩餘秒數正確遞減', () => {
      manager.handleUnderageStop(5);
      expect(manager.getState().underageRemainingSeconds).toBe(5);

      fakeTimer.advance(1000);
      expect(manager.getState().underageRemainingSeconds).toBe(4);

      fakeTimer.advance(2000);
      expect(manager.getState().underageRemainingSeconds).toBe(2);
    });

    it('TC-AA-10: 倒數歸零，觸發 onForceLogout 回呼', () => {
      const onForceLogout = jest.fn();
      manager.handleUnderageStop(3, onForceLogout);

      fakeTimer.advance(3000);
      expect(onForceLogout).toHaveBeenCalledTimes(1);
    });

    it('TC-AA-11: 倒數歸零後隱藏警告 UI', () => {
      manager.handleUnderageStop(2);
      fakeTimer.advance(2000);
      expect(uiManager.getState().antiAddictionVisible).toBe(false);
    });

    it('TC-AA-12: remainingSeconds=0 立即觸發 onForceLogout', () => {
      const onForceLogout = jest.fn();
      manager.handleUnderageStop(0, onForceLogout);
      expect(onForceLogout).toHaveBeenCalledTimes(1);
    });

    it('TC-AA-13: 重複呼叫 handleUnderageStop，舊倒數被清除', () => {
      const firstLogout = jest.fn();
      const secondLogout = jest.fn();

      manager.handleUnderageStop(10, firstLogout);
      manager.handleUnderageStop(3, secondLogout); // 取消第一個倒數

      fakeTimer.advance(3000);

      expect(secondLogout).toHaveBeenCalledTimes(1);
      expect(firstLogout).not.toHaveBeenCalled();
    });
  });

  // ── destroy() 清理 ────────────────────────────────────────────────────────

  describe('destroy()', () => {
    it('TC-AA-14: destroy() 後計時器全部清除，不再觸發回呼', () => {
      const onForceLogout = jest.fn();
      manager.handleAdultWarning();
      manager.confirmAdultWarning(); // 啟動 2h 計時
      manager.handleUnderageStop(10, onForceLogout);

      manager.destroy();
      expect(fakeTimer.activeCount).toBe(0);

      // 推進時間，確認回呼不觸發
      fakeTimer.advance(ADULT_WARNING_INTERVAL_MS);
      expect(onForceLogout).not.toHaveBeenCalled();
    });
  });
});
