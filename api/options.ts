import { OptionsRequest, runOptions } from './_anthropic';

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

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const payload = coerceBody<OptionsRequest>(req.body);
    const response = await runOptions(payload);
    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server proxy failure.';
    res.status(500).json({ error: message });
  }
}
