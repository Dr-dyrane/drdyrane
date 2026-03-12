import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, MapPin, Share2 } from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';
import { getNearestED, generateSBAR } from '../../core/services/triage';

export const EmergencyOverlay: React.FC = () => {
  const { state } = useClinical();
  const [edUrl, setEdUrl] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === 'emergency') {
      getNearestED().then(setEdUrl);
    }
  }, [state.status]);

  const handleShareSBAR = () => {
    const sbar = generateSBAR(state);
    const text = `SBAR REPORT:\n\nS: ${sbar.situation}\nB: ${sbar.background}\nA: ${sbar.assessment}\nR: ${sbar.recommendation}`;
    if (navigator.share) {
      navigator.share({ title: 'SBAR Report', text: text });
    } else {
      navigator.clipboard.writeText(text);
      alert('SBAR Report copied to clipboard for emergency staff.');
    }
  };

  return (
    <AnimatePresence>
      {state.status === 'emergency' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[270] bg-danger-soft backdrop-blur-md p-6 flex flex-col items-center justify-center text-center space-y-10 overflow-hidden"
        >
          <div className="space-y-4">
            <AlertCircle className="w-16 h-16 text-danger-primary mx-auto animate-pulse emergency-icon-glow" />
            <h1 className="text-3xl font-bold text-danger-primary tracking-tight leading-none uppercase">EMERGENCY</h1>
            <p className="text-lg text-content-primary/60 font-light">
              Must-not-miss pathophysiology detected.
            </p>
          </div>

          <div className="flex flex-col gap-4 w-full">
            <a
              href={edUrl || '#'}
              target="_blank"
              rel="noreferrer"
              className="cta-danger p-5 rounded-[24px] text-lg font-bold flex items-center justify-center gap-3 transition-transform active:scale-95 shadow-lg border-none outline-none"
            >
              <MapPin size={20} /> Nearest ED
            </a>
            <button
              onClick={handleShareSBAR}
              className="bg-surface-muted/10 text-content-primary p-5 rounded-[24px] text-lg font-bold flex items-center justify-center gap-3 transition-transform active:scale-95 border-none outline-none"
            >
              <Share2 size={20} /> Show SBAR
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
