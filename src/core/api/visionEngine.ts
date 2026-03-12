export interface VisionAnalysisResult {
  summary: string;
  findings: string[];
  red_flags: string[];
  confidence: number;
  recommendation: string;
}

const sanitizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const sanitizeList = (value: unknown, maxItems: number): string[] =>
  Array.isArray(value)
    ? value.map((item) => sanitizeText(item)).filter(Boolean).slice(0, maxItems)
    : [];

const clampPercent = (value: unknown): number => {
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
};

export const analyzeClinicalImage = async (payload: {
  imageDataUrl: string;
  clinicalContext?: string;
  lensPrompt?: string;
}): Promise<VisionAnalysisResult> => {
  const response = await fetch('/api/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Vision API Error: ${body || response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    summary: sanitizeText(data.summary) || 'No conclusive visual finding.',
    findings: sanitizeList(data.findings, 8),
    red_flags: sanitizeList(data.red_flags, 6),
    confidence: clampPercent(data.confidence),
    recommendation: sanitizeText(data.recommendation) || 'Continue structured history collection.',
  };
};

