/**
 * TutorialScriptEngine 單元測試
 *
 * 規格來源：EDD §3.6 TutorialScriptEngine, REQ-012
 *
 * 覆蓋範圍：
 * - loadScript(round)：正確載入 R1/R2/R3 劇本
 * - validateUniqueness()：18 張牌全部唯一
 * - 各輪預期結果驗證（expected_outcome）
 * - 無效 round 拋出錯誤
 */

import { TutorialScriptEngine } from '../../src/game/TutorialScriptEngine';

describe('TutorialScriptEngine', () => {
  let engine: TutorialScriptEngine;

  beforeEach(() => {
    engine = new TutorialScriptEngine();
  });

  // ────────────────────────────────────────────
  // loadScript
  // ────────────────────────────────────────────

  describe('loadScript()', () => {
    it('TC-TSE-001: R1 預期結果為 banker_win', () => {
      const script = engine.loadScript(1);
      expect(script.expected_outcome).toBe('banker_win');
    });

    it('TC-TSE-002: R1 莊家手牌包含 3 張', () => {
      const script = engine.loadScript(1);
      expect(script.banker_hand).toHaveLength(3);
    });

    it('TC-TSE-003: R1 閒家手牌包含 P1 key', () => {
      const script = engine.loadScript(1);
      expect(script.player_hands['P1']).toBeDefined();
      expect(script.player_hands['P1']).toHaveLength(3);
    });

    it('TC-TSE-004: R1 force_tie=false', () => {
      const script = engine.loadScript(1);
      expect(script.force_tie).toBe(false);
    });

    it('TC-TSE-005: R1 hint_i18n_key 為 tutorial.hint.sam_gong', () => {
      const script = engine.loadScript(1);
      expect(script.hint_i18n_key).toBe('tutorial.hint.sam_gong');
    });

    it('TC-TSE-006: R2 預期結果為 banker_win', () => {
      const script = engine.loadScript(2);
      expect(script.expected_outcome).toBe('banker_win');
    });

    it('TC-TSE-007: R2 force_tie=false', () => {
      const script = engine.loadScript(2);
      expect(script.force_tie).toBe(false);
    });

    it('TC-TSE-008: R3 預期結果為 tie', () => {
      const script = engine.loadScript(3);
      expect(script.expected_outcome).toBe('tie');
    });

    it('TC-TSE-009: R3 force_tie=true', () => {
      const script = engine.loadScript(3);
      expect(script.force_tie).toBe(true);
    });

    it('TC-TSE-010: R3 hint_i18n_key 為 tutorial.hint.tie', () => {
      const script = engine.loadScript(3);
      expect(script.hint_i18n_key).toBe('tutorial.hint.tie');
    });

    it('TC-TSE-011: round 欄位值與參數一致（R1/R2/R3）', () => {
      for (const r of [1, 2, 3] as const) {
        const script = engine.loadScript(r);
        expect(script.round).toBe(r);
      }
    });
  });

  // ────────────────────────────────────────────
  // validateUniqueness
  // ────────────────────────────────────────────

  describe('validateUniqueness()', () => {
    it('TC-TSE-012: 所有 18 張牌唯一（無重複）', () => {
      const isUnique = engine.validateUniqueness();
      expect(isUnique).toBe(true);
    });
  });

  // ────────────────────────────────────────────
  // 牌張內容驗證
  // ────────────────────────────────────────────

  describe('牌張內容驗證', () => {
    it('TC-TSE-013: 所有牌張的 value 為合法值', () => {
      const validValues = new Set(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
      const scripts = engine.getAllScripts();

      for (const script of Object.values(scripts)) {
        for (const card of script.banker_hand) {
          expect(validValues.has(card.value)).toBe(true);
        }
        for (const hand of Object.values(script.player_hands)) {
          for (const card of hand) {
            expect(validValues.has(card.value)).toBe(true);
          }
        }
      }
    });

    it('TC-TSE-014: 所有牌張的 suit 為合法值', () => {
      const validSuits = new Set(['spade', 'heart', 'diamond', 'club']);
      const scripts = engine.getAllScripts();

      for (const script of Object.values(scripts)) {
        for (const card of script.banker_hand) {
          expect(validSuits.has(card.suit)).toBe(true);
        }
        for (const hand of Object.values(script.player_hands)) {
          for (const card of hand) {
            expect(validSuits.has(card.suit)).toBe(true);
          }
        }
      }
    });

    it('TC-TSE-015: R1 莊家為三公（K Q J）', () => {
      const script = engine.loadScript(1);
      const samGongValues = new Set(['10', 'J', 'Q', 'K']);
      const isSamGong = script.banker_hand.every((c) => samGongValues.has(c.value));
      expect(isSamGong).toBe(true);
    });

    it('TC-TSE-016: R1 閒家非三公（含 A 和數字牌）', () => {
      const script = engine.loadScript(1);
      const samGongValues = new Set(['10', 'J', 'Q', 'K']);
      const isSamGong = script.player_hands['P1'].every((c) => samGongValues.has(c.value));
      expect(isSamGong).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // 錯誤處理
  // ────────────────────────────────────────────

  describe('錯誤處理', () => {
    it('TC-TSE-017: 無效 round（0）拋出錯誤', () => {
      expect(() => engine.loadScript(0 as 1 | 2 | 3)).toThrow('invalid round 0');
    });

    it('TC-TSE-018: 無效 round（4）拋出錯誤', () => {
      expect(() => engine.loadScript(4 as 1 | 2 | 3)).toThrow('invalid round 4');
    });
  });

  // ────────────────────────────────────────────
  // getAllScripts
  // ────────────────────────────────────────────

  describe('getAllScripts()', () => {
    it('TC-TSE-019: getAllScripts 返回 3 輪劇本', () => {
      const scripts = engine.getAllScripts();
      const rounds = Object.keys(scripts);
      expect(rounds).toHaveLength(3);
    });

    it('TC-TSE-020: getAllScripts 返回副本（不影響原始資料）', () => {
      const scripts1 = engine.getAllScripts();
      const scripts2 = engine.getAllScripts();

      // 不同物件參照
      expect(scripts1).not.toBe(scripts2);
    });
  });
});
