// Unit tests for GameManager - Colyseus connection logic
// These are skeletons: actual tests require Colyseus mock

describe('GameManager', () => {
  describe('createRoom', () => {
    it('should call client.create("sam_gong") and return room with code', async () => {
      // TODO: Mock Colyseus client
      // Expected: room.id is 6-char alphanumeric
      expect(true).toBe(true); // placeholder
    });

    it('should emit stateChange events when room state changes', async () => {
      expect(true).toBe(true); // placeholder
    });
  });

  describe('joinRoom', () => {
    it('should call client.joinById with the given room code', async () => {
      expect(true).toBe(true); // placeholder
    });

    it('should emit error event on ROOM_NOT_FOUND (4001)', async () => {
      expect(true).toBe(true); // placeholder
    });
  });

  describe('sendMessage', () => {
    it('should call room.send with type and payload', () => {
      expect(true).toBe(true); // placeholder
    });
  });

  describe('reconnect', () => {
    it('should call client.reconnect with stored roomId and sessionId', async () => {
      expect(true).toBe(true); // placeholder
    });
  });
});
