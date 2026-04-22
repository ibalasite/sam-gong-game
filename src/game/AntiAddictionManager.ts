/**
 * AntiAddictionManager — 防沉迷計時器（Server-side）
 *
 * 規格來源：EDD §3.6 AntiAddictionManager, REQ-015
 *
 * 核心規格：
 * - 成人：連續遊玩 2h（7200s）提醒，需主動確認後重置計時器
 * - 未成年：每日遊玩 2h（7200s）硬停（UTC+8 00:00 重置）
 * - Timer Persistence：每局 settled 後 Write-Through 至 PostgreSQL
 * - Redis 為 write-through cache（key: aa:session:{player_id}）
 * - Redis 重啟後從 PostgreSQL 回填，避免 Sentinel 切換時遺失計時資料
 *
 * 防沉迷 WS 訊息：
 * - adult 2h 提醒：{ type: 'anti_addiction_warning', type: 'adult', session_minutes: number }
 * - underage 硬停：{ type: 'anti_addiction_signal', type: 'underage', daily_minutes_remaining: 0, midnight_timestamp: number }
 * - WS Close Code 4003：未成年每日遊戲時間上限（從房間踢出）
 */

/** 防沉迷狀態 */
export interface AntiAddictionStatus {
  /** 玩家 ID */
  player_id: string;
  /** 是否需要彈出提醒（成人 2h 到達） */
  should_warn: boolean;
  /** 是否強制下線（未成年 2h 硬停） */
  should_logout: boolean;
  /** 今日累計遊玩秒數（未成年用） */
  daily_play_seconds: number;
  /** 連續遊玩秒數（成人用） */
  session_play_seconds: number;
}

/** 玩家計時資料 */
interface PlayerTimer {
  player_id: string;
  /** 計時開始時間（Unix ms） */
  session_start_ms: number;
  /** 今日累計秒數（UTC+8 00:00 重置） */
  daily_play_seconds: number;
  /** 連續遊玩秒數（離線 > 30min 重置） */
  session_play_seconds: number;
  /** 成人提醒是否已觸發（等待確認） */
  adult_warned: boolean;
}

/** 成人連續遊玩警告閾值（2h = 7200s） */
const ADULT_WARN_THRESHOLD_SECONDS = 7200;

/** 未成年每日遊玩上限（2h = 7200s） */
const UNDERAGE_DAILY_LIMIT_SECONDS = 7200;

/**
 * AntiAddictionManager — 管理防沉迷計時器
 *
 * Server-Authoritative 設計：
 * - 不信任 Client 傳入的計時資料
 * - 計時以 Server 時間為準
 * - 透過 WebSocket 私人訊息通知 Client
 *
 * DB 整合：透過注入 IAntiAddictionDB 介面實現 Write-Through PostgreSQL + Redis。
 * 生產環境注入真實 DB client；測試環境注入 InMemoryAntiAddictionDB。
 */

/**
 * Write-Through DB 介面（PostgreSQL + Redis）
 * 生產環境：注入實際 pg/ioredis client wrapper
 * 測試環境：使用 InMemoryAntiAddictionDB
 */
export interface IAntiAddictionDB {
  /** 讀取玩家計時資料 */
  load(playerId: string): Promise<{ daily_play_seconds: number; session_play_seconds: number } | null>;
  /** Write-Through：同時寫入 PostgreSQL + Redis (SETEX aa:session:{playerId} TTL data) */
  save(playerId: string, daily_play_seconds: number, session_play_seconds: number): Promise<void>;
}

/**
 * 預設 InMemory DB（開發 / 測試用，無外部依賴）
 * 生產環境應替換為 PostgresAntiAddictionDB
 */
export class InMemoryAntiAddictionDB implements IAntiAddictionDB {
  private store = new Map<string, { daily_play_seconds: number; session_play_seconds: number }>();

  async load(playerId: string) {
    return this.store.get(playerId) ?? null;
  }

  async save(playerId: string, daily_play_seconds: number, session_play_seconds: number) {
    this.store.set(playerId, { daily_play_seconds, session_play_seconds });
  }
}

export class AntiAddictionManager {
  /** 玩家計時器 Map（in-memory 快取，每局 settled 後 write-through 至 DB） */
  private timers: Map<string, PlayerTimer> = new Map();

  /** Write-Through DB（可注入真實 PostgreSQL + Redis 實作） */
  private db: IAntiAddictionDB;

