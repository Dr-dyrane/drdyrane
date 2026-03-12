import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Camera,
  ClipboardCheck,
  ImagePlus,
  Loader2,
  Printer,
  Send,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';
import { signalFeedback } from '../../core/services/feedback';
import { analyzeClinicalImage } from '../../core/api/visionEngine';
import { processAgentInteraction } from '../../core/api/agentCoordinator';
import { OverlayPortal } from '../../components/shared/OverlayPortal';
import { DiagnosticReviewKind, DiagnosticReviewRecord, SessionRecord } from '../../core/types/clinical';

type DiagnosticEventKind = DiagnosticReviewKind | 'lab' | 'radiology';
type ScanLens = 'general' | 'lab' | 'radiology';

interface DiagnosticReviewViewProps {
  kind: Extract<DiagnosticReviewKind, 'scan'>;
}

interface ReviewConfig {
  pageLabel: string;
  headline: string;
  uploadLabel: string;
  scannerTitle: string;
}

interface LensPromptConfig {
  contextHint: string;
  lensPrompt: string;
}

const REVIEW_CONFIG: Record<Extract<DiagnosticReviewKind, 'scan'>, ReviewConfig> = {
  scan: {
    pageLabel: 'Investigation',
    headline: 'Scan',
    uploadLabel: 'Upload',
    scannerTitle: 'Live Camera Scan',
  },
};

const SCAN_LENS_CONFIG: Record<ScanLens, LensPromptConfig> = {
  general: {
    contextHint: 'Analyze this clinical image and identify relevant findings with urgency signals.',
    lensPrompt:
      'Review this clinical image for key findings, danger signs, and safe next-step recommendations.',
  },
  lab: {
    contextHint: 'Analyze this laboratory report image and identify clinically relevant abnormalities.',
    lensPrompt:
      'Review this laboratory report image. Extract critical findings, dangerous abnormalities, and immediate next actions.',
  },
  radiology: {
    contextHint: 'Analyze this radiology image and identify key findings with urgency indicators.',
    lensPrompt:
      'Review this radiology image for major findings, red flags, and safe next-step recommendations.',
  },
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });

const normalizeConfidenceDisplay = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const scaled = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(scaled)));
};

