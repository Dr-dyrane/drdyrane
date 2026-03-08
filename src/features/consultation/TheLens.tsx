import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { Camera, RefreshCw } from 'lucide-react';

export const TheLens: React.FC = () => {
  const { state, dispatch } = useClinical();
  const [active, setActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (active && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        });
    }
  }, [active]);

  const handleCapture = async () => {
    setAnalyzing(true);
    // Simulate AI visual biomarker extraction
    setTimeout(() => {
      setAnalyzing(false);
      setActive(false);
      dispatch({ type: 'SET_INPUT', payload: 'Optical biomarkers extracted. Analysis: No suspicious morphology detected.' });
    }, 3000);
  };

  if (state.status !== 'lens' && !active) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <motion.div 
        layoutId="orb"
        className="relative w-full h-full flex flex-col"
      >
        {!active ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 space-y-8 text-center bg-[var(--bg-primary)]">
            <div className="space-y-2">
              <span className="text-neon-cyan/40 uppercase tracking-[0.3em] text-[10px] font-bold">Vision Bridge</span>
              <h2 className="text-2xl font-light text-[var(--text-primary)] leading-tight">Initialize Optical Biomarker Scan</h2>
            </div>
            <button 
              onClick={() => setActive(true)}
              className="w-24 h-24 bg-neon-cyan/10 rounded-full flex items-center justify-center text-neon-cyan ring-none border-none active:scale-90 transition-all shadow-[0_0_20px_var(--accent-glow)]"
            >
              <Camera className="w-10 h-10" />
            </button>
            <p className="text-[var(--text-dim)] text-sm font-light max-w-xs">
              This allowing Dr. Dyrane to analyze morphology, vascularity, and clinical margins.
            </p>
          </div>
        ) : (
          <div className="absolute inset-0">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover"
            />
            
            {/* Viewfinder Scopes */}
            <div className="absolute inset-0 border-none shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] pointer-events-none" />
            <div className="absolute inset-8 rounded-[48px] pointer-events-none border-none shadow-[0_0_0_1px_rgba(255,255,255,0.05)]">
               <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1 bg-black rounded-full border-none">
                  <span className="text-neon-cyan text-[8px] uppercase tracking-widest font-bold">Targeting Array</span>
               </div>
            </div>
            
            <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-12">
              <button 
                onClick={() => setActive(false)}
                className="text-[var(--text-dim)] uppercase tracking-widest text-[10px] font-bold border-none outline-none bg-transparent"
              >
                Abort
              </button>
              <button 
                onClick={handleCapture}
                disabled={analyzing}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all border-none outline-none ${
                  analyzing ? 'bg-white/10' : 'bg-white text-black active:scale-90 shadow-[0_0_30px_rgba(255,255,255,0.4)]'
                }`}
              >
                {analyzing ? <RefreshCw className="animate-spin" /> : <Camera />}
              </button>
              <div className="w-12" />
            </div>
            
            {analyzing && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center">
                <div className="text-center space-y-4">
                   <motion.div 
                     animate={{ rotate: 360 }}
                     transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                     className="w-12 h-12 border-2 border-[var(--text-dim)] border-t-neon-cyan rounded-full mx-auto"
                   />
                  <div className="text-neon-cyan text-[10px] font-bold tracking-[0.4em] animate-pulse">EXTRACTING BIOMARKERS</div>
                  <div className="text-[var(--text-dim)] text-[8px] tracking-[0.2em] font-light">ANALYZING MORPHOLOGY • MARGINS • VASCULARITY</div>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};