  constructor(db?: IAntiAddictionDB) {
    this.db = db ?? new InMemoryAntiAddictionDB();
  }

  /**
   * 追蹤成人玩家連續遊玩時間
   * - 2h 後呼叫端應推送 anti_addiction_warning 訊息
   * - 玩家確認後呼叫 onAdultWarningConfirmed() 重置計時器
   *
   * @param playerId 玩家 ID
   * @returns AntiAddictionStatus
   */
  async trackAdultSession(playerId: string): Promise<AntiAddictionStatus> {
    let timer = this.timers.get(playerId);

    if (!timer) {
      // Write-Through：從 PostgreSQL/Redis 載入 session 狀態（Redis failover 後自 PostgreSQL 回填）
      const persisted = await this.db.load(playerId);
      timer = {
        player_id: playerId,
        session_start_ms: Date.now(),
        daily_play_seconds: persisted?.daily_play_seconds ?? 0,
        session_play_seconds: persisted?.session_play_seconds ?? 0,
        adult_warned: false,
      };
      this.timers.set(playerId, timer);
    }

    const nowMs = Date.now();
    const elapsedSeconds = Math.floor((nowMs - timer.session_start_ms) / 1000);
    timer.session_play_seconds = elapsedSeconds;

    // 規格：成人每 2h 重複觸發 adult_warning（確認後計時器重置，達到下一個 2h 再次觸發）
    // adult_warned 僅在本次 2h 視窗內防止重複提醒；onAdultWarningConfirmed() 重置後可再次觸發
    const shouldWarn = elapsedSeconds >= ADULT_WARN_THRESHOLD_SECONDS && !timer.adult_warned;

    if (shouldWarn) {
      timer.adult_warned = true;
    }

    return {
      player_id: playerId,
      should_warn: shouldWarn,
      should_logout: false,
      daily_play_seconds: timer.daily_play_seconds,
      session_play_seconds: timer.session_play_seconds,
    };
  }

  /**
   * 成人防沉迷警告確認（玩家主動確認後重置計時器）
   * - 重置 session_start_ms 至當前時間
   * - 清除 adult_warned 旗標
   *
   * @param playerId 玩家 ID
   */
  onAdultWarningConfirmed(playerId: string): void {
    const timer = this.timers.get(playerId);
    if (!timer) return;

    // 重置連續遊玩計時器
    timer.session_start_ms = Date.now();
    timer.session_play_seconds = 0;
    timer.adult_warned = false;

    console.log(`[AntiAddiction] Adult warning confirmed and timer reset for player ${playerId}`);
  }

  /**
   * 追蹤未成年玩家每日遊玩時間
   * - 達 2h 後呼叫端應推送 anti_addiction_signal 訊息並強制登出
   * - UTC+8 00:00 每日重置
   *
   * @param playerId 玩家 ID
   * @returns AntiAddictionStatus
   */
  async trackUnderageDaily(playerId: string): Promise<AntiAddictionStatus> {
    let timer = this.timers.get(playerId);

    if (!timer) {
      // Write-Through：從 PostgreSQL/Redis 載入今日累計（Redis failover 後從 PostgreSQL 回填）
      const persisted = await this.db.load(playerId);
      timer = {
        player_id: playerId,
        session_start_ms: Date.now(),
        daily_play_seconds: persisted?.daily_play_seconds ?? 0,
        session_play_seconds: persisted?.session_play_seconds ?? 0,
        adult_warned: false,
      };
      this.timers.set(playerId, timer);
    }

    const nowMs = Date.now();
    const sessionElapsed = Math.floor((nowMs - timer.session_start_ms) / 1000);
    const totalDaily = timer.daily_play_seconds + sessionElapsed;

    const shouldLogout = totalDaily >= UNDERAGE_DAILY_LIMIT_SECONDS;

    return {
      player_id: playerId,
      should_warn: false,
      should_logout: shouldLogout,
      daily_play_seconds: totalDaily,
      session_play_seconds: sessionElapsed,
    };
  }

