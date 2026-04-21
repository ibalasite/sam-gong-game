import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// Custom metrics
const wsConnectTime = new Trend('ws_connect_time', true);
const msgRtt = new Trend('msg_round_trip_time', true);
const gameErrors = new Counter('game_errors');
const successRate = new Rate('game_success_rate');

export const options = {
  scenarios: {
    steady_state: {
      executor: 'constant-vus',
      vus: 150,         // 50 rooms × 3 players
      duration: '5m',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    'ws_connect_time': ['p(95)<1000'],        // WS connect < 1s (P95)
    'msg_round_trip_time': ['p(95)<300'],     // Action RTT < 300ms (P95)
    'game_errors': ['count<10'],              // < 10 total errors
    'game_success_rate': ['rate>0.99'],       // 99%+ success
  },
};

const SERVER_URL = __ENV.SERVER_URL || 'ws://localhost:2567';

// Simulates one player in a 3-player room scenario
export default function () {
  const vuId = __VU;
  const isHost = vuId % 3 === 1; // every 3rd VU is the host/banker

  const connectStart = Date.now();
  const res = ws.connect(`${SERVER_URL}`, {}, function (socket) {
    wsConnectTime.add(Date.now() - connectStart);

    socket.on('open', () => {
      // Join or create a room
      const roomCode = `ROOM${Math.floor(vuId / 3).toString().padStart(2, '0')}`;
      if (isHost) {
        socket.send(JSON.stringify({ type: 'create', roomCode }));
      } else {
        socket.send(JSON.stringify({ type: 'join', roomCode }));
      }
    });

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'state' && msg.phase === 'betting') {
          // Simulate player action
          const actionStart = Date.now();
          socket.send(JSON.stringify({
            type: 'player_action',
            action: Math.random() > 0.2 ? 'call' : 'fold'
          }));
          msgRtt.add(Date.now() - actionStart);
          successRate.add(true);
        }
        if (msg.type === 'error') {
          gameErrors.add(1);
          successRate.add(false);
        }
      } catch (e) {
        gameErrors.add(1);
      }
    });

    socket.on('error', () => {
      gameErrors.add(1);
      successRate.add(false);
    });

    // Keep connection alive for 1 game round (~15s average)
    sleep(Math.random() * 10 + 10);
    socket.close();
  });

  check(res, { 'WebSocket connected': (r) => r && r.status === 101 });
  sleep(1);
}
