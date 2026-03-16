import { VisionRequest } from './_lib/types';
import { runVision } from './_aiOrchestrator';

interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

const coerceBody = <T>(raw: unknown): T => {
  if (typeof raw === 'string') {
    return JSON.parse(raw) as T;
  }
  if (raw && typeof raw === 'object') {
    return raw as T;
  }
  return {} as T;
};

const isPayloadTooLargeError = (message: string): boolean => {
  const text = message.toLowerCase();
  return (
    text.includes('entity too large') ||
    text.includes('payload too large') ||
    text.includes('request body too large') ||
    text.includes('function payload too large')
  );
};

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const payload = coerceBody<VisionRequest>(req.body);
    const response = await runVision(payload);
    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Vision proxy failure.';
    const status = isPayloadTooLargeError(message) ? 413 : 500;
    res.status(status).json({ error: message });
  }
}