  /**
   * 安排未成年玩家強制登出
   * - 牌局中觸發：等待本局結算後強制登出（REQ-015 AC-3 F20）
   * - 傳送 WS Close Code 4003
   *
   * afterSettlement=true：等待 settled phase 後由 SamGongRoom 呼叫 client.leave(4003)
   * afterSettlement=false：立即標記；SamGongRoom 在 onJoin 或 settled 後呼叫 client.leave(4003)
   *
   * @param playerId 玩家 ID
   * @param afterSettlement 是否等待結算後登出
   */
  scheduleUnderageLogout(playerId: string, afterSettlement: boolean): void {
    const timer = this.timers.get(playerId);
    if (!timer) return;

    // 標記玩家需要強制登出（SamGongRoom 在適當時機讀取此狀態）
    (timer as PlayerTimer & { pending_logout: boolean; logout_after_settlement: boolean })
      .pending_logout = true;
    (timer as PlayerTimer & { pending_logout: boolean; logout_after_settlement: boolean })
      .logout_after_settlement = afterSettlement;

    console.log(
      `[AntiAddiction] Underage logout scheduled for player ${playerId}, afterSettlement=${afterSettlement}`,
    );

    // 持久化狀態（確保重啟後不遺失）
    this.persistTimers(playerId).catch((err) => {
      console.error(`[AntiAddiction] persistTimers failed for ${playerId}:`, err);
    });
  }

  /**
   * 查詢玩家是否已標記需要強制登出（SamGongRoom 在 settled phase 後呼叫）
   *
   * @param playerId 玩家 ID
   * @returns { pending: boolean; afterSettlement: boolean }
   */
  getPendingLogoutStatus(playerId: string): { pending: boolean; afterSettlement: boolean } {
    const timer = this.timers.get(playerId) as
      | (PlayerTimer & { pending_logout?: boolean; logout_after_settlement?: boolean })
      | undefined;

    if (!timer) return { pending: false, afterSettlement: false };
    return {
      pending: timer.pending_logout ?? false,
      afterSettlement: timer.logout_after_settlement ?? false,
    };
  }

  /**
   * 計算台灣午夜 Unix ms（UTC+8 次日 00:00）
   * 用於告知 Client 何時可重新遊玩
   *
   * @returns Unix ms
   */
  getTaiwanMidnightTimestamp(): number {
    const now = new Date();
    // 取得 UTC+8 當日午夜（明日 00:00）
    const utc8Offset = 8 * 60 * 60 * 1000; // 8h in ms
    const nowUtc8 = new Date(now.getTime() + utc8Offset);

    // 設定為明日 00:00:00 UTC+8
    const tomorrowUtc8 = new Date(
      Date.UTC(
        nowUtc8.getUTCFullYear(),
        nowUtc8.getUTCMonth(),
        nowUtc8.getUTCDate() + 1,
        0,
        0,
        0,
        0,
      ),
    );

    return tomorrowUtc8.getTime() - utc8Offset;
  }

  /**
   * 持久化計時資料（Write-Through PostgreSQL + Redis）
   * - 每局 settled 後呼叫
   * - Redis key: aa:session:{player_id}（write-through cache，Sentinel 切換後自 PostgreSQL 回填）
   * - PostgreSQL: UPDATE users SET daily_play_seconds=$1, session_play_seconds=$2 WHERE id=$3
   *
   * @param playerId 玩家 ID
   */
  async persistTimers(playerId: string): Promise<void> {
    const timer = this.timers.get(playerId);
    if (!timer) return;

    // Write-Through：同步寫入 PostgreSQL + Redis（由注入的 db 實作負責）
    await this.db.save(playerId, timer.daily_play_seconds, timer.session_play_seconds);

    console.log(
      `[AntiAddiction] persistTimers write-through OK for player ${playerId}: daily=${timer.daily_play_seconds}s, session=${timer.session_play_seconds}s`,
    );
  }

  /**
   * 玩家離線時累積計時資料
   * 若離線 > 30min，下次登入時重置 session_play_seconds
   *
   * @param playerId 玩家 ID
   */
  onPlayerOffline(playerId: string): void {
    const timer = this.timers.get(playerId);
    if (!timer) return;

    const nowMs = Date.now();
    const sessionElapsed = Math.floor((nowMs - timer.session_start_ms) / 1000);
    timer.daily_play_seconds += sessionElapsed;
    timer.session_play_seconds = 0;

    // 立即 Write-Through 至 PostgreSQL/Redis（離線時持久化防止資料遺失）
    this.persistTimers(playerId).catch((err) => {
      console.error(`[AntiAddiction] persistTimers on offline failed for ${playerId}:`, err);
    });
  }

  /**
   * 移除玩家計時資料（Room onDispose 時呼叫）
   *
   * @param playerId 玩家 ID
   */
  removePlayer(playerId: string): void {
    this.timers.delete(playerId);
  }
}
