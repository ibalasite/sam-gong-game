/**
 * Sam Gong (三公) — REST API Server Entry Point
 * Port: 3000
 */
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';

const PORT = parseInt(process.env['API_PORT'] ?? process.env['PORT'] ?? '3000', 10);

const app = express();
app.use(express.json());

// ── CORS ─────────────────────────────────────────────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  next();
});

// ── Health Checks ─────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'sam-gong-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'sam-gong-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env['NODE_ENV'] ?? 'development',
  });
});

// ── Auth Endpoints (stub — returns 503 until DB wired) ───
app.post('/api/v1/auth/request-otp', (_req: Request, res: Response) => {
  res.status(503).json({ error: 'auth.db_not_configured', message: 'Database not configured in this env' });
});

app.post('/api/v1/auth/register', (_req: Request, res: Response) => {
  res.status(503).json({ error: 'auth.db_not_configured', message: 'Database not configured in this env' });
});

app.post('/api/v1/auth/login', (_req: Request, res: Response) => {
  res.status(503).json({ error: 'auth.db_not_configured', message: 'Database not configured in this env' });
});

// ── Protected routes → 401 without token ─────────────────
const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'auth.token_required', message: 'Authorization header required' });
    return;
  }
  next();
};

app.get('/api/v1/player/me', requireAuth, (_req: Request, res: Response) => {
  res.status(503).json({ error: 'api.not_implemented', message: 'Player API not yet wired to DB' });
});

app.get('/api/v1/rooms', requireAuth, (_req: Request, res: Response) => {
  res.json({ rooms: [], total: 0 });
});

// ── Catch-all 404 ─────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'not_found', message: 'Endpoint not found' });
});

// ── Start ─────────────────────────────────────────────────
const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[API] ✅ Sam Gong REST API running on http://0.0.0.0:${PORT}`);
  console.log(`[API] Health: http://localhost:${PORT}/api/v1/health`);
});
