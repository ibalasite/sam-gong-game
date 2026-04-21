import { getSuitSymbol, formatPoints, isValidRoomCode, formatChips } from '../../assets/scripts/utils/gameStateUtils';

describe('getSuitSymbol', () => {
  it('returns ♠ for spades', () => expect(getSuitSymbol('spades')).toBe('♠'));
  it('returns ♥ for hearts', () => expect(getSuitSymbol('hearts')).toBe('♥'));
  it('returns ♦ for diamonds', () => expect(getSuitSymbol('diamonds')).toBe('♦'));
  it('returns ♣ for clubs', () => expect(getSuitSymbol('clubs')).toBe('♣'));
});

describe('formatPoints', () => {
  it('returns 公牌 label for 0', () => expect(formatPoints(0)).toBe('公牌 ✨'));
  it('returns formatted points for boundary value 1', () => expect(formatPoints(1)).toBe('點數: 1'));
  it('returns formatted points for 1-9', () => {
    expect(formatPoints(5)).toBe('點數: 5');
    expect(formatPoints(9)).toBe('點數: 9');
  });
});

describe('isValidRoomCode', () => {
  it('accepts 6-char alphanumeric uppercase', () => expect(isValidRoomCode('ABC123')).toBe(true));
  it('accepts 6-char alphanumeric lowercase', () => expect(isValidRoomCode('abc123')).toBe(true));
  it('rejects less than 6 chars', () => expect(isValidRoomCode('AB12')).toBe(false));
  it('rejects more than 6 chars', () => expect(isValidRoomCode('ABCD1234')).toBe(false));
  it('rejects empty string', () => expect(isValidRoomCode('')).toBe(false));
  it('rejects special characters', () => expect(isValidRoomCode('ABC!23')).toBe(false));
});

describe('formatChips', () => {
  it('formats 1000 as "1,000"', () => expect(formatChips(1000)).toBe('1,000'));
  it('formats 50 as "50"', () => expect(formatChips(50)).toBe('50'));
  it('formats 1000000 as "1,000,000"', () => expect(formatChips(1000000)).toBe('1,000,000'));
  it('formats 0 as "0"', () => expect(formatChips(0)).toBe('0'));
});
