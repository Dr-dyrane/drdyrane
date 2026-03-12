import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Camera,
  ClipboardCheck,
  ImagePlus,
  Loader2,
  Send,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';
import { signalFeedback } from '../../core/services/feedback';
import { analyzeClinicalImage, VisionAnalysisResult } from '../../core/api/visionEngine';
import { processAgentInteraction } from '../../core/api/agentCoordinator';
import { OverlayPortal } from '../../components/shared/OverlayPortal';
import { Orb } from '../consultation/Orb';

export type DiagnosticReviewKind = 'scan';
type DiagnosticEventKind = DiagnosticReviewKind | 'lab' | 'radiology';
type ScanLens = 'general' | 'lab' | 'radiology';

interface DiagnosticReviewViewProps {
  kind: DiagnosticReviewKind;
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

const REVIEW_CONFIG: Record<DiagnosticReviewKind, ReviewConfig> = {
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

const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(Math.round(rounded)) : String(rounded);
};

export const DiagnosticReviewView: React.FC<DiagnosticReviewViewProps> = ({ kind }) => {
  const { state, dispatch } = useClinical();
  const [scanLens, setScanLens] = useState<ScanLens>('general');
  const promptConfig = useMemo(() => SCAN_LENS_CONFIG[scanLens], [scanLens]);
  const config = REVIEW_CONFIG[kind];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [imageDataUrl, setImageDataUrl] = useState<string>('');
  const [imageName, setImageName] = useState<string>('');
  const [contextNote, setContextNote] = useState<string>('');
  const [analysis, setAnalysis] = useState<VisionAnalysisResult | null>(null);
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
      setImageDataUrl(nextDataUrl);
      setImageName(file.name);
      setAnalysis(null);
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
    setImageDataUrl(canvas.toDataURL('image/jpeg', 0.86));
    setImageName(`${config.pageLabel.toLowerCase()}-${scanLens}-scan-${Date.now()}.jpg`);
    setAnalysis(null);
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
      setAnalysis(review);
      feedback('question');
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : 'AI review failed.';
      setError(message);
      feedback('error');
    } finally {
      setAnalyzing(false);
    }
  }, [contextNote, feedback, imageDataUrl, promptConfig.contextHint, promptConfig.lensPrompt]);

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
      lines.push(`Recommendation: ${analysis.recommendation}`);
      lines.push(`Confidence: ${analysis.confidence}%`);
    }

    if (contextNote.trim()) {
      lines.push(`Additional note: ${contextNote.trim()}`);
    }

    if (!analysis && !contextNote.trim()) {
      lines.push('No structured analysis available yet. Continue focused clinical questioning.');
    }

    return lines.join(' ');
  }, [analysis, config.pageLabel, contextNote]);

  const pushToConsultation = useCallback(async () => {
    if (!analysis && !contextNote.trim()) {
      setError('Run AI review or add a note before sending to consultation.');
      return;
    }

    setPushing(true);
    setError('');

    try {
      const result = await processAgentInteraction(handoffSummary, state);
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
  }, [analysis, contextNote, dispatch, feedback, handoffSummary, state]);

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

    window.addEventListener('drdyrane:diagnostic:open-upload', handleUpload);
    window.addEventListener('drdyrane:diagnostic:open-scanner', handleScanner);
    window.addEventListener('drdyrane:diagnostic:run-review', handleReview);
    window.addEventListener('drdyrane:diagnostic:send-consult', handleSend);

    return () => {
      window.removeEventListener('drdyrane:diagnostic:open-upload', handleUpload);
      window.removeEventListener('drdyrane:diagnostic:open-scanner', handleScanner);
      window.removeEventListener('drdyrane:diagnostic:run-review', handleReview);
      window.removeEventListener('drdyrane:diagnostic:send-consult', handleSend);
    };
  }, [feedback, openFilePicker, pushToConsultation, runAnalysis]);

  return (
    <>
      <div className="flex-1 w-full min-w-0 overflow-x-hidden px-2 py-7 space-y-5 animate-emergence">
        <div className="flex justify-center">
          <Orb />
        </div>

        <div className="text-center space-y-2">
          <span className="text-content-dim text-xs font-medium">{config.pageLabel}</span>
          <h1 className="display-type text-[1.7rem] text-content-primary leading-tight">{config.headline}</h1>
          <p className="text-xs text-content-dim leading-relaxed px-2">
            Upload labs, radiology, wounds, rashes, or other clinical images for one-pass review.
          </p>
        </div>

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
                    setImageDataUrl('');
                    setImageName('');
                    setAnalysis(null);
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

          <div className="surface-strong rounded-[20px] p-3 space-y-2">
            <label className="text-[11px] text-content-dim uppercase tracking-wide">Clinical Note</label>
            <textarea
              value={contextNote}
              onChange={(event) => setContextNote(event.target.value)}
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
              disabled={pushing}
              className="h-11 rounded-2xl surface-strong text-xs font-semibold inline-flex items-center justify-center gap-1.5 interactive-tap disabled:opacity-55"
            >
              {pushing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send to Consult
            </button>
          </div>

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
              <span className="h-7 px-3 rounded-full surface-chip text-[11px] font-semibold inline-flex items-center">
                {formatNumber(analysis.confidence)}% confidence
              </span>
            </div>

            <div className="surface-strong rounded-2xl p-3 space-y-2">
              <p className="text-[11px] text-content-dim uppercase tracking-wide">Summary</p>
              <p className="text-sm text-content-primary leading-relaxed">{analysis.summary}</p>
            </div>

            {analysis.findings.length > 0 && (
              <div className="surface-strong rounded-2xl p-3 space-y-2">
                <p className="text-[11px] text-content-dim uppercase tracking-wide">Key Findings</p>
                <div className="space-y-1.5">
                  {analysis.findings.map((item, index) => (
                    <p key={`${item}-${index}`} className="text-sm text-content-primary leading-snug">
                      {index + 1}. {item}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="surface-strong rounded-2xl p-3 space-y-2">
              <p className="text-[11px] text-content-dim uppercase tracking-wide">Recommendation</p>
              <p className="text-sm text-content-primary leading-relaxed">{analysis.recommendation}</p>
            </div>

            {analysis.red_flags.length > 0 && (
              <div className="surface-strong rounded-2xl p-3 space-y-2">
                <p className="text-[11px] text-danger-primary uppercase tracking-wide">Red Flags</p>
                <div className="space-y-1.5">
                  {analysis.red_flags.map((flag, index) => (
                    <p key={`${flag}-${index}`} className="text-sm text-content-primary leading-snug">
                      {index + 1}. {flag}
                    </p>
                  ))}
                </div>
              </div>
            )}
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
