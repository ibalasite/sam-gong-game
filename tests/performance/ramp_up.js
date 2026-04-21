import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const successRate = new Rate('success_rate');

export const options = {
  stages: [
    { duration: '2m', target: 50 },    // ramp up to 50 VUs
    { duration: '3m', target: 150 },   // ramp up to 150 VUs (50 rooms × 3)
    { duration: '2m', target: 200 },   // push to spike
    { duration: '2m', target: 0 },     // ramp down
  ],
  thresholds: {
    'success_rate': ['rate>0.95'],     // 95%+ through ramp
    'ws_connecting': ['p(95)<1500'],   // allow slightly higher on ramp
  },
};

const SERVER_URL = __ENV.SERVER_URL || 'ws://localhost:2567';

export default function () {
  const res = ws.connect(SERVER_URL, {}, function (socket) {
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'ping' }));
    });

    socket.on('message', (data) => {
      successRate.add(true);
    });

    socket.on('error', () => {
      successRate.add(false);
    });

    sleep(5 + Math.random() * 10);
    socket.close();
  });

  check(res, { 'connected': (r) => r && r.status === 101 });
  sleep(1);
}