const nextScanReviewId = (): string => `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createReviewDraft = (params: {
  kind: DiagnosticReviewKind;
  lens: ScanLens;
  imageDataUrl: string;
  imageName?: string;
  previous?: DiagnosticReviewRecord | null;
}): DiagnosticReviewRecord => {
  const now = Date.now();
  return {
    id: params.previous?.id || nextScanReviewId(),
    kind: params.kind,
    lens: params.lens,
    image_data_url: params.imageDataUrl,
    image_name: params.imageName || params.previous?.image_name,
    context_note: params.previous?.context_note || '',
    analysis: params.previous?.analysis || null,
    created_at: params.previous?.created_at || now,
    updated_at: now,
  };
};

export const DiagnosticReviewView: React.FC<DiagnosticReviewViewProps> = ({ kind }) => {
  const { state, dispatch } = useClinical();
  const [scanLens, setScanLens] = useState<ScanLens>('general');
  const promptConfig = useMemo(() => SCAN_LENS_CONFIG[scanLens], [scanLens]);
  const config = REVIEW_CONFIG[kind];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const activeReview = useMemo(
    () =>
      [...state.diagnostic_reviews]
        .filter((review) => review.kind === kind)
        .sort((a, b) => b.updated_at - a.updated_at)[0] || null,
    [kind, state.diagnostic_reviews]
  );
  const imageDataUrl = activeReview?.image_data_url || '';
  const imageName = activeReview?.image_name || '';
  const contextNote = activeReview?.context_note || '';
  const analysis = activeReview?.analysis || null;
  const confidenceDisplay = useMemo(
    () => normalizeConfidenceDisplay(analysis?.confidence ?? 0),
    [analysis?.confidence]
  );
  const confidenceDonut = useMemo(() => {
    const radius = 16;
    const circumference = 2 * Math.PI * radius;
    const progress = confidenceDisplay / 100;
    return {
      radius,
      circumference,
      dashOffset: circumference * (1 - progress),
    };
  }, [confidenceDisplay]);
  const confidenceStroke = useMemo(() => {
    if (confidenceDisplay >= 85) return '#22c55e';
    if (confidenceDisplay >= 60) return '#3b82f6';
    if (confidenceDisplay >= 35) return '#f59e0b';
    return '#ef4444';
  }, [confidenceDisplay]);

  const [error, setError] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const feedback = useCallback(
    (kindValue: Parameters<typeof signalFeedback>[0] = 'select') =>
      signalFeedback(kindValue, {
        hapticsEnabled: state.settings.haptics_enabled,
        audioEnabled: state.settings.audio_enabled,
      }),
    [state.settings.audio_enabled, state.settings.haptics_enabled]
  );

  const upsertReview = useCallback(
    (review: DiagnosticReviewRecord): DiagnosticReviewRecord => {
      dispatch({ type: 'UPSERT_DIAGNOSTIC_REVIEW', payload: review });
      return review;
    },
    [dispatch]
  );

  const removeActiveReview = useCallback(() => {
    if (!activeReview) return;
    dispatch({ type: 'DELETE_DIAGNOSTIC_REVIEW', payload: activeReview.id });
  }, [activeReview, dispatch]);

  const upsertReviewArchive = useCallback(
    (review: DiagnosticReviewRecord) => {
      const now = Date.now();
      const mergedReviews = [review, ...state.diagnostic_reviews.filter((item) => item.id !== review.id)];
      const hasRedFlags = Boolean(review.analysis && review.analysis.red_flags.length > 0);
      const diagnosis = review.analysis?.summary || `${config.pageLabel} review pending interpretation`;
      const visitLabel = `${config.pageLabel} ${new Date(now).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })}`;
      const noteParts = [
        review.context_note || '',
        review.analysis?.recommendation || '',
      ].filter(Boolean);
      const complaint = `${config.pageLabel} ${review.lens} review`;
      const archive: SessionRecord = {
        id: `diagnostic-${review.id}`,
        timestamp: review.created_at,
        updated_at: now,
        source: 'scan',
        visit_label: visitLabel,
        diagnosis,
        complaint,
        notes: noteParts.join(' '),
        status: hasRedFlags ? 'emergency' : 'active',
        soap: state.soap,
        profile_snapshot: state.profile,
        clerking: { ...state.clerking },
        diagnostic_reviews: mergedReviews,
        snapshot: {
          soap: state.soap,
          ddx: [...state.ddx],
          status: hasRedFlags ? 'emergency' : 'active',
          redFlag: hasRedFlags,
          pillars: state.pillars,
          conversation: [...state.conversation],
          agent_state: { ...state.agent_state },
          probability: state.probability,
          urgency: hasRedFlags ? 'high' : state.urgency,
          thinking: state.thinking,
          clerking: { ...state.clerking },
          diagnostic_reviews: mergedReviews,
        },
        pillars: state.pillars || undefined,
      };
      dispatch({ type: 'UPSERT_ARCHIVE', payload: archive });
    },
    [
      config.pageLabel,
      dispatch,
      state.agent_state,
      state.clerking,
      state.conversation,
      state.ddx,
      state.diagnostic_reviews,
      state.pillars,
      state.probability,
      state.profile,
      state.soap,
      state.thinking,
      state.urgency,
    ]
  );

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  };

  useEffect(() => {
    if (!scannerOpen) {
      stopCameraStream();
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraReady(true);
        }
      } catch (cameraError) {
        const message =
          cameraError instanceof Error
            ? cameraError.message
            : 'Unable to access camera for scan.';
        setError(message);
        setScannerOpen(false);
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [scannerOpen]);

  useEffect(() => {
    if (!activeReview) return;
    if (activeReview.lens === scanLens) return;
    setScanLens(activeReview.lens);
  }, [activeReview, scanLens]);

  const openFilePicker = useCallback(() => {
    setError('');
    fileInputRef.current?.click();
  }, []);

  const onFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Image files only for AI review.');
      return;
    }

    try {
      const nextDataUrl = await readFileAsDataUrl(file);
      const nextReview = createReviewDraft({
        kind,
        lens: scanLens,
        imageDataUrl: nextDataUrl,
        imageName: file.name,
        previous: activeReview,
      });
      upsertReview(nextReview);
      upsertReviewArchive(nextReview);
      setError('');
      feedback('select');
    } catch (readError) {
      const message = readError instanceof Error ? readError.message : 'Unable to read image.';
      setError(message);
    }
  };

  const captureScan = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setError('Camera is not ready yet.');
      return;
    }

    const canvas = document.createElement('canvas');
    const maxEdge = 1300;
    const longest = Math.max(video.videoWidth, video.videoHeight);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      setError('Unable to capture camera frame.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageDataUrlFromCamera = canvas.toDataURL('image/jpeg', 0.86);
    const nextReview = createReviewDraft({
      kind,
      lens: scanLens,
      imageDataUrl: imageDataUrlFromCamera,
      imageName: `${config.pageLabel.toLowerCase()}-${scanLens}-scan-${Date.now()}.jpg`,
      previous: activeReview,
    });
    upsertReview(nextReview);
    upsertReviewArchive(nextReview);
    setError('');
    setScannerOpen(false);
    feedback('submit');
  };

  const runAnalysis = useCallback(async () => {
    if (!imageDataUrl) {
      setError('Upload or scan an image first.');
      return;
    }

    setAnalyzing(true);
    setError('');
    try {
      const review = await analyzeClinicalImage({
        imageDataUrl,
        clinicalContext: contextNote.trim() || promptConfig.contextHint,
        lensPrompt: promptConfig.lensPrompt,
      });
      const analyzedReview = upsertReview({
        ...(activeReview ||
          createReviewDraft({
            kind,
            lens: scanLens,
            imageDataUrl,
            imageName: imageName || `${config.pageLabel.toLowerCase()}-${scanLens}-review.jpg`,
          })),
        context_note: contextNote.trim() || undefined,
        analysis: review,
        updated_at: Date.now(),
      });
      upsertReviewArchive(analyzedReview);
      feedback('question');
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : 'AI review failed.';
      setError(message);
      feedback('error');
    } finally {
      setAnalyzing(false);
    }
  }, [
    activeReview,
    config.pageLabel,
    contextNote,
    feedback,
    imageDataUrl,
    imageName,
    kind,
    promptConfig.contextHint,
    promptConfig.lensPrompt,
    scanLens,
    upsertReview,
    upsertReviewArchive,
  ]);

  const handoffSummary = useMemo(() => {
    const lines: string[] = [`${config.pageLabel} review handoff:`];
    if (analysis) {
      lines.push(`Summary: ${analysis.summary}`);
      if (analysis.findings.length > 0) {
        lines.push(`Findings: ${analysis.findings.join('; ')}`);
      }
      if (analysis.red_flags.length > 0) {
        lines.push(`Red flags: ${analysis.red_flags.join('; ')}`);
      }
      if (analysis.spot_diagnosis?.label) {
        lines.push(
          `Spot diagnosis: ${analysis.spot_diagnosis.label}${
            analysis.spot_diagnosis.icd10 ? ` (ICD-10: ${analysis.spot_diagnosis.icd10})` : ''
          }`
        );
      }
      if (analysis.differentials && analysis.differentials.length > 0) {
        lines.push(
          `Differentials: ${analysis.differentials
            .map((item) =>
              `${item.label}${item.icd10 ? ` (ICD-10: ${item.icd10})` : ''} [${item.likelihood}]`
            )
            .join('; ')}`
        );
      }
      if (analysis.treatment_summary) {
        lines.push(`Treatment intent: ${analysis.treatment_summary}`);
      }
      if (analysis.treatment_lines && analysis.treatment_lines.length > 0) {
        lines.push(`Treatment lines: ${analysis.treatment_lines.join('; ')}`);
      }
      if (analysis.investigations && analysis.investigations.length > 0) {
        lines.push(`Investigations: ${analysis.investigations.join('; ')}`);
      }
      if (analysis.counseling && analysis.counseling.length > 0) {
        lines.push(`Counseling: ${analysis.counseling.join('; ')}`);
      }
      lines.push(`Recommendation: ${analysis.recommendation}`);
      lines.push(`Confidence: ${confidenceDisplay}%`);
    }

    if (contextNote.trim()) {
      lines.push(`Additional note: ${contextNote.trim()}`);
    }

    if (!analysis && !contextNote.trim()) {
      lines.push('No structured analysis available yet. Continue focused clinical questioning.');
    }

    return lines.join(' ');
  }, [analysis, confidenceDisplay, config.pageLabel, contextNote]);

  const pushToConsultation = useCallback(async () => {
    if (!analysis && !contextNote.trim()) {
      setError('Run AI review or add a note before sending to consultation.');
      return;
    }

    setPushing(true);
    setError('');

    try {
      const result = await processAgentInteraction(handoffSummary, state);
      if (activeReview) {
        upsertReviewArchive({
          ...activeReview,
          context_note: contextNote.trim() || activeReview.context_note,
          updated_at: Date.now(),
        });
      }
      dispatch({
        type: 'SET_AGENT_RESPONSE',
        payload: { ...result, status: result.status ?? 'active' },
        lastInput: handoffSummary,
      });
      dispatch({ type: 'SET_VIEW', payload: 'consult' });
      feedback('submit');
    } catch (handoffError) {
      const message = handoffError instanceof Error ? handoffError.message : 'Unable to send review to consultation.';
      setError(message);
      feedback('error');
    } finally {
      setPushing(false);
    }
  }, [
    activeReview,
    analysis,
    contextNote,
    dispatch,
    feedback,
    handoffSummary,
    state,
    upsertReviewArchive,
  ]);

  const exportReviewPdf = useCallback(async () => {
    if (!analysis) {
      setError('Run AI review before printing.');
      return;
    }
    const { exportDiagnosticReviewPdf } = await import('../../core/pdf/clinicalPdf');
    exportDiagnosticReviewPdf({
      generatedAt: Date.now(),
      pageLabel: config.pageLabel,
      lens: scanLens,
      confidence: confidenceDisplay,
      patient: state.profile,
      observation: analysis.summary,
      keyFindings: analysis.findings,
      differentialDiagnosis: analysis.differentials || [],
      mostLikelyDiagnosis: analysis.spot_diagnosis
        ? {
            label: analysis.spot_diagnosis.label,
            icd10: analysis.spot_diagnosis.icd10,
            confidence:
              typeof analysis.spot_diagnosis.confidence === 'number'
                ? normalizeConfidenceDisplay(analysis.spot_diagnosis.confidence)
                : undefined,
            rationale: analysis.spot_diagnosis.rationale,
          }
        : undefined,
      management: {
        recommendation: analysis.recommendation,
        summary: analysis.treatment_summary,
        lines: analysis.treatment_lines || [],
      },
      investigations: analysis.investigations || [],
      counseling: analysis.counseling || [],
      redFlags: analysis.red_flags,
      imageDataUrl,
      contextNote: contextNote.trim() || undefined,
    });
    feedback('submit');
  }, [
    analysis,
    config.pageLabel,
    confidenceDisplay,
    contextNote,
    feedback,
    imageDataUrl,
    scanLens,
    state.profile,
  ]);

  useEffect(() => {
    const applyFocusFromEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: DiagnosticEventKind; focus?: ScanLens }>).detail;
      if (!detail) return;
      if (detail.kind === 'lab' || detail.kind === 'radiology') {
        setScanLens(detail.kind);
        return;
      }
      if (detail.focus) {
        setScanLens(detail.focus);
      }
    };

    const matchesKind = (event: Event): boolean => {
      const detail = (event as CustomEvent<{ kind?: DiagnosticEventKind; focus?: ScanLens }>).detail;
      if (!detail?.kind) return true;
      return detail.kind === 'scan' || detail.kind === 'lab' || detail.kind === 'radiology';
    };

    const handleUpload = (event: Event) => {
      if (!matchesKind(event)) return;
      applyFocusFromEvent(event);
      openFilePicker();
    };

    const handleScanner = (event: Event) => {
      if (!matchesKind(event)) return;
      applyFocusFromEvent(event);
      setError('');
      setScannerOpen(true);
      feedback('select');
    };

    const handleReview = (event: Event) => {
      if (!matchesKind(event)) return;
      applyFocusFromEvent(event);
      void runAnalysis();
    };

    const handleSend = (event: Event) => {
      if (!matchesKind(event)) return;
      applyFocusFromEvent(event);
      void pushToConsultation();
    };
    const handlePrint = (event: Event) => {
      if (!matchesKind(event)) return;
      applyFocusFromEvent(event);
      void exportReviewPdf();
    };

    window.addEventListener('drdyrane:diagnostic:open-upload', handleUpload);
    window.addEventListener('drdyrane:diagnostic:open-scanner', handleScanner);
    window.addEventListener('drdyrane:diagnostic:run-review', handleReview);
    window.addEventListener('drdyrane:diagnostic:send-consult', handleSend);
    window.addEventListener('drdyrane:diagnostic:print-review', handlePrint);

    return () => {
      window.removeEventListener('drdyrane:diagnostic:open-upload', handleUpload);
      window.removeEventListener('drdyrane:diagnostic:open-scanner', handleScanner);
      window.removeEventListener('drdyrane:diagnostic:run-review', handleReview);
      window.removeEventListener('drdyrane:diagnostic:send-consult', handleSend);
      window.removeEventListener('drdyrane:diagnostic:print-review', handlePrint);
    };
  }, [exportReviewPdf, feedback, openFilePicker, pushToConsultation, runAnalysis]);

  return (
    <>
      <div className="flex-1 w-full min-w-0 overflow-x-hidden px-2 py-4 space-y-4 animate-emergence">
        <section className="surface-raised rounded-[24px] p-4 space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void onFileSelected(event)}
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={openFilePicker}
              className="h-11 rounded-2xl surface-strong text-xs font-semibold inline-flex items-center justify-center gap-1.5 interactive-tap"
            >
              <ImagePlus size={14} />
              {config.uploadLabel}
            </button>
            <button
              onClick={() => {
                setError('');
                setScannerOpen(true);
                feedback('select');
              }}
              className="h-11 rounded-2xl surface-strong text-xs font-semibold inline-flex items-center justify-center gap-1.5 interactive-tap"
            >
              <Camera size={14} />
              Scan
            </button>
          </div>

          {imageDataUrl && (
            <div className="surface-strong rounded-[20px] p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-content-dim truncate">{imageName || 'Selected image'}</p>
                <button
                  onClick={() => {
                    removeActiveReview();
                    feedback('select');
                  }}
                  className="h-8 w-8 rounded-full surface-chip inline-flex items-center justify-center interactive-tap"
                  aria-label="Remove selected image"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="rounded-2xl overflow-hidden bg-surface-muted">
                <img src={imageDataUrl} alt="Clinical upload preview" className="w-full max-h-[210px] object-cover" />
              </div>
            </div>
          )}

          {imageDataUrl ? (
            <>
              <div className="surface-strong rounded-[20px] p-3 space-y-2">
                <label className="text-[11px] text-content-dim uppercase tracking-wide">Clinical Note</label>
                <textarea
                  value={contextNote}
                  onChange={(event) => {
                    if (!activeReview) return;
                    upsertReview({
                      ...activeReview,
                      context_note: event.target.value,
                      updated_at: Date.now(),
                    });
                  }}
                  rows={3}
                  placeholder="Context, symptoms, timing, and what you want the review to focus on"
                  className="w-full resize-none text-sm text-content-primary leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => void runAnalysis()}
                  disabled={analyzing || !imageDataUrl}
                  className="h-11 rounded-2xl cta-live text-xs font-semibold inline-flex items-center justify-center gap-1.5 interactive-tap disabled:opacity-55"
                >
                  {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {analyzing ? 'Reviewing...' : 'AI Review'}
                </button>

                <button
                  onClick={() => void pushToConsultation()}
                  disabled={pushing || (!analysis && !contextNote.trim())}
                  className="h-11 rounded-2xl surface-strong text-xs font-semibold inline-flex items-center justify-center gap-1.5 interactive-tap disabled:opacity-55"
                >
                  {pushing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send to Consult
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs text-content-dim leading-relaxed">
              Upload or scan an image to continue.
            </p>
          )}

          {error && (
            <p className="text-xs text-danger-primary inline-flex items-start gap-1.5">
              <TriangleAlert size={13} className="mt-0.5" />
              {error}
            </p>
          )}
        </section>

        {analysis && (
          <section className="surface-raised rounded-[24px] p-4 space-y-3 pb-24">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-content-dim uppercase tracking-wide">Review Output</p>
              <div className="inline-flex items-center gap-2 surface-chip rounded-full">
                <svg width="38" height="38" viewBox="0 0 38 38" aria-label="Confidence meter">
                  <circle
                    cx="19"
                    cy="19"
                    r={confidenceDonut.radius}
                    stroke="currentColor"
                    strokeOpacity="0.18"
                    strokeWidth="4"
                    fill="none"
                  />
                  <circle
                    cx="19"
                    cy="19"
                    r={confidenceDonut.radius}
                    stroke={confidenceStroke}
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={confidenceDonut.circumference}
                    strokeDashoffset={confidenceDonut.dashOffset}
                    transform="rotate(-90 19 19)"
                  />
                  <text
                    x="19"
                    y="22"
                    textAnchor="middle"
                    className="fill-current text-[9px] font-semibold"
                  >
                    {confidenceDisplay}
                  </text>
                </svg>
              </div>
            </div>

            <div className="surface-strong rounded-2xl p-3 space-y-2">
              <p className="text-[11px] text-content-dim uppercase tracking-wide">Observation</p>
              <p className="text-sm text-content-primary leading-relaxed">{analysis.summary}</p>
            </div>

            <div className="surface-strong rounded-2xl p-3 space-y-2">
              <p className="text-[11px] text-content-dim uppercase tracking-wide">Key Findings</p>
              {analysis.findings.length > 0 ? (
                <div className="space-y-1.5">
                  {analysis.findings.map((item, index) => (
                    <p key={`${item}-${index}`} className="text-sm text-content-primary leading-snug">
                      {index + 1}. {item}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-content-secondary leading-relaxed">
                  No key findings extracted yet.
                </p>
              )}
            </div>

            <div className="surface-strong rounded-2xl p-3 space-y-2">
              <p className="text-[11px] text-content-dim uppercase tracking-wide">Differential Diagnosis</p>
              {analysis.differentials && analysis.differentials.length > 0 ? (
                <div className="space-y-1.5">
                  {analysis.differentials.map((item, index) => (
                    <p key={`${item.label}-${index}`} className="text-sm text-content-primary leading-snug">
                      {index + 1}. {item.label}
                      {item.icd10 ? ` (ICD-10: ${item.icd10})` : ''} [{item.likelihood}]
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-content-secondary leading-relaxed">
                  Differential list not generated yet.
                </p>
              )}
            </div>

            <div className="surface-strong rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[11px] text-content-dim uppercase tracking-wide">Most Likely Diagnosis</p>
                {typeof analysis.spot_diagnosis?.confidence === 'number' && (
                  <span className="h-6 px-2.5 rounded-full surface-chip text-[10px] font-semibold inline-flex items-center">
                    {normalizeConfidenceDisplay(analysis.spot_diagnosis.confidence)}%
                  </span>
                )}
              </div>
              {analysis.spot_diagnosis?.label ? (
                <>
                  <p className="text-sm text-content-primary leading-relaxed font-semibold">
                    {analysis.spot_diagnosis.label}
                    {analysis.spot_diagnosis.icd10 ? ` (ICD-10: ${analysis.spot_diagnosis.icd10})` : ''}
                  </p>
                  {analysis.spot_diagnosis.rationale && (
                    <p className="text-sm text-content-secondary leading-relaxed">
                      {analysis.spot_diagnosis.rationale}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-content-secondary leading-relaxed">
                  Most likely diagnosis is not available yet.
                </p>
              )}
            </div>

            <div className="surface-strong rounded-2xl p-3 space-y-2">
              <p className="text-[11px] text-content-dim uppercase tracking-wide">Management</p>
              <p className="text-sm text-content-primary leading-relaxed">{analysis.recommendation}</p>
              {analysis.treatment_summary && (
                <p className="text-sm text-content-secondary leading-relaxed">
                  {analysis.treatment_summary}
                </p>
              )}
              {analysis.treatment_lines && analysis.treatment_lines.length > 0 && (
                <div className="space-y-1.5">
                  {analysis.treatment_lines.map((item, index) => (
                    <p key={`${item}-${index}`} className="text-sm text-content-primary leading-snug">
                      {index + 1}. {item}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="surface-strong rounded-2xl p-3 space-y-2">
              <p className="text-[11px] text-content-dim uppercase tracking-wide">Investigations</p>
              {analysis.investigations && analysis.investigations.length > 0 ? (
                <div className="space-y-1.5">
                  {analysis.investigations.map((item, index) => (
                    <p key={`${item}-${index}`} className="text-sm text-content-primary leading-snug">
                      {index + 1}. {item}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-content-secondary leading-relaxed">
                  No investigations suggested yet.
                </p>
              )}
            </div>

            <div className="surface-strong rounded-2xl p-3 space-y-2">
              <p className="text-[11px] text-content-dim uppercase tracking-wide">Counseling</p>
              {analysis.counseling && analysis.counseling.length > 0 ? (
                <div className="space-y-1.5">
                  {analysis.counseling.map((item, index) => (
                    <p key={`${item}-${index}`} className="text-sm text-content-primary leading-snug">
                      {index + 1}. {item}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-content-secondary leading-relaxed">
                  Counseling points not generated yet.
                </p>
              )}
            </div>

            <div className="surface-strong rounded-2xl p-3 space-y-2">
              <p className="text-[11px] text-danger-primary uppercase tracking-wide">Red Flags</p>
              {analysis.red_flags.length > 0 ? (
                <div className="space-y-1.5">
                  {analysis.red_flags.map((flag, index) => (
                    <p key={`${flag}-${index}`} className="text-sm text-content-primary leading-snug">
                      {index + 1}. {flag}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-content-secondary leading-relaxed">
                  No immediate red flags extracted.
                </p>
              )}
            </div>

            <button
              onClick={() => void exportReviewPdf()}
              className="h-11 w-full rounded-2xl cta-live text-xs font-semibold inline-flex items-center justify-center gap-1.5 interactive-tap"
            >
              <Printer size={14} />
              Print PDF
            </button>
          </section>
        )}

        {!analysis && (
          <section className="surface-raised rounded-[24px] p-4 pb-24">
            <p className="text-sm text-content-secondary leading-relaxed">
              Upload or scan first, run AI review, then send structured findings back into consultation reasoning.
            </p>
          </section>
        )}
      </div>

      <OverlayPortal>
        <AnimatePresence>
          {scannerOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setScannerOpen(false)}
                className="fixed inset-0 z-[140] overlay-backdrop backdrop-blur-sm"
              />

              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 h-[82vh] max-w-[440px] mx-auto z-[150] rounded-t-[32px] ios-sheet-surface shadow-modal pointer-events-auto flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-center pt-2 pb-1">
                  <span className="h-1 w-11 rounded-full surface-chip" />
                </div>

                <div className="px-5 py-4 flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-content-dim font-medium">Scanner</p>
                    <p className="text-sm text-content-primary font-semibold">{config.scannerTitle}</p>
                  </div>
                  <button
                    onClick={() => setScannerOpen(false)}
                    className="h-10 w-10 rounded-full surface-strong flex items-center justify-center interactive-tap"
                    aria-label="Close scanner"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="flex-1 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] flex flex-col gap-4">
                  <div className="flex-1 rounded-[24px] overflow-hidden bg-surface-muted relative">
                    <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
                    {!cameraReady && (
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-content-secondary">
                        Preparing camera...
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setScannerOpen(false)}
                      className="h-11 rounded-2xl surface-strong text-xs font-semibold inline-flex items-center justify-center gap-1.5 interactive-tap"
                    >
                      <X size={14} />
                      Cancel
                    </button>
                    <button
                      onClick={captureScan}
                      className="h-11 rounded-2xl cta-live text-xs font-semibold inline-flex items-center justify-center gap-1.5 interactive-tap"
                    >
                      <ClipboardCheck size={14} />
                      Capture
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </OverlayPortal>
    </>
  );
};
