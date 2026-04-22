/**
 * UIManager.ts
 * UI 管理器 — 純 TypeScript，不依賴 Cocos 引擎 API。
 * 負責根據 Server Phase 狀態驅動 UI 顯示邏輯。
 */

export type GamePhase =
  | 'WAITING'
  | 'BETTING'
  | 'DEALING'
  | 'REVEAL'
  | 'SETTLEMENT'
  | 'ENDED';

export type AntiAddictionWarningType = 'adult' | 'underage';

export interface UIState {
  phase: GamePhase | string;
  chipBalance: number;
  minBet: number;
  maxBet: number;
  betButtonsEnabled: boolean;
  antiAddictionVisible: boolean;
  antiAddictionType: AntiAddictionWarningType | null;
}

/**
 * UIManager
 *
 * Client 端 UI 狀態管理器，職責：
 * - 接收 Server Phase 變更 → 更新 UI 顯示狀態
 * - 管理籌碼餘額顯示
 * - 控制下注按鈕可用性
 * - 防沉迷警告顯示/隱藏
 *
 * 不持有任何 Cocos cc.Node 參考；Cocos 元件透過 Observer 訂閱本類的狀態。
 */
export class UIManager {
  private _state: UIState = {
    phase: 'WAITING',
    chipBalance: 0,
    minBet: 0,
    maxBet: 0,
    betButtonsEnabled: false,
    antiAddictionVisible: false,
    antiAddictionType: null,
  };

  private _listeners: Array<(state: UIState) => void> = [];

  // ── 狀態訂閱 ─────────────────────────────────────────────────────────────

  /** 訂閱 UIState 變更（Cocos 元件呼叫）*/
  public subscribe(listener: (state: UIState) => void): void {
    this._listeners.push(listener);
  }

  /** 取消訂閱 */
  public unsubscribe(listener: (state: UIState) => void): void {
    this._listeners = this._listeners.filter((l) => l !== listener);
  }

  /** 取得當前 UI 狀態（唯讀快照）*/
  public getState(): Readonly<UIState> {
    return { ...this._state };
  }

  // ── 核心 API ──────────────────────────────────────────────────────────────

  /**
   * 接收 Server Phase 並更新 UI 狀態。
   * @param phase - Server 廣播的 GamePhase 字串
   */
  public updatePhase(phase: string): void {
    this._state.phase = phase as GamePhase;

    // 只有 BETTING 階段才啟用下注按鈕
    this._state.betButtonsEnabled = phase === 'BETTING';

    this._notify();
  }

  /**
   * 更新籌碼餘額顯示。
   * @param balance - 從 Colyseus State 同步的 player chips 值
   */
  public updateChipBalance(balance: number): void {
    this._state.chipBalance = Math.max(0, balance);
    this._notify();
  }

  /**
   * 依廳別設定下注按鈕的 min/max，並根據 currentBalance 決定是否可用。
   * @param minBet        - 廳別最低注
   * @param maxBet        - 廳別最高注
   * @param currentBalance - 玩家當前籌碼
   */
  public updateBetButtons(
    minBet: number,
    maxBet: number,
    currentBalance: number,
  ): void {
    this._state.minBet = minBet;
    this._state.maxBet = maxBet;

    // 若餘額不足最低注，按鈕應禁用（但不覆蓋 Phase 帶來的禁用）
    if (this._state.betButtonsEnabled) {
      this._state.betButtonsEnabled = currentBalance >= minBet;
    }

    this._notify();
  }

  /**
   * 顯示防沉迷警告。
   * @param type - 'adult' 成人提醒 | 'underage' 未成年強制停止
   */
  public showAntiAddictionWarning(type: AntiAddictionWarningType): void {
    this._state.antiAddictionVisible = true;
    this._state.antiAddictionType = type;
    this._notify();
  }

  /** 隱藏防沉迷警告 */
  public hideAntiAddictionWarning(): void {
    this._state.antiAddictionVisible = false;
    this._state.antiAddictionType = null;
    this._notify();
  }

  // ── 私有 ─────────────────────────────────────────────────────────────────

  private _notify(): void {
    const snapshot = this.getState();
    this._listeners.forEach((l) => l(snapshot));
  }
}
