/**
 * BettingPanelComponent — 押注面板元件
 * 依 PDD CMP-012：快速押注按鈕、自動押注 checkbox、3s 倒數進度條。
 */
import { ccclass, property } from 'cc';
import { Component, Label, Button, Node, ProgressBar, Toggle } from 'cc';
import { GameManager } from '../managers/GameManager';
import { AudioManager, SFX } from '../managers/AudioManager';
import { t } from '../managers/i18nManager';

const QUICK_BET_MULTIPLIERS = [1, 2, 5, 10, 20, 50] as const;
const AUTO_BET_DELAY_MS = 3000;

@ccclass('BettingPanelComponent')
export class BettingPanelComponent extends Component {
  @property(Label)       private lblMinBet!: Label;
  @property(Node)        private quickBetsRoot!: Node;
  @property(Button)      private btnConfirm!: Button;
  @property(Button)      private btnFold!: Button;
  @property(Toggle)      private toggleAutoBet!: Toggle;
  @property(ProgressBar) private autoProgress!: ProgressBar;
  @property(Label)       private lblAutoCountdown!: Label;

  private _selectedAmount = 0;
  private _lastBetAmount  = 0;
  private _autoTimer: any  = null;
  private _autoStartTime   = 0;
  private _isBankerMode    = false;

  onLoad(): void {
    this.btnConfirm.node.on('click', this._onConfirm, this);
    this.btnFold.node.on('click', this._onFold, this);
    this.toggleAutoBet.node.on('toggle', this._onAutoToggle, this);
    // BUG-20260422-001：無論玩家如何加入房間，自動押注 / 自動跟注 Toggle
    // 一律預設不勾選（不依賴 Cocos Editor Prefab 預設值）。
    this.toggleAutoBet.isChecked = false;
  }

  onDestroy(): void { this._cancelAutoAct(); }

  /** 以莊家押注模式展示 */
  showBankerMode(minBet: number, maxBet: number): void {
    this._isBankerMode = true;
    this.btnFold.node.active = false;
    this._renderQuickBets(minBet, maxBet);
    this._selectAmount(this._lastBetAmount > 0 ? this._lastBetAmount : minBet);
    // BUG-20260422-001：每次進入下注 phase 強制重置 Toggle 為未勾選，
    // 避免上局勾選狀態延續；玩家需每局重新決定是否啟用自動押注。
    this.toggleAutoBet.isChecked = false;
    this._cancelAutoAct();
  }

  /** 以閒家跟注模式展示 */
  showPlayerMode(bankerBet: number): void {
    this._isBankerMode = false;
    this.btnFold.node.active = true;
    this.lblMinBet.string = t('game.bankerBet', { amount: bankerBet.toLocaleString() });
    // BUG-20260422-001：每次進入跟注 phase 強制重置 Toggle 為未勾選
    this.toggleAutoBet.isChecked = false;
    this._cancelAutoAct();
  }

  private _renderQuickBets(min: number, max: number): void {
    const root = this.quickBetsRoot;
    root.removeAllChildren();
    QUICK_BET_MULTIPLIERS.forEach(mult => {
      const amount = min * mult;
      if (amount > max) return;
      const btn = this._createQuickBetButton(amount);
      root.addChild(btn);
    });
  }

  private _createQuickBetButton(amount: number): any {
    // In real Cocos project this would instantiate a prefab
    const { Node: CcNode, Label: CcLabel } = require('cc');
    const node = new CcNode(`qbet_${amount}`);
    node.on('click', () => {
      AudioManager.instance.playSFX(SFX.BET_CONFIRM);
      this._selectAmount(amount);
    });
    return node;
  }

  private _selectAmount(amount: number): void {
    this._selectedAmount = amount;
    // Highlight selected button (gold = primary)
    this.quickBetsRoot.children.forEach(btn => {
      btn.name === `qbet_${amount}` // primary style
        ? btn.emit('select')
        : btn.emit('deselect');
    });
  }

  private _onConfirm(): void {
    this._cancelAutoAct();
    if (this._isBankerMode) {
      GameManager.instance.bankerBet(this._selectedAmount);
      this._lastBetAmount = this._selectedAmount;
    }
    AudioManager.instance.playSFX(SFX.BET_CONFIRM);
  }

  private _onCall(): void {
    this._cancelAutoAct();
    GameManager.instance.call();
    AudioManager.instance.playSFX(SFX.COIN_DROP);
  }

  private _onFold(): void {
    this._cancelAutoAct();
    GameManager.instance.fold();
    AudioManager.instance.playSFX(SFX.FOLD);
  }

  private _onAutoToggle(): void {
    if (!this.toggleAutoBet.isChecked) this._cancelAutoAct();
  }

  private _startAutoAct(action: () => void): void {
    if (this._autoTimer) return;
    this._autoStartTime = Date.now();
    this.autoProgress.node.active = true;
    this._autoTimer = setInterval(() => {
      const elapsed = Date.now() - this._autoStartTime;
      const remaining = AUTO_BET_DELAY_MS - elapsed;
      this.autoProgress.progress = Math.max(0, remaining / AUTO_BET_DELAY_MS);
      const secs = Math.ceil(remaining / 1000);
      this.lblAutoCountdown.string = t('game.autoAct', { secs });
      if (remaining <= 0) {
        this._cancelAutoAct();
        action();
      }
    }, 100);
  }

  private _cancelAutoAct(): void {
    if (this._autoTimer) { clearInterval(this._autoTimer); this._autoTimer = null; }
    this.autoProgress.node.active = false;
    this._autoStartTime = 0;
  }
}
