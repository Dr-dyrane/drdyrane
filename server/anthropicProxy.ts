import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect } from 'vite';
import {
  ConsultRequest,
  OptionsRequest,
  ScanPlanRequest,
  VisionRequest,
  runConsult,
  runOptions,
  runScanPlan,
  runVision,
} from '../api/_aiOrchestrator';

const readJsonBody = async <T>(req: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
};

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown): void => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const getClientId = (req: IncomingMessage): string => {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw && typeof raw === 'string') {
    return raw.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'local';
};

const requestCounters = new Map<string, { count: number; resetAt: number }>();

const checkRateLimit = (
  req: IncomingMessage,
  routeKey: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfter: number } => {
  const now = Date.now();
  const key = `${routeKey}:${getClientId(req)}`;
  const existing = requestCounters.get(key);

  if (!existing || now >= existing.resetAt) {
    requestCounters.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  requestCounters.set(key, existing);
  return { allowed: true, retryAfter: 0 };
};

const handleError = (res: ServerResponse, error: unknown): void => {
  console.error('[dr-dyrane-api]', error);
  writeJson(res, 500, {
    error: error instanceof Error ? error.message : 'Server proxy failure.',
  });
};

const guardAndRun = (
  req: IncomingMessage,
  res: ServerResponse,
  routeKey: string,
  limit: number,
  windowMs: number,
  runner: () => Promise<void>
): void => {
  const rate = checkRateLimit(req, routeKey, limit, windowMs);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    writeJson(res, 429, { error: 'Rate limit exceeded.', retry_after_seconds: rate.retryAfter });
    return;
  }

  void runner().catch((error) => handleError(res, error));
};

const handleConsult = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const body = await readJsonBody<ConsultRequest>(req);
  const result = await runConsult(body);
  writeJson(res, 200, result);
};

const handleOptions = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const body = await readJsonBody<OptionsRequest>(req);
  const result = await runOptions(body);
  writeJson(res, 200, result);
};

const handleVision = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const body = await readJsonBody<VisionRequest>(req);
  const result = await runVision(body);
  writeJson(res, 200, result);
};

const handleScanPlan = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const body = await readJsonBody<ScanPlanRequest>(req);
  const result = await runScanPlan(body);
  writeJson(res, 200, result);
};

const routeMiddleware: Connect.NextHandleFunction = (req, res, next) => {
  const path = (req.url || '').split('?')[0];
  const method = req.method || 'GET';

  if (method === 'POST' && path === '/api/consult') {
    guardAndRun(req, res, 'consult', 45, 60_000, async () => handleConsult(req, res));
    return;
  }

  if (method === 'POST' && path === '/api/options') {
    guardAndRun(req, res, 'options', 90, 60_000, async () => handleOptions(req, res));
    return;
  }

  if (method === 'POST' && path === '/api/vision') {
    guardAndRun(req, res, 'vision', 24, 60_000, async () => handleVision(req, res));
    return;
  }

  if (method === 'POST' && path === '/api/scan-plan') {
    guardAndRun(req, res, 'scan-plan', 36, 60_000, async () => handleScanPlan(req, res));
    return;
  }

  next();
};

export const attachAnthropicProxy = (middlewares: Connect.Server): void => {
  middlewares.use(routeMiddleware);
};
