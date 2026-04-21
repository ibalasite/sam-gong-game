// Unit tests for GameManager - Colyseus connection logic
// TODO: These tests require a Colyseus client mock. Real assertions are deferred
// until a Colyseus mock library (e.g. colyseus.js mock) is configured.
// All suites are marked `.skip` to prevent fake assertions from masking coverage.

describe.skip('GameManager', () => {
  describe('createRoom', () => {
    it('should call client.create("sam_gong") and return room with code', async () => {
      // TODO: Mock Colyseus client
      // Expected: room.id is 6-char alphanumeric
    });

    it('should emit stateChange events when room state changes', async () => {
      // TODO: Mock room.onStateChange callback
    });
  });

  describe('joinRoom', () => {
    it('should call client.joinById with the given room code', async () => {
      // TODO: Mock Colyseus client.joinById
    });

    it('should emit error event on ROOM_NOT_FOUND (4001)', async () => {
      // TODO: Mock Colyseus error with code 4001
    });
  });

  describe('sendMessage', () => {
    it('should call room.send with type and payload', () => {
      // TODO: Mock room.send
    });
  });

  describe('reconnect', () => {
    it('should call client.reconnect with stored roomId and sessionId', async () => {
      // TODO: Mock client.reconnect, verify stored sessionId used
    });
  });
});
