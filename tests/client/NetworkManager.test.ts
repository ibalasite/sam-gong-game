/**
 * NetworkManager.test.ts
 * WS 訊息測試骨架（Mock Colyseus Room）
 *
 * 覆蓋：
 * - 連線 / 重連 / 斷線
 * - 所有 send* 方法的 WS 訊息格式（EDD §3.7）
 * - 未連線時送訊息的防護（不拋出例外）
 * - confirm_anti_addiction payload 必須為 { type: 'adult' }
 */

import {
  NetworkManager,
  IColyseusClient,
  IColyseusRoom,
} from '../../client/src/managers/NetworkManager';

// ── Mock 工廠 ─────────────────────────────────────────────────────────────────

interface SentMessage {
  type: string;
  payload: unknown;
}

function makeMockRoom(
  overrides?: Partial<IColyseusRoom>,
): { room: IColyseusRoom; sent: SentMessage[]; leftWith: boolean[] } {
  const sent: SentMessage[] = [];
  const leftWith: boolean[] = [];

  const room: IColyseusRoom = {
    id: 'mock-room-id',
    sessionId: 'mock-session-id',
    send(type: string, payload?: unknown) {
      sent.push({ type, payload });
    },
    leave(consented?: boolean) {
      leftWith.push(consented ?? true);
    },
    ...overrides,
  };

  return { room, sent, leftWith };
}

function makeMockClient(room: IColyseusRoom): { client: IColyseusClient; joinCalls: unknown[]; reconnectCalls: string[] } {
  const joinCalls: unknown[] = [];
  const reconnectCalls: string[] = [];

  const client: IColyseusClient = {
    joinById: jest.fn().mockImplementation((_roomId, options) => {
      joinCalls.push(options);
      return Promise.resolve(room);
    }),
    reconnect: jest.fn().mockImplementation((token) => {
      reconnectCalls.push(token);
      return Promise.resolve(room);
    }),
  };

  return { client, joinCalls, reconnectCalls };
}

// ── 測試 ──────────────────────────────────────────────────────────────────────

