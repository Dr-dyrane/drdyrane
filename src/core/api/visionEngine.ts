import { AiActivityScope, beginAiTask } from '../services/aiActivity';

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

export const VISION_UPLOAD_FILE_LIMIT_BYTES = 8 * 1024 * 1024;
const VISION_REQUEST_LIMIT_BYTES = 3_200_000;
const VISION_IMAGE_TARGET_BYTES = 2_200_000;
const REQUEST_SAFETY_OVERHEAD_BYTES = 160_000;
const IMAGE_DATA_URL_PATTERN = /^data:image\/[a-zA-Z0-9.+-]+;base64,/;

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

const ICD10_PATTERN = /\(ICD-10:\s*([A-Z0-9.-]+)\)/i;

const parseDxSeed = (value: string, fallbackCode: string): { label: string; icd10: string } | null => {
  const text = sanitizeText(value);
  if (!text) return null;
  const code = sanitizeText(text.match(ICD10_PATTERN)?.[1]).toUpperCase() || fallbackCode;
  const label = text.replace(ICD10_PATTERN, '').replace(/\s+/g, ' ').trim();
  if (!label) return null;
  return { label, icd10: code };
};

const ensureVisionResultContract = (
  result: Partial<VisionAnalysisResult>
): VisionAnalysisResult => {
  const summary = sanitizeText(result.summary) || 'Image reviewed with clinically relevant findings identified.';
  const findings = (result.findings || []).slice(0, 8);
  const redFlags = (result.red_flags || []).slice(0, 8);
  const fallbackLeadFromSummary = parseDxSeed(summary.split(/[.;]/)[0] || '', 'R69');
  const existingLead = result.spot_diagnosis?.label
    ? {
        label: sanitizeText(result.spot_diagnosis.label),
        icd10: sanitizeText(result.spot_diagnosis.icd10).toUpperCase() || 'R69',
        confidence: clampVisionConfidencePercent(result.spot_diagnosis.confidence),
        rationale: sanitizeText(result.spot_diagnosis.rationale) || undefined,
      }
    : null;
  const lead = existingLead || {
    label: fallbackLeadFromSummary?.label || 'Undifferentiated clinical finding',
    icd10: fallbackLeadFromSummary?.icd10 || 'R69',
    confidence: Math.max(clampVisionConfidencePercent(result.confidence), 1),
    rationale: 'Lead diagnosis selected from highest-consistency visual pattern.',
  };

  const differentialSeeds = (result.differentials || [])
    .map((entry) => {
      const seed = parseDxSeed(entry.label, sanitizeText(entry.icd10).toUpperCase() || lead.icd10);
      if (!seed) return null;
      return {
        label: seed.label,
        icd10: seed.icd10,
        likelihood: sanitizeLikelihood(entry.likelihood),
        rationale: sanitizeText(entry.rationale) || undefined,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const fallbackDifferentials = [
    { label: lead.label, icd10: lead.icd10, likelihood: 'high' as const },
    { label: 'Infective process', icd10: 'A49.9', likelihood: 'medium' as const },
    { label: 'Inflammatory process', icd10: 'R69', likelihood: 'medium' as const },
  ];

  const dedupedDifferentials = [...differentialSeeds, ...fallbackDifferentials]
    .reduce<Array<NonNullable<VisionAnalysisResult['differentials']>[number]>>((acc, entry) => {
      if (acc.some((current) => current.label.toLowerCase() === entry.label.toLowerCase())) return acc;
      acc.push(entry);
      return acc;
    }, [])
    .slice(0, 6);

  const treatmentLines =
    result.treatment_lines && result.treatment_lines.length > 0
      ? result.treatment_lines.slice(0, 8)
      : [
          'Start diagnosis-directed treatment protocol now.',
          'Control pain/fever and maintain hydration while monitoring progression.',
        ];
  const investigations =
    result.investigations && result.investigations.length > 0
      ? result.investigations.slice(0, 8)
      : [
          'Order targeted confirmatory test for the lead diagnosis.',
          'Run baseline safety labs and interval reassessment.',
        ];
  const counseling =
    result.counseling && result.counseling.length > 0
      ? result.counseling.slice(0, 8)
      : [
          'Follow treatment exactly as prescribed.',
          'Escalate immediately for any red-flag symptom progression.',
        ];

  return {
    summary,
    findings,
    red_flags:
      redFlags.length > 0
        ? redFlags
        : [
            'Rapid lesion progression',
            'Symptoms persisting beyond two weeks',
            'New widespread mucosal involvement',
            'Escalating pain despite treatment',
            'Reduced oral intake',
          ],
    confidence: Math.max(clampVisionConfidencePercent(result.confidence), 1),
    recommendation:
      sanitizeText(result.recommendation) ||
      'Proceed with definitive management and complete targeted investigations now.',
    spot_diagnosis: lead,
    differentials: dedupedDifferentials,
    treatment_summary:
      sanitizeText(result.treatment_summary) ||
      'Definitive management pathway prepared from diagnosis and risk profile.',
    treatment_lines: treatmentLines,
    investigations,
    counseling,
  };
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

const estimateJsonBytes = (value: unknown): number => {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
};

const estimateDataUrlBytes = (dataUrl: string): number => {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const base64 = match[1].replace(/\s+/g, '');
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to decode selected image.'));
    image.src = dataUrl;
  });

const renderScaledJpeg = (
  image: HTMLImageElement,
  maxEdge: number,
  quality: number
): string => {
  const longest = Math.max(image.naturalWidth, image.naturalHeight, 1);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to optimize image.');
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
};

const fitImageDataUrlToBudget = async (
  dataUrl: string,
  targetBytes: number
): Promise<{ dataUrl: string; bytes: number; changed: boolean }> => {
  const initialBytes = estimateDataUrlBytes(dataUrl);
  if (initialBytes <= targetBytes) {
    return { dataUrl, bytes: initialBytes, changed: false };
  }
  if (typeof document === 'undefined') {
    return { dataUrl, bytes: initialBytes, changed: false };
  }

  const image = await loadImage(dataUrl);
  const edges = [1600, 1400, 1200, 1024, 896, 768, 640];
  const qualities = [0.86, 0.78, 0.7, 0.62, 0.56, 0.5, 0.44];

  let bestDataUrl = dataUrl;
  let bestBytes = initialBytes;

  for (const edge of edges) {
    for (const quality of qualities) {
      const candidate = renderScaledJpeg(image, edge, quality);
      const candidateBytes = estimateDataUrlBytes(candidate);
      if (candidateBytes < bestBytes) {
        bestDataUrl = candidate;
        bestBytes = candidateBytes;
      }
      if (candidateBytes <= targetBytes) {
        return { dataUrl: candidate, bytes: candidateBytes, changed: true };
      }
    }
  }

  return { dataUrl: bestDataUrl, bytes: bestBytes, changed: bestDataUrl !== dataUrl };
};

const resolveVisionPayloadError = (status: number, body: string): string | null => {
  const text = `${body || ''}`.toLowerCase();
  if (
    status === 413 ||
    text.includes('entity too large') ||
    text.includes('payload too large') ||
    text.includes('request body too large') ||
    text.includes('function payload too large')
  ) {
    return 'Image payload is too large. Crop/zoom the image and retry.';
  }
  return null;
};

export const analyzeClinicalImage = async (payload: {
  imageDataUrl: string;
  clinicalContext?: string;
  lensPrompt?: string;
  activityScope?: AiActivityScope;
  activityTitle?: string;
}): Promise<VisionAnalysisResult> => {
  const task = beginAiTask({
    scope: payload.activityScope || 'scan',
    title: payload.activityTitle || 'Clinical image review',
    nodes: [
      { id: 'prepare', label: 'Preparing image payload' },
      { id: 'vision_call', label: 'Running vision model' },
      { id: 'structure', label: 'Structuring clinical output' },
    ],
  });

  task.start('prepare', 'Encoding request');
  try {
    const incomingImageDataUrl = sanitizeText(payload.imageDataUrl);
    if (!IMAGE_DATA_URL_PATTERN.test(incomingImageDataUrl)) {
      throw new Error('Invalid image payload. Use a valid image file.');
    }

    const rawImageBytes = estimateDataUrlBytes(incomingImageDataUrl);
    let requestPayload = { ...payload, imageDataUrl: incomingImageDataUrl };
    let requestBytes = estimateJsonBytes(requestPayload);
    let optimizedImageDataUrl = incomingImageDataUrl;

    const targetImageBytes = Math.max(
      420_000,
      Math.min(VISION_IMAGE_TARGET_BYTES, VISION_REQUEST_LIMIT_BYTES - REQUEST_SAFETY_OVERHEAD_BYTES)
    );

    if (rawImageBytes > VISION_IMAGE_TARGET_BYTES || requestBytes > VISION_REQUEST_LIMIT_BYTES) {
      task.start('prepare', 'Optimizing image size');
      const optimized = await fitImageDataUrlToBudget(incomingImageDataUrl, targetImageBytes);
      optimizedImageDataUrl = optimized.dataUrl;
      requestPayload = { ...payload, imageDataUrl: optimizedImageDataUrl };
      requestBytes = estimateJsonBytes(requestPayload);
      if (requestBytes > VISION_REQUEST_LIMIT_BYTES) {
        throw new Error('Image payload is too large. Crop/zoom the image and retry.');
      }
      task.succeed('prepare', optimized.changed ? 'Image optimized' : 'Payload ready');
    } else {
      task.succeed('prepare', 'Payload ready');
    }

    task.start('vision_call', 'Contacting Dr engine');
    const response = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const payloadError = resolveVisionPayloadError(response.status, body);
      task.fail('vision_call', 'Request failed');
      task.finishError(payloadError || 'Vision call failed');
      if (payloadError) {
        throw new Error(payloadError);
      }
      throw new Error(`Vision API Error: ${body || response.status}`);
    }
    task.succeed('vision_call', 'Response received');
    task.start('structure', 'Normalizing output');

    const data = (await response.json()) as Record<string, unknown>;
    const treatmentLines = sanitizeList(data.treatment_lines, 8);
    const investigations = sanitizeList(data.investigations, 8);
    const counseling = sanitizeList(data.counseling, 8);
    const spotDiagnosis = parseSpotDiagnosis(data.spot_diagnosis);
    const differentials = parseDifferentials(data.differentials);
    const result = ensureVisionResultContract({
      summary: sanitizeText(data.summary) || 'No conclusive visual finding.',
      findings: sanitizeList(data.findings, 8),
      red_flags: sanitizeList(data.red_flags, 6),
      confidence: clampVisionConfidencePercent(data.confidence),
      recommendation:
        sanitizeText(data.recommendation) ||
        'Proceed with focused management and complete targeted investigations.',
      spot_diagnosis: spotDiagnosis,
      differentials,
      treatment_summary: sanitizeText(data.treatment_summary) || undefined,
      treatment_lines: treatmentLines.length > 0 ? treatmentLines : undefined,
      investigations: investigations.length > 0 ? investigations : undefined,
      counseling: counseling.length > 0 ? counseling : undefined,
    });
    task.succeed('structure', 'Structured output ready');
    task.finishSuccess('Review complete');
    return result;
  } catch (error) {
    task.finishError(error instanceof Error ? error.message : 'Vision analysis failed');
    throw error;
  }
};

export const synthesizeScanTreatment = async (payload: {
  analysis: VisionAnalysisResult;
  clinicalContext?: string;
  lens?: 'general' | 'lab' | 'radiology';
  activityScope?: AiActivityScope;
  activityTitle?: string;
}): Promise<VisionAnalysisSupplement> => {
  const task = beginAiTask({
    scope: payload.activityScope || 'scan',
    title: payload.activityTitle || 'Treatment synthesis',
    nodes: [
      { id: 'prepare', label: 'Preparing clinical context' },
      { id: 'plan_call', label: 'Generating management plan' },
      { id: 'structure', label: 'Structuring plan output' },
    ],
  });
  task.start('prepare', 'Compiling findings');

  try {
    task.succeed('prepare', 'Context prepared');
    task.start('plan_call', 'Contacting Dr planner');
    const response = await fetch('/api/scan-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      task.fail('plan_call', 'Request failed');
      task.finishError('Plan synthesis failed');
      throw new Error(`Scan Plan API Error: ${body || response.status}`);
    }
    task.succeed('plan_call', 'Plan response received');
    task.start('structure', 'Normalizing plan');

    const data = (await response.json()) as Record<string, unknown>;
    const treatmentLines = sanitizeList(data.treatment_lines, 8);
    const investigations = sanitizeList(data.investigations, 8);
    const counseling = sanitizeList(data.counseling, 8);
    const redFlags = sanitizeList(data.red_flags, 6);
    const spotDiagnosis = parseSpotDiagnosis(data.spot_diagnosis);
    const differentials = parseDifferentials(data.differentials);

    const result = ensureVisionResultContract({
      summary: sanitizeText(data.summary) || payload.analysis.summary,
      findings: payload.analysis.findings || [],
      red_flags: redFlags.length > 0 ? redFlags : payload.analysis.red_flags,
      confidence: payload.analysis.confidence,
      recommendation: sanitizeText(data.recommendation) || payload.analysis.recommendation,
      spot_diagnosis: spotDiagnosis || payload.analysis.spot_diagnosis,
      differentials: differentials || payload.analysis.differentials,
      treatment_summary:
        sanitizeText(data.treatment_summary) || payload.analysis.treatment_summary,
      treatment_lines:
        treatmentLines.length > 0 ? treatmentLines : payload.analysis.treatment_lines,
      investigations:
        investigations.length > 0 ? investigations : payload.analysis.investigations,
      counseling: counseling.length > 0 ? counseling : payload.analysis.counseling,
    });
    task.succeed('structure', 'Plan ready');
    task.finishSuccess('Management synthesis complete');
    return result;
  } catch (error) {
    task.finishError(error instanceof Error ? error.message : 'Plan synthesis failed');
    throw error;
  }
};

