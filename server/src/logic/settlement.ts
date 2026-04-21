import { CardData } from './deck';
import { compareHands } from './evaluator';

export interface SettlementResult {
  sessionId: string;
  outcome: 'win' | 'lose' | 'no_game';
  chipsChange: number;
  finalChips: number;
  isBanker: boolean;
}

interface PlayerData {
  cards: CardData[];
  hasBet: boolean;
  isBanker: boolean;
  chips: number;
}

/**
 * 流局結算（AC-007-6）：所有閒家棄牌，底注退回莊家，無盈虧。
 * Forfeit / no-game path: all non-banker players folded.
 * No chips change for anyone. All entries return outcome='no_game'.
 */
export function settleForfeit(
  players: Map<string, PlayerData>,
): SettlementResult[] {
  return Array.from(players.entries()).map(([sid, player]) => ({
    sessionId: sid,
    outcome: 'no_game' as const,
    chipsChange: 0,
    finalChips: player.chips,
    isBanker: player.isBanker,
  }));
}

export function settle(
  players: Map<string, PlayerData>,
  bankerId: string,
  betAmount: number
): SettlementResult[] {
  const banker = players.get(bankerId);
  if (!banker) {
    throw new Error(`Banker with sessionId "${bankerId}" not found in players map`);
  }
  const results: SettlementResult[] = [];

  for (const [sid, player] of players) {
    if (sid === bankerId) continue;
    if (!player.hasBet) continue;

    const outcome = compareHands(player.cards, banker.cards);
    const chipsChange = outcome === 'player' ? betAmount : -betAmount;
    results.push({
      sessionId: sid,
      outcome: outcome === 'player' ? 'win' : 'lose',
      chipsChange,
      finalChips: player.chips + chipsChange,
      isBanker: false,
    });
  }

  const bankerChange = results.reduce((acc, r) => acc - r.chipsChange, 0);
  results.push({
    sessionId: bankerId,
    outcome: bankerChange >= 0 ? 'win' : 'lose',
    chipsChange: bankerChange,
    finalChips: banker.chips + bankerChange,
    isBanker: true,
  });

  return results;
}
