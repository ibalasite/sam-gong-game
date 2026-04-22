/**
 * BUG-20260422-019 Stage 2：PostgreSQL 持久化層
 *
 * 最簡版本，僅實作本次需要的：
 *   users            — player_id, display_name, chip_balance
 *   chip_transactions — 每筆盈虧記錄（遊戲贏 / 輸 / 抽水）
 *
 * 生產 DDL（完整版）見 docs/EDD.md §5.1。本檔只做啟動自動建表（IF NOT EXISTS）。
 *
 * 設計原則：
 *   - DB 失敗不擋遊戲：pool.query 失敗僅 console.error，回傳 fallback
 *   - in-memory chip_balance 是當局權威；DB 是跨 session 的持久層
 *   - 結算寫入採 fire-and-forget（Promise 不 await，失敗記 log），避免擋廣播
 */
import { Pool } from 'pg';

const HOST     = process.env['DB_HOST']     ?? 'postgres-service';
const PORT     = parseInt(process.env['DB_PORT'] ?? '5432', 10);
const USER     = process.env['DB_USER']     ?? 'sam_gong_app';
const PASSWORD = process.env['DB_PASSWORD'] ?? 'dev_password_change_me';
const DATABASE = process.env['DB_NAME']     ?? 'sam_gong';

let _pool: Pool | null = null;
let _dbReady = false;

export function getPool(): Pool {
  if (_pool) return _pool;
  _pool = new Pool({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: DATABASE,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  _pool.on('error', (err) => {
    console.error('[DB] Pool error:', err.message);
  });
  return _pool;
}

export function isDbReady(): boolean {
  return _dbReady;
}

/**
 * 啟動時執行：確認連線、建表（若不存在）。
 * 失敗不擋 server 啟動 — 遊戲退化成 in-memory 模式。
 */
export async function initSchema(): Promise<void> {
  const pool = getPool();
  try {
    await pool.query('SELECT 1');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            UUID NOT NULL DEFAULT gen_random_uuid(),
        player_id     TEXT PRIMARY KEY,
        display_name  VARCHAR(24) NOT NULL,
        chip_balance  BIGINT NOT NULL DEFAULT 100000,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chip_balance_non_negative CHECK (chip_balance >= 0)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chip_transactions (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        player_id      TEXT REFERENCES users(player_id) ON DELETE SET NULL,
        delta          BIGINT NOT NULL,
        tx_type        VARCHAR(32) NOT NULL,
        balance_after  BIGINT NOT NULL,
        round_id       TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chip_transactions_player
        ON chip_transactions(player_id, created_at DESC)
    `);
    _dbReady = true;
    console.log('[DB] ✅ Schema ready (users + chip_transactions)');
  } catch (err) {
    _dbReady = false;
    const msg = (err as Error).message;
    console.warn(`[DB] ⚠️ Init failed, falling back to in-memory only: ${msg}`);
  }
}

/**
 * 確保 user 存在 + 回傳目前 chip_balance。
 * 不存在則建立（預設 100,000 籌碼）。
 * DB 失敗回傳 fallback 100,000。
 */
export async function ensureUser(playerId: string, displayName: string): Promise<number> {
  if (!_dbReady) return 100_000;
  try {
    const res = await getPool().query<{ chip_balance: string }>(
      `INSERT INTO users (player_id, display_name, chip_balance)
       VALUES ($1, $2, 100000)
       ON CONFLICT (player_id)
       DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()
       RETURNING chip_balance`,
      [playerId, displayName],
    );
    // pg 把 BIGINT 回傳為 string；轉 number
    return Number(res.rows[0]?.chip_balance ?? 100_000);
  } catch (err) {
    console.error(`[DB] ensureUser failed for ${playerId}:`, (err as Error).message);
    return 100_000;
  }
}

/**
 * 結算寫入（fire-and-forget）：
 *   1. UPDATE users.chip_balance
 *   2. INSERT chip_transactions 一筆
 * 失敗僅 log，不拋錯（不擋遊戲）。
 */
export function recordSettlement(playerId: string, newBalance: number, delta: number, txType: string, roundId?: string): void {
  if (!_dbReady) return;
  // 同一個 connection 連兩個 query（非 transaction，最簡版）
  getPool().query(
    'UPDATE users SET chip_balance = $1, updated_at = NOW() WHERE player_id = $2',
    [newBalance, playerId],
  ).catch((err) => {
    console.error(`[DB] UPDATE chip_balance failed for ${playerId}:`, (err as Error).message);
  });
  getPool().query(
    `INSERT INTO chip_transactions (player_id, delta, tx_type, balance_after, round_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [playerId, delta, txType, newBalance, roundId ?? null],
  ).catch((err) => {
    console.error(`[DB] INSERT chip_transactions failed for ${playerId}:`, (err as Error).message);
  });
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _dbReady = false;
  }
}
