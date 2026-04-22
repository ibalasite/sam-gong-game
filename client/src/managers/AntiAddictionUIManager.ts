/**
 * AntiAddictionUIManager.ts
 * 防沉迷 UI 業務邏輯管理器。
 *
 * 純 TypeScript，不依賴 Cocos 引擎 API，可直接單元測試。
 * 與 UIManager 和 NetworkManager 協作，但透過依賴注入解耦。
 */

import { AntiAddictionWarningType, UIManager } from './UIManager';
import { NetworkManager } from './NetworkManager';

// ── 常數 ────────────────────────────────────────────────────────────────────

/** 成人提醒冷卻間隔（毫秒）：2 小時 */
export const ADULT_WARNING_INTERVAL_MS = 2 * 60 * 60 * 1000;

/** 未成年倒數刷新間隔（毫秒）*/
export const UNDERAGE_TICK_INTERVAL_MS = 1000;

// ── 依賴介面（方便 Mock）────────────────────────────────────────────────────

export interface ITimer {
  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(id: ReturnType<typeof setTimeout>): void;
  setInterval(fn: () => void, ms: number): ReturnType<typeof setInterval>;
  clearInterval(id: ReturnType<typeof setInterval>): void;
}

export interface IAntiAddictionState {
  /** 成人提醒已觸發次數 */
  adultWarningCount: number;
  /** 是否顯示成人提醒中 */
  adultWarningVisible: boolean;
  /** 未成年強制停止剩餘秒數（0 表示未觸發）*/
  underageRemainingSeconds: number;
  /** 是否強制停止中 */
  underageStopped: boolean;
}

// ── AntiAddictionUIManager ───────────────────────────────────────────────────

/**
 * AntiAddictionUIManager
 *
 * 職責：
 * - 成人：每 2h 彈出提醒 → 玩家確認 → 重置計時 → 發送 `confirm_anti_addiction`
 * - 未成年：Server 推播剩餘秒數 → 倒數顯示 → 0 秒強制登出
 *
 * 注入依賴：
 * - UIManager  — 控制 UI 顯示
 * - NetworkManager — 發送 WS 訊息
 * - ITimer     — 可替換的計時器（測試時注入假計時器）
 */
export class AntiAddictionUIManager {
  private _uiManager: UIManager;
  private _networkManager: NetworkManager;
  private _timer: ITimer;

  private _state: IAntiAddictionState = {
    adultWarningCount: 0,
    adultWarningVisible: false,
    underageRemainingSeconds: 0,
    underageStopped: false,
  };

  private _adultTimerId: ReturnType<typeof setTimeout> | null = null;
  private _underageTickId: ReturnType<typeof setInterval> | null = null;

  constructor(
    uiManager: UIManager,
    networkManager: NetworkManager,
    timer: ITimer = AntiAddictionUIManager._defaultTimer(),
  ) {
    this._uiManager = uiManager;
    this._networkManager = networkManager;
    this._timer = timer;
  }

  // ── 公開 API ───────────────────────────────────────────────────────────

  /**
   * 取得當前防沉迷狀態快照（測試用）。
   */
  public getState(): Readonly<IAntiAddictionState> {
    return { ...this._state };
  }

  /**
   * 成人提醒：Server 通知觸發（或 2h 計時到期後由 Client 自行觸發）。
   * - 顯示警告 UI
   * - 等待玩家確認（呼叫 confirmAdultWarning）
   */
  public handleAdultWarning(): void {
    // 清除舊的計時器（避免重複）
    this._clearAdultTimer();

    this._state.adultWarningCount += 1;
    this._state.adultWarningVisible = true;

    this._uiManager.showAntiAddictionWarning('adult');
  }

  /**
   * 未成年強制停止：Server 推播觸發。
   * - 顯示倒數 UI
   * - 每秒更新剩餘秒數
   * - 倒數歸零後觸發強制登出回呼
   *
   * @param remainingSeconds - 剩餘遊戲時間（秒）
   * @param onForceLogout    - 倒數結束時的回呼（通常呼叫 NetworkManager.disconnect）
   */
  public handleUnderageStop(
    remainingSeconds: number,
    onForceLogout?: () => void,
  ): void {
    // 清除舊的倒數器
    this._clearUnderageTick();

    this._state.underageRemainingSeconds = Math.max(0, remainingSeconds);
    this._state.underageStopped = true;

    this._uiManager.showAntiAddictionWarning('underage');

    // 若已經是 0 秒，立即觸發
    if (this._state.underageRemainingSeconds === 0) {
      onForceLogout?.();
      return;
    }

    // 每秒倒數
    this._underageTickId = this._timer.setInterval(() => {
      this._state.underageRemainingSeconds = Math.max(
        0,
        this._state.underageRemainingSeconds - 1,
      );

      if (this._state.underageRemainingSeconds === 0) {
        this._clearUnderageTick();
        this._uiManager.hideAntiAddictionWarning();
        onForceLogout?.();
      }
    }, UNDERAGE_TICK_INTERVAL_MS);
  }

  /**
   * 玩家確認成人提醒。
   * - 隱藏警告 UI
   * - 發送 `confirm_anti_addiction` (`{ type: 'adult' }`) 至 Server
   * - 重置 2h 計時器
   */
  public confirmAdultWarning(): void {
    this._state.adultWarningVisible = false;

    this._uiManager.hideAntiAddictionWarning();
    this._networkManager.sendConfirmAntiAddiction();

    // 重置 2h 計時
    this._clearAdultTimer();
    this._adultTimerId = this._timer.setTimeout(() => {
      this.handleAdultWarning();
    }, ADULT_WARNING_INTERVAL_MS);
  }

  /**
   * 清除所有計時器（元件銷毀時呼叫）。
   */
  public destroy(): void {
    this._clearAdultTimer();
    this._clearUnderageTick();
  }

  // ── 私有 ──────────────────────────────────────────────────────────────

  private _clearAdultTimer(): void {
    if (this._adultTimerId !== null) {
      this._timer.clearTimeout(this._adultTimerId);
      this._adultTimerId = null;
    }
  }

  private _clearUnderageTick(): void {
    if (this._underageTickId !== null) {
      this._timer.clearInterval(this._underageTickId);
      this._underageTickId = null;
    }
  }

  private static _defaultTimer(): ITimer {
    return {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (id) => globalThis.clearTimeout(id),
      setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
      clearInterval: (id) => globalThis.clearInterval(id),
    };
  }
}
