# Performance Tests — 三公遊戲

## Prerequisites
- k6 installed: `brew install k6`
- Server running locally or set SERVER_URL env var

## Run Tests

### Steady State (primary test)
```bash
SERVER_URL=ws://localhost:2567 k6 run tests/performance/steady_load.js
```

### Ramp Up
```bash
SERVER_URL=ws://localhost:2567 k6 run tests/performance/ramp_up.js
```

### Spike Test
```bash
SERVER_URL=ws://localhost:2567 k6 run tests/performance/spike_test.js
```

## Thresholds (from PRD NFRs)

| Metric | Threshold | Source |
|--------|-----------|--------|
| WebSocket connect time (P95) | < 1000ms | PRD §5.1 |
| Message RTT (P95) | < 300ms | PRD §5.1 |
| Game errors | < 10 total | PRD §5.2 |
| Success rate | > 99% | PRD §5.2 |
| Spike success rate | > 90% | PRD §5.2 |

## Expected Results (Pilot: 50 concurrent rooms)

- WS connect: ~50ms (local), ~200ms (cloud)
- Message RTT: ~10ms (local), ~100ms (cloud)
- Memory: < 512MB Node.js heap
- CPU: < 20% single core
