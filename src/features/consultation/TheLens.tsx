import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { Camera } from 'lucide-react';
import { processAgentInteraction } from '../../core/api/agentCoordinator';
import { signalFeedback } from '../../core/services/feedback';
import { resolveTheme } from '../../core/theme/resolveTheme';
import { analyzeClinicalImage } from '../../core/api/visionEngine';

export const TheLens: React.FC = () => {
  const { state, dispatch } = useClinical();
  const [active, setActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const attachStream = async () => {
      if (!active || !videoRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Camera access failed:', error);
      }
    };

    const stopStream = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    void attachStream();

    return () => {
      stopStream();
    };
  }, [active]);

  const returnToConsultation = async (visualInput: string) => {
    try {
      const result = await processAgentInteraction(visualInput, state);
      dispatch({
        type: 'SET_AGENT_RESPONSE',
        payload: { ...result, status: 'active' },
        lastInput: visualInput,
      });
      signalFeedback('question', {
        hapticsEnabled: state.settings.haptics_enabled,
        audioEnabled: state.settings.audio_enabled,
      });
    } catch (error) {
      console.error('Lens handoff failed:', error);
      dispatch({
        type: 'SET_AGENT_RESPONSE',
        payload: {
          status: 'active',
          thinking: 'Visual capture unavailable. Continuing with symptom history.',
        },
      });
      signalFeedback('error', {
        hapticsEnabled: state.settings.haptics_enabled,
        audioEnabled: state.settings.audio_enabled,
      });
    }
  };

  const captureFrameDataUrl = (): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;
    const canvas = document.createElement('canvas');
    const maxEdge = 1024;
    const longest = Math.max(video.videoWidth, video.videoHeight);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.84);
  };

  const handleCapture = async () => {
    setAnalyzing(true);
    signalFeedback('submit', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
    try {
      const imageDataUrl = captureFrameDataUrl();
      if (!imageDataUrl) {
        throw new Error('Unable to capture frame from camera.');
      }

      const latestDoctorQuestion = [...state.conversation]
        .reverse()
        .find((entry) => entry.role === 'doctor')?.content;

      const analysis = await analyzeClinicalImage({
        imageDataUrl,
        clinicalContext: state.thinking || state.agent_state.focus_area,
        lensPrompt:
          latestDoctorQuestion ||
          'Review this image for clinically relevant morphology and urgency signals.',
      });

      const findingText = analysis.findings.length > 0
        ? analysis.findings.join('; ')
        : 'No dominant visual abnormalities detected.';
      const redFlagText = analysis.red_flags.length > 0
        ? `Possible red flags: ${analysis.red_flags.join('; ')}.`
        : 'No immediate red flag visual cues detected.';
      const spotDxText = analysis.spot_diagnosis?.label
        ? `Spot diagnosis: ${analysis.spot_diagnosis.label}${
            analysis.spot_diagnosis.icd10 ? ` (ICD-10: ${analysis.spot_diagnosis.icd10})` : ''
          }.`
        : 'Spot diagnosis not established from image alone.';
      const differentialText =
        analysis.differentials.length > 0
          ? `Differentials: ${analysis.differentials
              .map(
                (entry) =>
                  `${entry.label}${entry.icd10 ? ` (${entry.icd10})` : ''} [${entry.likelihood}]`
              )
              .join('; ')}.`
          : 'No ranked differentials available.';
      const visualInput = `Visual analysis summary: ${analysis.summary}. Findings: ${findingText}. ${redFlagText} ${spotDxText} ${differentialText} Recommendation: ${analysis.recommendation}. Confidence: ${analysis.confidence}%.`;
      await returnToConsultation(visualInput);
    } catch (error) {
      console.error('Lens analysis failed:', error);
      const visualInput =
        'Visual review unavailable. No reliable image interpretation captured. Continue with focused history and symptom progression.';
      await returnToConsultation(visualInput);
    } finally {
      setAnalyzing(false);
      setActive(false);
    }
  };

  const handleSkip = () => {
    signalFeedback('select', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
    setActive(false);
    dispatch({
      type: 'SET_AGENT_RESPONSE',
      payload: {
        status: 'active',
        thinking: 'Lens skipped. Continuing structured history collection.',
      },
    });
  };

  if (state.status !== 'lens' && !active) return null;
  const isDark = resolveTheme(state.theme) === 'dark';

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-surface-primary">
      <motion.div 
        layoutId="orb"
        className="relative w-full h-full flex flex-col"
      >
        {!active ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 space-y-12 text-center bg-surface-primary">
            <div className="space-y-4">
              <h2 className="display-type text-[1.9rem] text-content-primary leading-tight tracking-tight">Show Dr. Dyrane.</h2>
              <p className="text-content-dim text-sm max-w-[280px] mx-auto leading-relaxed">
                Optical analysis helps determine morphology, vascularity, and clinical margins.
              </p>
            </div>
            <button 
              onClick={() => setActive(true)}
              className="w-20 h-20 surface-raised rounded-full flex items-center justify-center text-accent-primary transition-all active:scale-95 interactive-tap"
            >
              <Camera className="w-8 h-8 opacity-60" />
            </button>
            <button 
               onClick={handleSkip}
               className="text-sm font-medium text-content-dim hover:text-content-primary transition-all bg-transparent"
             >
               Skip visual analysis
             </button>
          </div>
        ) : (
          <div className="absolute inset-0">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className={`w-full h-full object-cover grayscale brightness-125 ${isDark ? 'opacity-40' : 'opacity-60'}`}
            />
            
            {/* Viewfinder */}
            <div className="absolute inset-0 border-none pointer-events-none lens-vignette" />
            <div className="absolute inset-12 rounded-[56px] lens-frame pointer-events-none" />
            
            <div className="absolute bottom-16 left-0 right-0 flex justify-center items-center gap-16">
              <button 
                onClick={() => setActive(false)}
                className="text-content-dim text-sm font-medium bg-transparent"
              >
                Cancel
              </button>
              <button 
                onClick={handleCapture}
                disabled={analyzing}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                   analyzing ? 'bg-surface-muted' : 'bg-surface-active text-content-active active:scale-90 shadow-2xl'
                }`}
              >
                <Camera className="w-6 h-6" />
              </button>
              <div className="w-10" />
            </div>
            
            <AnimatePresence>
               {analyzing && (
                 <motion.div 
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   exit={{ opacity: 0 }}
                   className="absolute inset-0 bg-surface-primary/60 backdrop-blur-xl flex items-center justify-center"
                 >
                   <div className="text-center space-y-8">
                      <motion.div 
                        animate={{ 
                          scale: [1, 1.2, 1],
                          opacity: [0.3, 0.7, 0.3],
                          boxShadow: [
                            'var(--analysis-pulse-soft)',
                            'var(--analysis-pulse-strong)',
                            'var(--analysis-pulse-soft)'
                          ]
                        }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="w-16 h-16 bg-accent-soft rounded-full mx-auto flex items-center justify-center"
                      >
                         <div className="w-4 h-4 bg-accent-primary rounded-full" />
                      </motion.div>
                      <span className="text-lg font-medium text-content-primary">Analyzing clinical visuals</span>
                   </div>
                 </motion.div>
               )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  );
};