describe('NetworkManager', () => {
  let mockRoom: ReturnType<typeof makeMockRoom>;
  let mockClient: ReturnType<typeof makeMockClient>;
  let nm: NetworkManager;

  beforeEach(async () => {
    mockRoom = makeMockRoom();
    mockClient = makeMockClient(mockRoom.room);
    nm = new NetworkManager(mockClient.client);
    await nm.connect('sam_gong_room');
  });

  afterEach(() => {
    if (nm.isConnected) {
      nm.disconnect();
    }
  });

  // ── 連線管理 ────────────────────────────────────────────────────────────

  describe('connect()', () => {
    it('TC-NM-01: 連線後 isConnected=true', () => {
      expect(nm.isConnected).toBe(true);
    });

    it('TC-NM-02: 連線後 roomId 與 sessionId 正確', () => {
      expect(nm.roomId).toBe('mock-room-id');
      expect(nm.sessionId).toBe('mock-session-id');
    });

    it('TC-NM-03: 帶 sessionId 呼叫時，options 包含 sessionId', async () => {
      const nm2 = new NetworkManager(mockClient.client);
      await nm2.connect('sam_gong_room', 'existing-session');
      expect(mockClient.joinCalls[1]).toEqual({ sessionId: 'existing-session' });
      nm2.disconnect();
    });
  });

  describe('reconnect()', () => {
    it('TC-NM-04: reconnect 後 isConnected=true', async () => {
      nm.disconnect();
      await nm.reconnect('sam_gong_room', 'reconnect-token-xyz');
      expect(nm.isConnected).toBe(true);
      nm.disconnect();
    });

    it('TC-NM-05: reconnect 使用正確的 reconnectionToken', async () => {
      nm.disconnect();
      await nm.reconnect('sam_gong_room', 'my-token');
      expect(mockClient.reconnectCalls).toContain('my-token');
      nm.disconnect();
    });
  });

  describe('disconnect()', () => {
    it('TC-NM-06: disconnect 後 isConnected=false', () => {
      nm.disconnect();
      expect(nm.isConnected).toBe(false);
    });

    it('TC-NM-07: disconnect() 無參數時為 consented leave', () => {
      nm.disconnect();
      expect(mockRoom.leftWith[0]).toBe(true);
    });

    it('TC-NM-08: disconnect(1000) 帶 code 時為非 consented leave', () => {
      nm.disconnect(1000);
      expect(mockRoom.leftWith[0]).toBe(false);
    });

    it('TC-NM-09: 重複 disconnect 不拋出例外', () => {
      nm.disconnect();
      expect(() => nm.disconnect()).not.toThrow();
    });
  });

  // ── WS 訊息格式 ──────────────────────────────────────────────────────────

  describe('sendBankerBet()', () => {
    it('TC-NM-10: type="banker_bet", payload={ amount }', () => {
      nm.sendBankerBet(5000);
      expect(mockRoom.sent[0]).toEqual({ type: 'banker_bet', payload: { amount: 5000 } });
    });

    it('TC-NM-11: 不同金額正確帶入', () => {
      nm.sendBankerBet(100_000);
      expect(mockRoom.sent[0]?.payload).toEqual({ amount: 100_000 });
    });
  });

  describe('sendCall()', () => {
    it('TC-NM-12: type="call", payload=undefined', () => {
      nm.sendCall();
      expect(mockRoom.sent[0]).toEqual({ type: 'call', payload: undefined });
    });
  });

  describe('sendFold()', () => {
    it('TC-NM-13: type="fold", payload=undefined', () => {
      nm.sendFold();
      expect(mockRoom.sent[0]).toEqual({ type: 'fold', payload: undefined });
    });
  });

  describe('sendSeeCards()', () => {
    it('TC-NM-14: type="see_cards", payload=undefined', () => {
      nm.sendSeeCards();
      expect(mockRoom.sent[0]).toEqual({ type: 'see_cards', payload: undefined });
    });
  });

  describe('sendConfirmAntiAddiction()', () => {
    it('TC-NM-15: type="confirm_anti_addiction", payload={ type: "adult" }', () => {
      nm.sendConfirmAntiAddiction();
      expect(mockRoom.sent[0]).toEqual({
        type: 'confirm_anti_addiction',
        payload: { type: 'adult' },
      });
    });

    it('TC-NM-16: payload 不包含 player_id', () => {
      nm.sendConfirmAntiAddiction();
      const payload = mockRoom.sent[0]?.payload as Record<string, unknown>;
      expect(payload).not.toHaveProperty('player_id');
    });
  });

  describe('sendChat()', () => {
    it('TC-NM-17: type="send_chat", payload={ text }', () => {
      nm.sendChat('Hello World');
      expect(mockRoom.sent[0]).toEqual({ type: 'send_chat', payload: { text: 'Hello World' } });
    });

    it('TC-NM-18: 空字串也正常送出', () => {
      nm.sendChat('');
      expect(mockRoom.sent[0]?.payload).toEqual({ text: '' });
    });
  });

  // ── 未連線防護 ────────────────────────────────────────────────────────────

  describe('未連線時送訊息', () => {
    beforeEach(() => {
      nm.disconnect();
    });

    it('TC-NM-19: sendBankerBet 不拋出例外', () => {
      expect(() => nm.sendBankerBet(1000)).not.toThrow();
    });

    it('TC-NM-20: sendCall 不拋出例外', () => {
      expect(() => nm.sendCall()).not.toThrow();
    });

    it('TC-NM-21: sendConfirmAntiAddiction 不拋出例外', () => {
      expect(() => nm.sendConfirmAntiAddiction()).not.toThrow();
    });

    it('TC-NM-22: 未連線時訊息不被送出（Room.send 未被呼叫）', () => {
      const initialCount = mockRoom.sent.length;
      nm.sendFold();
      expect(mockRoom.sent.length).toBe(initialCount);
    });
  });

  // ── 連續訊息順序 ──────────────────────────────────────────────────────────

  describe('訊息順序', () => {
    it('TC-NM-23: 連續送多個訊息，順序正確', () => {
      nm.sendBankerBet(1000);
      nm.sendCall();
      nm.sendFold();

      expect(mockRoom.sent[0].type).toBe('banker_bet');
      expect(mockRoom.sent[1].type).toBe('call');
      expect(mockRoom.sent[2].type).toBe('fold');
    });
  });
});
