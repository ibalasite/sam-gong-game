import 'cc'; // mock module

// TODO: CardComponent is a Cocos Creator component that requires the full cc runtime
// to instantiate. Real assertions are deferred until a Cocos Creator headless runner
// or a component adapter is available.
// All suites are marked `.skip` to prevent fake assertions from masking coverage.

describe.skip('CardComponent', () => {
  describe('showCardFace', () => {
    it('should display card suit and rank', () => {
      // TODO: Instantiate CardComponent with cc mock, call showCardFace
      // Expected: label.string === '♠A'
    });

    it('should show card back when revealed is false', () => {
      // TODO: Call showCardFace({ suit: 'hearts', rank: 'K', revealed: false })
      // Expected: label shows card-back placeholder text
    });
  });

  describe('flipCard', () => {
    it('should trigger a tween animation', async () => {
      // TODO: Spy on cc.tween, verify called with rotateY animation params
    });

    it('should resolve after animation completes', async () => {
      // TODO: Verify Promise resolves when tween.call() callback fires
    });
  });
});
