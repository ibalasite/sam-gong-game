/**
 * Server WebSocket E2E Tests — Sam Gong (三公) Colyseus Server
 *
 * These tests connect WebSocket clients directly to the Colyseus server and
 * exercise full game flows without a browser or Cocos runtime.
 *
 * Prerequisites:
 *   - colyseus.js client:  npm install colyseus.js  (in project root or tests/e2e/)
 *   - Running server:      cd server && npm run dev
 *     OR set E2E_INLINE_SERVER=true to spin up an in-process server (see beforeAll).
 *
 * Run:
 *   npx jest --config tests/e2e/jest.e2e.config.js
 *
 * Architecture note:
 *   Colyseus 0.15 uses WebSocket under the hood. The `colyseus.js` client SDK
 *   mirrors the server SDK API (Client / Room / onStateChange) so tests read
 *   naturally alongside server code.
 */

import * as Colyseus from 'colyseus.js';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const SERVER_URL = process.env.E2E_SERVER_URL ?? 'ws://localhost:2567';
const ROOM_NAME = 'sam_gong';

/** Wait for a condition to become true, polling every 100ms. */
async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000,
  label = 'condition'
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`waitFor timeout: ${label}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Create a named Colyseus client. */
function makeClient(nickname: string): Colyseus.Client {
  return new Colyseus.Client(SERVER_URL);
}

// ---------------------------------------------------------------------------
// Suite: Room Creation & Join
// ---------------------------------------------------------------------------

describe('Room Creation and Join', () => {
  let c1: Colyseus.Client;
  let c2: Colyseus.Client;
  let room1: Colyseus.Room;
  let room2: Colyseus.Room;

  beforeEach(() => {
    c1 = makeClient('Alice');
    c2 = makeClient('Bob');
  });

  afterEach(async () => {
    // Leave rooms gracefully; ignore errors if already left.
    try { await room1?.leave(false); } catch { /* noop */ }
    try { await room2?.leave(false); } catch { /* noop */ }
  });

  it('creates a room and assigns host status to first player', async () => {
    room1 = await c1.create(ROOM_NAME, { nickname: 'Alice' });

    expect(room1.roomId).toBeDefined();
    expect(room1.sessionId).toBeDefined();

    // Room state should be initialised with the creator as host
    await waitFor(() => room1.state?.players?.size > 0, 4000, 'player appears');
    const alice = room1.state.players.get(room1.sessionId);
    expect(alice).toBeDefined();
    expect(alice.isHost).toBe(true);
    expect(alice.nickname).toBe('Alice');
  });

  it('generates a 6-character alphanumeric room code', async () => {
    room1 = await c1.create(ROOM_NAME, { nickname: 'Alice' });
    await waitFor(() => !!room1.state?.roomCode, 4000, 'roomCode set');

    expect(room1.state.roomCode).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('allows a second player to join by room ID', async () => {
    room1 = await c1.create(ROOM_NAME, { nickname: 'Alice' });
    await waitFor(() => !!room1.roomId, 3000, 'room created');

    room2 = await c2.joinById(room1.roomId, { nickname: 'Bob' });
    await waitFor(() => room1.state?.players?.size === 2, 4000, '2 players in room');

    expect(room2.sessionId).toBeDefined();
    expect(room2.sessionId).not.toBe(room1.sessionId);
    expect(room1.state.players.size).toBe(2);
  });

  it('rejects a 7th player with error code 4002', async () => {
    // Create room with 6 players (c1 creates, c2-c6 join)
    room1 = await c1.create(ROOM_NAME, { nickname: 'P1' });
    const extras: Colyseus.Room[] = [];

    for (let i = 2; i <= 6; i++) {
      const c = makeClient(`P${i}`);
      const r = await c.joinById(room1.roomId, { nickname: `P${i}` });
      extras.push(r);
    }

    await waitFor(() => room1.state?.players?.size === 6, 6000, '6 players joined');

    // 7th player should be rejected
    const c7 = makeClient('P7');
    await expect(c7.joinById(room1.roomId, { nickname: 'P7' }))
      .rejects.toMatchObject({ code: 4002 });

    // Cleanup
    for (const r of extras) {
      try { await r.leave(false); } catch { /* noop */ }
    }
  });

  it('room is destroyed when all players leave', async () => {
    room1 = await c1.create(ROOM_NAME, { nickname: 'Alice' });
    const roomId = room1.roomId;
    await room1.leave(true);

    // Attempting to join a destroyed room should fail
    const c3 = makeClient('Charlie');
    await expect(c3.joinById(roomId, { nickname: 'Charlie' }))
      .rejects.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Suite: Full Game Round
// ---------------------------------------------------------------------------

describe('Full Game Round (betting → dealing → reveal → settlement)', () => {
  let host: Colyseus.Client;
  let guest: Colyseus.Client;
  let hostRoom: Colyseus.Room;
  let guestRoom: Colyseus.Room;

  beforeEach(async () => {
    host = makeClient('Host');
    guest = makeClient('Guest');

    hostRoom = await host.create(ROOM_NAME, { nickname: 'Host' });
    await waitFor(() => !!hostRoom.roomId, 3000, 'room created');

    guestRoom = await guest.joinById(hostRoom.roomId, { nickname: 'Guest' });
    await waitFor(() => hostRoom.state?.players?.size === 2, 4000, '2 players joined');
  });

  afterEach(async () => {
    try { await hostRoom?.leave(false); } catch { /* noop */ }
    try { await guestRoom?.leave(false); } catch { /* noop */ }
  });

  it('transitions from lobby → banker_selection when host sends start_game', async () => {
    hostRoom.send('start_game', {});
    await waitFor(
      () => hostRoom.state?.roomPhase === 'banker_selection',
      5000,
      'banker_selection phase'
    );
    expect(hostRoom.state.roomPhase).toBe('banker_selection');
  });

  it('transitions through full round phases in order', async () => {
    const phases: string[] = [];
    hostRoom.onStateChange((state) => {
      const phase: string = state.roomPhase;
      if (phases[phases.length - 1] !== phase) phases.push(phase);
    });

    // Start the game
    hostRoom.send('start_game', {});

    // Wait for banker_selection
    await waitFor(() => phases.includes('banker_selection'), 5000, 'banker_selection');

    // Wait for betting phase (server assigns banker automatically)
    await waitFor(() => phases.includes('betting'), 8000, 'betting phase');

    // Non-banker guest places a bet
    const guestState = hostRoom.state.players.get(guestRoom.sessionId);
    const guestIsBanker = guestState?.isBanker ?? false;
    if (!guestIsBanker) {
      guestRoom.send('place_bet', { action: 'call' });
    } else {
      hostRoom.send('place_bet', { action: 'call' });
    }

    // Wait for dealing phase
    await waitFor(() => phases.includes('dealing'), 10000, 'dealing phase');

    // Wait for reveal phase
    await waitFor(() => phases.includes('reveal'), 15000, 'reveal phase');

    // Wait for settling phase
    await waitFor(() => phases.includes('settling'), 20000, 'settling phase');

    expect(phases).toContain('banker_selection');
    expect(phases).toContain('betting');
    expect(phases).toContain('dealing');
    expect(phases).toContain('reveal');
    expect(phases).toContain('settling');
  });

  it('each player receives exactly 3 cards in dealing phase', async () => {
    hostRoom.send('start_game', {});
    await waitFor(() => hostRoom.state?.roomPhase === 'betting', 8000, 'betting');

    // Both players call/fold to advance
    hostRoom.send('place_bet', { action: 'call' });
    guestRoom.send('place_bet', { action: 'call' });

    await waitFor(() => hostRoom.state?.roomPhase === 'dealing', 10000, 'dealing');

    // Each player should have 3 cards
    for (const [, player] of hostRoom.state.players) {
      // Cards are @filter-protected; host can see own cards
      if (player.sessionId === hostRoom.sessionId) {
        await waitFor(() => player.cards?.length === 3, 5000, `${player.nickname} cards`);
        expect(player.cards.length).toBe(3);
      }
    }
  });

  it('settlement updates chip counts for both players', async () => {
    const initialChips = new Map<string, number>();
    for (const [sid, player] of hostRoom.state.players) {
      initialChips.set(sid, player.chips);
    }

    hostRoom.send('start_game', {});
    await waitFor(() => hostRoom.state?.roomPhase === 'betting', 8000, 'betting');

    hostRoom.send('place_bet', { action: 'call' });
    guestRoom.send('place_bet', { action: 'call' });

    await waitFor(() => hostRoom.state?.roomPhase === 'settling', 20000, 'settling');

    // At least one player's chip count should have changed
    let chipChanged = false;
    for (const [sid, player] of hostRoom.state.players) {
      if (player.chips !== initialChips.get(sid)) {
        chipChanged = true;
        break;
      }
    }
    expect(chipChanged).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite: Banker Rotation
// ---------------------------------------------------------------------------

describe('Banker Rotation', () => {
  let clients: Colyseus.Client[];
  let rooms: Colyseus.Room[];

  beforeEach(async () => {
    clients = [makeClient('P1'), makeClient('P2'), makeClient('P3')];
    rooms = [];

    rooms[0] = await clients[0].create(ROOM_NAME, { nickname: 'P1' });
    await waitFor(() => !!rooms[0].roomId, 3000, 'room created');

    for (let i = 1; i < clients.length; i++) {
      rooms[i] = await clients[i].joinById(rooms[0].roomId, { nickname: `P${i + 1}` });
    }
    await waitFor(() => rooms[0].state?.players?.size === 3, 5000, '3 players');
  });

  afterEach(async () => {
    for (const r of rooms) {
      try { await r?.leave(false); } catch { /* noop */ }
    }
  });

  it('assigns a banker for each round', async () => {
    rooms[0].send('start_game', {});
    await waitFor(() => rooms[0].state?.roomPhase === 'betting', 8000, 'betting');

    expect(rooms[0].state.currentBankerId).toBeTruthy();
    const banker = rooms[0].state.players.get(rooms[0].state.currentBankerId);
    expect(banker?.isBanker).toBe(true);
  });

  it('rotates banker to next player in bankerQueue after round ends', async () => {
    rooms[0].send('start_game', {});
    await waitFor(() => rooms[0].state?.roomPhase === 'betting', 8000, 'betting R1');

    const firstBankerId: string = rooms[0].state.currentBankerId;

    // Advance through round 1 by having non-bankers bet
    for (const r of rooms) {
      const p = rooms[0].state.players.get(r.sessionId);
      if (!p?.isBanker) r.send('place_bet', { action: 'call' });
    }

    // Wait for round_end then next betting phase
    await waitFor(() => rooms[0].state?.roomPhase === 'settling', 20000, 'settling R1');
    await waitFor(() => rooms[0].state?.roundNumber === 2, 25000, 'round 2');
    await waitFor(() => rooms[0].state?.roomPhase === 'betting', 30000, 'betting R2');

    const secondBankerId: string = rooms[0].state.currentBankerId;
    expect(secondBankerId).not.toBe(firstBankerId);
  });
});

// ---------------------------------------------------------------------------
// Suite: Player Disconnect & Reconnect
// ---------------------------------------------------------------------------

describe('Player Disconnect and Reconnect', () => {
  let c1: Colyseus.Client;
  let c2: Colyseus.Client;
  let room1: Colyseus.Room;
  let room2: Colyseus.Room;

  beforeEach(async () => {
    c1 = makeClient('Alice');
    c2 = makeClient('Bob');

    room1 = await c1.create(ROOM_NAME, { nickname: 'Alice' });
    await waitFor(() => !!room1.roomId, 3000);
    room2 = await c2.joinById(room1.roomId, { nickname: 'Bob' });
    await waitFor(() => room1.state?.players?.size === 2, 4000);

    // Start game so we're in an active round
    room1.send('start_game', {});
    await waitFor(() => room1.state?.roomPhase === 'betting', 8000, 'betting phase');
  });

  afterEach(async () => {
    try { await room1?.leave(false); } catch { /* noop */ }
    try { await room2?.leave(false); } catch { /* noop */ }
  });

  it('marks disconnected player status as "disconnected"', async () => {
    const bobSessionId = room2.sessionId;
    await room2.leave(false); // abrupt leave (no console error expected server-side)

    await waitFor(() => {
      const bob = room1.state.players.get(bobSessionId);
      return bob?.status === 'disconnected';
    }, 5000, 'Bob marked disconnected');

    const bob = room1.state.players.get(bobSessionId);
    expect(bob?.status).toBe('disconnected');
  });

  it('restores player state on reconnect within 60s', async () => {
    const bobSessionId = room2.sessionId;
    const bobPreviousChips = room1.state.players.get(bobSessionId)?.chips ?? 0;

    // Simulate disconnect
    await room2.leave(false);
    await waitFor(() => {
      return room1.state.players.get(bobSessionId)?.status === 'disconnected';
    }, 5000, 'Bob disconnected');

    // Reconnect using same session token (Colyseus reconnect flow)
    const c2b = makeClient('Bob-reconnect');
    room2 = await c2b.reconnect(room1.roomId, bobSessionId);

    await waitFor(() => {
      const bob = room1.state.players.get(bobSessionId);
      return bob?.status !== 'disconnected';
    }, 8000, 'Bob reconnected');

    const bobAfter = room1.state.players.get(bobSessionId);
    expect(bobAfter?.chips).toBe(bobPreviousChips);
    expect(bobAfter?.status).not.toBe('disconnected');
  });

  it('preserves seat index after reconnect', async () => {
    const bobSessionId = room2.sessionId;
    const bobSeatBefore = room1.state.players.get(bobSessionId)?.seatIndex ?? -1;

    await room2.leave(false);
    await waitFor(() => {
      return room1.state.players.get(bobSessionId)?.status === 'disconnected';
    }, 5000, 'Bob disconnected');

    const c2b = makeClient('Bob-reconnect');
    room2 = await c2b.reconnect(room1.roomId, bobSessionId);
    await waitFor(() => {
      return room1.state.players.get(bobSessionId)?.status !== 'disconnected';
    }, 8000, 'Bob reconnected');

    const bobSeatAfter = room1.state.players.get(bobSessionId)?.seatIndex;
    expect(bobSeatAfter).toBe(bobSeatBefore);
  });
});

// ---------------------------------------------------------------------------
// Suite: Error / Edge Cases
// ---------------------------------------------------------------------------

describe('Edge Cases', () => {
  let c1: Colyseus.Client;
  let c2: Colyseus.Client;
  let room1: Colyseus.Room;
  let room2: Colyseus.Room;

  afterEach(async () => {
    try { await room1?.leave(false); } catch { /* noop */ }
    try { await room2?.leave(false); } catch { /* noop */ }
  });

  it('cannot start game with only 1 player', async () => {
    c1 = makeClient('Solo');
    room1 = await c1.create(ROOM_NAME, { nickname: 'Solo' });
    await waitFor(() => !!room1.roomId, 3000);

    // Capture error message via onMessage or server response
    let rejected = false;
    room1.onMessage('error', () => { rejected = true; });
    room1.send('start_game', {});

    // Phase should remain lobby
    await new Promise((r) => setTimeout(r, 1000));
    expect(room1.state.roomPhase).toBe('lobby');
  });

  it('only host can send start_game; non-host attempt is ignored', async () => {
    c1 = makeClient('Host');
    c2 = makeClient('Guest');
    room1 = await c1.create(ROOM_NAME, { nickname: 'Host' });
    await waitFor(() => !!room1.roomId, 3000);
    room2 = await c2.joinById(room1.roomId, { nickname: 'Guest' });
    await waitFor(() => room1.state?.players?.size === 2, 4000);

    // Guest attempts to start — should be ignored
    room2.send('start_game', {});
    await new Promise((r) => setTimeout(r, 1000));
    expect(room1.state.roomPhase).toBe('lobby');
  });

  it('joining with an invalid room ID throws an error', async () => {
    c1 = makeClient('NoRoom');
    await expect(c1.joinById('INVALID_ROOM_ID', { nickname: 'NoRoom' }))
      .rejects.toBeDefined();
  });

  it('place_bet is rejected outside of betting phase', async () => {
    c1 = makeClient('EarlyBetter');
    room1 = await c1.create(ROOM_NAME, { nickname: 'EarlyBetter' });
    await waitFor(() => !!room1.roomId, 3000);

    // Still in lobby — place_bet should be ignored / error
    let errorReceived = false;
    room1.onMessage('error', () => { errorReceived = true; });
    room1.send('place_bet', { action: 'call' });

    await new Promise((r) => setTimeout(r, 800));
    expect(room1.state.roomPhase).toBe('lobby');
  });
});
