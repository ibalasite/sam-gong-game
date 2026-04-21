import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const successRate = new Rate('spike_success_rate');
const connectionErrors = new Counter('connection_errors');

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 },  // sudden spike to 200
        { duration: '1m', target: 200 },   // sustain
        { duration: '30s', target: 0 },    // drop
      ],
    },
  },
  thresholds: {
    'spike_success_rate': ['rate>0.90'],   // 90%+ under spike
    'connection_errors': ['count<50'],
  },
};

const SERVER_URL = __ENV.SERVER_URL || 'ws://localhost:2567';

export default function () {
  const res = ws.connect(SERVER_URL, {}, function (socket) {
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'ping' }));
      successRate.add(true);
    });

    socket.on('error', () => {
      connectionErrors.add(1);
      successRate.add(false);
    });

    sleep(Math.random() * 5 + 2);
    socket.close();
  });

  check(res, { 'status 101': (r) => r && r.status === 101 });

  if (!res || res.status !== 101) {
    connectionErrors.add(1);
  }

  sleep(0.5);
}
