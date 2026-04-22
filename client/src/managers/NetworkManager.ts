/**
 * NetworkManager.ts
 * Colyseus Client WS 通訊管理器。
 *
 * 包裝 Colyseus Room 物件，對上層元件提供語義化 send API。
 * 純 TypeScript；不依賴 Cocos 引擎 API。
 */

// ── Colyseus 介面（最小化定義，避免在非 Cocos 環境引入完整 SDK）─────────────

export interface IColyseusRoom {
  send(type: string, message?: unknown): void;
  leave(consented?: boolean): void;
  readonly id: string;
  readonly sessionId: string;
}

export interface IColyseusClient {
  joinById(roomId: string, options?: Record<string, unknown>): Promise<IColyseusRoom>;
  reconnect(reconnectionToken: string): Promise<IColyseusRoom>;
}

// ── WS 訊息型別（對齊 EDD §3.7）────────────────────────────────────────────

export type WsMessageType =
  | 'banker_bet'
  | 'call'
  | 'fold'
  | 'see_cards'
  | 'confirm_anti_addiction'
  | 'send_chat';

export interface BankerBetPayload {
  amount: number;
}

export interface ConfirmAntiAddictionPayload {
  type: 'adult';
}

export interface ChatPayload {
  text: string;
}

// ── NetworkManager ──────────────────────────────────────────────────────────

/**
 * NetworkManager
 *
 * 職責：
 * - 管理 Colyseus Room 連線 / 重連 / 斷線
 * - 封裝所有 Client → Server WS 訊息，對元件層隱藏 Colyseus 細節
 *
 * 使用方式：
 * ```ts
 * const nm = new NetworkManager(colyseusClient);
 * await nm.connect('sam_gong_room');
 * nm.sendBankerBet(1000);
 * ```
 */
export class NetworkManager {
  private _room: IColyseusRoom | null = null;
  private _client: IColyseusClient;

  constructor(client: IColyseusClient) {
    this._client = client;
  }

  // ── 連線管理 ────────────────────────────────────────────────────────────

  /**
   * 加入 / 建立 Colyseus Room。
   * @param roomId    - Colyseus Room 名稱或 ID
   * @param sessionId - 若提供則嘗試重連（保留 session）
   */
  public async connect(roomId: string, sessionId?: string): Promise<void> {
    const options: Record<string, unknown> = sessionId ? { sessionId } : {};
    this._room = await this._client.joinById(roomId, options);
  }

  /**
   * 斷線重連（使用 reconnectionToken）。
   * @param roomId          - 原始 Room ID（用於 log）
   * @param reconnectionToken - Colyseus reconnection token
   */
  public async reconnect(roomId: string, reconnectionToken: string): Promise<void> {
    void roomId; // 僅記錄用途，實際重連由 token 決定
    this._room = await this._client.reconnect(reconnectionToken);
  }

  /**
   * 斷開連線。
   * @param code - WebSocket 關閉碼（選填，預設 consented=true）
   */
  public disconnect(code?: number): void {
    if (!this._room) return;
    // code 存在時視為非正常斷開（consented=false）
    const consented = code === undefined;
    this._room.leave(consented);
    this._room = null;
  }

  /** 是否已連線 */
  public get isConnected(): boolean {
    return this._room !== null;
  }

  /** 當前 Room ID */
  public get roomId(): string | null {
    return this._room?.id ?? null;
  }

  /** 當前 Session ID */
  public get sessionId(): string | null {
    return this._room?.sessionId ?? null;
  }

  // ── WS 訊息 API（EDD §3.7）─────────────────────────────────────────────

  /**
   * 莊家下注。
   * Client → Server: `{ type: 'banker_bet', message: { amount } }`
   */
  public sendBankerBet(amount: number): void {
    this._send<BankerBetPayload>('banker_bet', { amount });
  }

  /**
   * 玩家跟注。
   * Client → Server: `{ type: 'call' }`
   */
  public sendCall(): void {
    this._send('call');
  }

  /**
   * 玩家棄牌。
   * Client → Server: `{ type: 'fold' }`
   */
  public sendFold(): void {
    this._send('fold');
  }

  /**
   * 玩家看牌（明牌）。
   * Client → Server: `{ type: 'see_cards' }`
   */
  public sendSeeCards(): void {
    this._send('see_cards');
  }

  /**
   * 確認防沉迷成人提醒。
   * Client → Server: `{ type: 'confirm_anti_addiction', message: { type: 'adult' } }`
   * 注意：payload 固定為 `{ type: 'adult' }`，不含 player_id。
   */
  public sendConfirmAntiAddiction(): void {
    this._send<ConfirmAntiAddictionPayload>('confirm_anti_addiction', { type: 'adult' });
  }

  /**
   * 發送聊天訊息。
   * Client → Server: `{ type: 'send_chat', message: { text } }`
   */
  public sendChat(text: string): void {
    this._send<ChatPayload>('send_chat', { text });
  }

  // ── 私有 ────────────────────────────────────────────────────────────────

  private _send<T = undefined>(type: WsMessageType, payload?: T): void {
    if (!this._room) {
      console.warn(`[NetworkManager] send('${type}') called while not connected.`);
      return;
    }
    this._room.send(type, payload);
  }
}
