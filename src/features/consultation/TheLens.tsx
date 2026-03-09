import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { Camera } from 'lucide-react';

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
  const isDark = state.theme === 'dark';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-primary">
      <motion.div 
        layoutId="orb"
        className="relative w-full h-full flex flex-col"
      >
        {!active ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 space-y-12 text-center bg-surface-primary">
            <div className="space-y-4">
              <h2 className="text-2xl font-light text-content-primary leading-tight tracking-tight">Show Dr. Dyrane.</h2>
              <p className="text-content-dim text-sm font-light max-w-[280px] mx-auto leading-relaxed">
                Optical analysis helps determine morphology, vascularity, and clinical margins.
              </p>
            </div>
            <button 
              onClick={() => setActive(true)}
              className="w-20 h-20 bg-surface-muted hover:bg-surface-muted/80 rounded-full flex items-center justify-center text-neon-cyan transition-all active:scale-95 border-none outline-none"
            >
              <Camera className="w-8 h-8 opacity-60" />
            </button>
            <button 
               onClick={() => dispatch({ type: 'RESET' })}
               className="text-[10px] uppercase tracking-[0.3em] font-bold text-content-dim hover:text-content-primary transition-all border-none outline-none bg-transparent"
             >
               Skip Visual Analysis
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
            <div className={`absolute inset-0 border-none pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,0.9)]`} />
            <div className="absolute inset-12 rounded-[56px] border border-surface-muted pointer-events-none" />
            
            <div className="absolute bottom-16 left-0 right-0 flex justify-center items-center gap-16">
              <button 
                onClick={() => setActive(false)}
                className="text-content-dim uppercase tracking-widest text-[9px] font-bold border-none outline-none bg-transparent"
              >
                Cancel
              </button>
              <button 
                onClick={handleCapture}
                disabled={analyzing}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all border-none outline-none ${
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
                            '0 0 10px rgba(0, 245, 255, 0.2)',
                            '0 0 40px rgba(0, 245, 255, 0.5)',
                            '0 0 10px rgba(0, 245, 255, 0.2)'
                          ]
                        }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="w-16 h-16 bg-neon-cyan/20 rounded-full mx-auto flex items-center justify-center"
                      >
                         <div className="w-4 h-4 bg-neon-cyan rounded-full" />
                      </motion.div>
                      <span className="text-lg font-light text-content-primary tracking-[0.2em] uppercase">Analyzing Pathophysiology</span>
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
