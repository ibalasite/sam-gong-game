/**
 * BankerRotation — 輪莊邏輯
 *
 * 規格來源：EDD §3.6 BankerRotation
 *
 * 輪莊演算法：
 * 1. 取得當前已入座玩家的 seat_index 列表（排除已離線玩家）
 * 2. 尋找當前莊家 seat 的位置
 * 3. 下一莊家：seats[(idx + 1) % seats.length]（順時針循環）
 * 4. 若下一莊家籌碼 < min_bet：skipInsolventBanker() 繼續往下找
 * 5. 若所有玩家均不合格：返回 -1
 */

/** 簡化的玩家狀態介面（供 BankerRotation 使用） */
export interface PlayerState {
  player_id: string;
  seat_index: number;
  chip_balance: number;
  is_connected?: boolean;
}

/**
 * BankerRotation — 管理莊家輪換邏輯
 */
export class BankerRotation {
  /**
   * 決定首局莊家
   * 規則：持最多籌碼者優先；同籌碼時以最小 seat_index 決定（先入座優先）
   *
   * @param players 已入座玩家列表
   * @returns 首局莊家的 seat_index
   * @throws Error 若 players 為空
   */
  determineFirstBanker(players: PlayerState[]): number {
    if (players.length === 0) {
      throw new Error('BankerRotation.determineFirstBanker: no players');
    }

    // 依 chip_balance 降冪排序，同籌碼依 seat_index 升冪（先入座優先）
    const sorted = [...players].sort((a, b) => {
      if (b.chip_balance !== a.chip_balance) {
        return b.chip_balance - a.chip_balance;
      }
      return a.seat_index - b.seat_index;
    });

    return sorted[0].seat_index;
  }

  /**
   * 順時針輪莊至下一位玩家
   * - Fold 玩家正常參與輪莊（不跳過）
   * - 離線玩家（is_connected=false）應已從 players 列表移除
   *
   * @param currentBankerSeat 當前莊家座位
   * @param players 當前在席玩家列表（已排除離線玩家）
   * @returns 下一位莊家的 seat_index
   * @throws Error 若 players 為空
   */
  rotate(currentBankerSeat: number, players: PlayerState[]): number {
    if (players.length === 0) {
      throw new Error('BankerRotation.rotate: no players');
    }

    // 依 seat_index 升冪排序（順時針）
    const seats = players.map((p) => p.seat_index).sort((a, b) => a - b);

    const currentIdx = seats.indexOf(currentBankerSeat);

    if (currentIdx === -1) {
      // 當前莊家不在列表中（已離場），從最小 seat 開始
      return seats[0];
    }

    const nextIdx = (currentIdx + 1) % seats.length;
    return seats[nextIdx];
  }

  /**
   * 跳過籌碼不足的莊家候選
   * 從 startSeat 開始順時針尋找第一位 chip_balance >= minBet 的玩家
   *
   * @param startSeat 起始座位（含，第一個嘗試的座位）
   * @param players 當前在席玩家列表
   * @param minBet 最低下注額（莊家資格門檻）
   * @returns 合格莊家的 seat_index，若無合格候選返回 -1
   */
  skipInsolventBanker(
    startSeat: number,
    players: PlayerState[],
    minBet: number,
  ): number {
    if (players.length === 0) return -1;

    // 依 seat_index 升冪排序
    const seats = players.map((p) => p.seat_index).sort((a, b) => a - b);
    const playerMap = new Map(players.map((p) => [p.seat_index, p]));

    // 找到 startSeat 在排序後列表中的位置
    let startIdx = seats.indexOf(startSeat);
    if (startIdx === -1) {
      // startSeat 不存在，從最小 seat 開始
      startIdx = 0;
    }

    // 從 startSeat 開始，最多檢查 seats.length 個座位（避免無限循環）
    for (let i = 0; i < seats.length; i++) {
      const idx = (startIdx + i) % seats.length;
      const seatIndex = seats[idx];
      const player = playerMap.get(seatIndex);

      if (player && player.chip_balance >= minBet) {
        return seatIndex;
      }
    }

    // 所有候選均不合格
    return -1;
  }

  /**
   * 完整輪莊流程：rotate 後自動 skipInsolventBanker
   *
   * @param currentBankerSeat 當前莊家座位
   * @param players 當前在席玩家列表
   * @param minBet 最低下注額
   * @returns 下一位合格莊家的 seat_index，若無合格候選返回 -1
   */
  rotateWithSkip(
    currentBankerSeat: number,
    players: PlayerState[],
    minBet: number,
  ): number {
    const nextSeat = this.rotate(currentBankerSeat, players);
    return this.skipInsolventBanker(nextSeat, players, minBet);
  }
}
