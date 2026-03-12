import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, MapPin, Share2, Siren } from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';
import { getNearestED, generateSBAR } from '../../core/services/triage';

export const EmergencyOverlay: React.FC = () => {
  const { state } = useClinical();
  const [edUrl, setEdUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (state.status === 'emergency') {
      void getNearestED().then(setEdUrl);
    }
  }, [state.status]);

  const handleShareSBAR = async () => {
    const sbar = generateSBAR(state);
    const text = `SBAR REPORT:\n\nS: ${sbar.situation}\nB: ${sbar.background}\nA: ${sbar.assessment}\nR: ${sbar.recommendation}`;

    setSharing(true);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'SBAR Report', text });
      } else {
        await navigator.clipboard.writeText(text);
        window.alert('SBAR report copied. Show this to emergency staff.');
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <AnimatePresence>
      {state.status === 'emergency' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[270] overlay-backdrop-strong backdrop-blur-md px-5 py-[calc(env(safe-area-inset-top)+1.25rem)]"
        >
          <div className="h-full flex items-center justify-center">
            <motion.section
              initial={{ scale: 0.98, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              className="w-full max-w-[440px] ios-sheet-surface rounded-[30px] p-6 shadow-modal space-y-6"
            >
              <div className="space-y-3 text-center">
                <div className="mx-auto h-16 w-16 rounded-full bg-danger-soft text-danger-primary inline-flex items-center justify-center emergency-icon-glow">
                  <Siren size={28} />
                </div>
                <h1 className="display-type text-[1.9rem] text-danger-primary leading-none">Emergency</h1>
                <p className="text-sm text-content-secondary leading-relaxed">
                  High-risk findings detected. Seek urgent in-person assessment immediately.
                </p>
              </div>

              <div className="surface-strong rounded-[22px] p-4 space-y-2">
                <p className="text-xs text-content-dim">Immediate steps</p>
                <ul className="text-sm text-content-primary space-y-1.5">
                  <li>1. Go to the nearest emergency department now.</li>
                  <li>2. Share the SBAR report with triage staff.</li>
                  <li>3. Avoid delaying for additional home monitoring.</li>
                </ul>
              </div>

              <div className="space-y-3">
                <a
                  href={edUrl || 'https://www.google.com/maps/search/nearest+Emergency+Department'}
                  target="_blank"
                  rel="noreferrer"
                  className="h-13 rounded-2xl cta-danger text-base font-semibold inline-flex items-center justify-center gap-2.5 w-full interactive-tap"
                >
                  <MapPin size={18} />
                  Open nearest ED
                </a>

                <button
                  onClick={() => void handleShareSBAR()}
                  disabled={sharing}
                  className="h-13 rounded-2xl surface-strong text-content-primary text-base font-semibold inline-flex items-center justify-center gap-2.5 w-full interactive-tap disabled:opacity-60"
                >
                  <Share2 size={18} />
                  {sharing ? 'Preparing report...' : 'Share SBAR report'}
                </button>
              </div>

              <div className="text-center">
                <p className="text-xs text-content-dim inline-flex items-center gap-1.5">
                  <AlertCircle size={12} />
                  This guidance does not replace emergency services.
                </p>
              </div>
            </motion.section>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

