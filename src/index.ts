/**
 * Sam Gong (三公) — Colyseus Game Server Entry Point
 * Port: 2567 (WS + HTTP)
 */
import http from 'http';
import express from 'express';
import { Server } from 'colyseus';
import { SamGongRoom } from './rooms/SamGongRoom';

const PORT = parseInt(process.env['PORT'] ?? '2567', 10);

const app = express();
app.use(express.json());

// ── Health Check ────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'sam-gong-game-server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── Colyseus Server ─────────────────────────────────────
const httpServer = http.createServer(app);
const gameServer = new Server({ server: httpServer });

gameServer.define('sam_gong', SamGongRoom);

// ── Colyseus Monitor (dev only) ─────────────────────────
if (process.env['COLYSEUS_MONITOR_ENABLED'] === 'true') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { monitor } = require('@colyseus/monitor');
    app.use('/colyseus', monitor());
    console.log('[Server] Colyseus monitor enabled at /colyseus');
  } catch {
    console.warn('[Server] @colyseus/monitor not installed, skipping.');
  }
}

// ── Start ────────────────────────────────────────────────
gameServer.listen(PORT).then(() => {
  console.log(`[Server] ✅ Sam Gong game server running on ws://0.0.0.0:${PORT}`);
  console.log(`[Server] Health: http://localhost:${PORT}/health`);
}).catch((err: Error) => {
  console.error('[Server] ❌ Failed to start:', err);
  process.exit(1);
});
