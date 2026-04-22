import { BettingPanelComponent } from '../../assets/scripts/components/BettingPanelComponent';

// cc is already mapped to __mocks__/cc.ts via jest.config.js moduleNameMapper
jest.mock('../../assets/scripts/managers/GameManager', () => ({
  GameManager: { instance: { bankerBet: jest.fn(), call: jest.fn(), fold: jest.fn() } },
}));
jest.mock('../../assets/scripts/managers/AudioManager', () => ({
  AudioManager: { instance: { playSFX: jest.fn() } },
  SFX: { BET_CONFIRM: 'sfx_bet_confirm', FOLD: 'sfx_fold', COIN_DROP: 'sfx_coin_drop' },
}));
jest.mock('../../assets/scripts/managers/i18nManager', () => ({
  t: (key: string, params?: any) => key + (params ? JSON.stringify(params) : ''),
}));

describe('BettingPanelComponent', () => {
  let panel: BettingPanelComponent;

  beforeEach(() => {
    jest.useFakeTimers();
    panel = new BettingPanelComponent();
    const makeMockNode = () => ({ active: true, name: '', on: jest.fn(), emit: jest.fn(), destroy: jest.fn(), children: [], removeAllChildren: jest.fn(), addChild: jest.fn() });
    (panel as any)._selectedAmount = 0;
    (panel as any)._lastBetAmount = 0;
    (panel as any)._isBankerMode = false;
    (panel as any).btnConfirm = { node: makeMockNode(), interactable: true };
    (panel as any).btnFold = { node: makeMockNode(), interactable: true };
    (panel as any).toggleAutoBet = { isChecked: false, node: makeMockNode() };
    (panel as any).autoProgress = { node: makeMockNode(), progress: 1 };
    (panel as any).lblAutoCountdown = { string: '' };
    (panel as any).lblMinBet = { string: '' };
    (panel as any).quickBetsRoot = { ...makeMockNode(), children: [] };
  });

  afterEach(() => {
    jest.useRealTimers();
    (panel as any)._cancelAutoAct();
  });

  describe('_selectAmount()', () => {
    it('stores selected amount', () => {
      (panel as any)._selectAmount(500);
      expect((panel as any)._selectedAmount).toBe(500);
    });
  });

  describe('auto-act countdown', () => {
    it('triggers action after 3 seconds', () => {
      const action = jest.fn();
      (panel as any)._startAutoAct(action);
      jest.advanceTimersByTime(3100);
      expect(action).toHaveBeenCalled();
    });

    it('does not trigger if cancelled before timeout', () => {
      const action = jest.fn();
      (panel as any)._startAutoAct(action);
      jest.advanceTimersByTime(1000);
      (panel as any)._cancelAutoAct();
      jest.advanceTimersByTime(2500);
      expect(action).not.toHaveBeenCalled();
    });
  });

  describe('_onFold()', () => {
    it('calls GameManager.fold()', () => {
      const { GameManager } = require('../../assets/scripts/managers/GameManager');
      (panel as any)._onFold();
      expect(GameManager.instance.fold).toHaveBeenCalled();
    });
  });

  // BUG-20260422-001：自動押注 / 自動跟注 Toggle 預設不勾選
  describe('auto-bet Toggle default (BUG-20260422-001)', () => {
    // _renderQuickBets 需要 cc.Node 建構子，mock 中未提供，本組測試只關心 Toggle 行為
    beforeEach(() => {
      jest.spyOn(panel as any, '_renderQuickBets').mockImplementation(() => {});
      jest.spyOn(panel as any, '_selectAmount').mockImplementation(() => {});
    });

    it('onLoad forces toggleAutoBet.isChecked = false regardless of editor default', () => {
      (panel as any).toggleAutoBet.isChecked = true;  // 模擬 Cocos Editor 誤設為 true
      panel.onLoad();
      expect((panel as any).toggleAutoBet.isChecked).toBe(false);
    });

    it('showBankerMode resets toggle to unchecked and does not auto-start even if previously checked', () => {
      (panel as any).toggleAutoBet.isChecked = true;
      const startSpy = jest.spyOn(panel as any, '_startAutoAct');
      panel.showBankerMode(100, 500);
      expect((panel as any).toggleAutoBet.isChecked).toBe(false);
      expect(startSpy).not.toHaveBeenCalled();
    });

    it('showPlayerMode resets toggle to unchecked and does not auto-start even if previously checked', () => {
      (panel as any).toggleAutoBet.isChecked = true;
      const startSpy = jest.spyOn(panel as any, '_startAutoAct');
      panel.showPlayerMode(200);
      expect((panel as any).toggleAutoBet.isChecked).toBe(false);
      expect(startSpy).not.toHaveBeenCalled();
    });

    it('player must manually check Toggle to enable auto-act (no implicit auto-call/auto-bet)', () => {
      panel.onLoad();
      const { GameManager } = require('../../assets/scripts/managers/GameManager');
      GameManager.instance.bankerBet.mockClear();
      GameManager.instance.call.mockClear();
      panel.showBankerMode(100, 500);
      jest.advanceTimersByTime(3500);
      expect(GameManager.instance.bankerBet).not.toHaveBeenCalled();
      panel.showPlayerMode(200);
      jest.advanceTimersByTime(3500);
      expect(GameManager.instance.call).not.toHaveBeenCalled();
    });
  });
});
