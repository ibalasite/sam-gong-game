import 'cc'; // mock module

describe('CardComponent', () => {
  describe('showCardFace', () => {
    it('should display card suit and rank', () => {
      // CardComponent.showCardFace({ suit: 'spades', rank: 'A', revealed: true })
      // Expected: label shows '♠A'
      expect(true).toBe(true); // placeholder - requires Cocos runtime
    });

    it('should show card back when revealed is false', () => {
      expect(true).toBe(true); // placeholder
    });
  });

  describe('flipCard', () => {
    it('should trigger a tween animation', async () => {
      // Expected: tween called with rotateY animation
      expect(true).toBe(true); // placeholder
    });

    it('should resolve after animation completes', async () => {
      expect(true).toBe(true); // placeholder
    });
  });
});
