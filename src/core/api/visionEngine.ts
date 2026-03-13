export interface VisionAnalysisResult {
  summary: string;
  findings: string[];
  red_flags: string[];
  confidence: number;
  recommendation: string;
  spot_diagnosis?: {
    label: string;
    icd10?: string;
    confidence?: number;
    rationale?: string;
  };
  differentials?: Array<{
    label: string;
    icd10?: string;
    likelihood: 'high' | 'medium' | 'low';
    rationale?: string;
  }>;
  treatment_summary?: string;
  treatment_lines?: string[];
  investigations?: string[];
  counseling?: string[];
}

export interface VisionAnalysisSupplement {
  summary?: string;
  red_flags?: string[];
  recommendation?: string;
  spot_diagnosis?: VisionAnalysisResult['spot_diagnosis'];
  differentials?: VisionAnalysisResult['differentials'];
  treatment_summary?: string;
  treatment_lines?: string[];
  investigations?: string[];
  counseling?: string[];
}

const sanitizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const sanitizeList = (value: unknown, maxItems: number): string[] =>
  Array.isArray(value)
    ? value.map((item) => sanitizeText(item)).filter(Boolean).slice(0, maxItems)
    : [];

const clampVisionConfidencePercent = (value: unknown): number => {
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return 0;
  const scaled = num > 0 && num <= 1 ? num * 100 : num;
  return Math.max(0, Math.min(100, Math.round(scaled)));
};

const sanitizeLikelihood = (value: unknown): 'high' | 'medium' | 'low' => {
  const normalized = sanitizeText(value).toLowerCase();
  if (normalized === 'high') return 'high';
  if (normalized === 'low') return 'low';
  return 'medium';
};

const parseSpotDiagnosis = (
  value: unknown
): VisionAnalysisResult['spot_diagnosis'] => {
  const spotRaw = value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
  const label = sanitizeText(spotRaw.label);
  if (!label) return undefined;
  return {
    label,
    icd10: sanitizeText(spotRaw.icd10) || undefined,
    confidence: clampVisionConfidencePercent(spotRaw.confidence),
    rationale: sanitizeText(spotRaw.rationale) || undefined,
  };
};

const parseDifferentials = (
  value: unknown
): VisionAnalysisResult['differentials'] => {
  const raw = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>)
    : [];
  const parsed = raw
    .map((entry) => {
      const label = sanitizeText(entry.label);
      if (!label) return null;
      return {
        label,
        icd10: sanitizeText(entry.icd10) || undefined,
        likelihood: sanitizeLikelihood(entry.likelihood),
        rationale: sanitizeText(entry.rationale) || undefined,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, 6);
  return parsed.length > 0 ? parsed : undefined;
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
  const treatmentLines = sanitizeList(data.treatment_lines, 8);
  const investigations = sanitizeList(data.investigations, 8);
  const counseling = sanitizeList(data.counseling, 8);
  const spotDiagnosis = parseSpotDiagnosis(data.spot_diagnosis);
  const differentials = parseDifferentials(data.differentials);

  return {
    summary: sanitizeText(data.summary) || 'No conclusive visual finding.',
    findings: sanitizeList(data.findings, 8),
    red_flags: sanitizeList(data.red_flags, 6),
    confidence: clampVisionConfidencePercent(data.confidence),
    recommendation: sanitizeText(data.recommendation) || 'Continue structured history collection.',
    spot_diagnosis: spotDiagnosis,
    differentials,
    treatment_summary: sanitizeText(data.treatment_summary) || undefined,
    treatment_lines: treatmentLines.length > 0 ? treatmentLines : undefined,
    investigations: investigations.length > 0 ? investigations : undefined,
    counseling: counseling.length > 0 ? counseling : undefined,
  };
};

export const synthesizeScanTreatment = async (payload: {
  analysis: VisionAnalysisResult;
  clinicalContext?: string;
  lens?: 'general' | 'lab' | 'radiology';
}): Promise<VisionAnalysisSupplement> => {
  const response = await fetch('/api/scan-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Scan Plan API Error: ${body || response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const treatmentLines = sanitizeList(data.treatment_lines, 8);
  const investigations = sanitizeList(data.investigations, 8);
  const counseling = sanitizeList(data.counseling, 8);
  const redFlags = sanitizeList(data.red_flags, 6);
  const spotDiagnosis = parseSpotDiagnosis(data.spot_diagnosis);
  const differentials = parseDifferentials(data.differentials);

  return {
    summary: sanitizeText(data.summary) || undefined,
    red_flags: redFlags.length > 0 ? redFlags : undefined,
    recommendation: sanitizeText(data.recommendation) || undefined,
    spot_diagnosis: spotDiagnosis,
    differentials,
    treatment_summary: sanitizeText(data.treatment_summary) || undefined,
    treatment_lines: treatmentLines.length > 0 ? treatmentLines : undefined,
    investigations: investigations.length > 0 ? investigations : undefined,
    counseling: counseling.length > 0 ? counseling : undefined,
  };
};

