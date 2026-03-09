import React from 'react';
import { motion } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';

export const Orb: React.FC<{ loading?: boolean }> = ({ loading }) => {
  const { state } = useClinical();

  const isEmergency = state.status === 'emergency';
  const isActive = state.status !== 'idle' && state.status !== 'complete';

  return (
    <div className={`flex flex-col items-center justify-center transition-all duration-700 ${isActive ? 'h-12 scale-[0.4]' : 'h-32 pt-4'}`}>
      <div className="relative flex items-center justify-center translate-y-2">
        {/* The 'Living' Logo (Globe) */}
        <motion.div
          animate={{
            filter: isEmergency
              ? 'drop-shadow(0 0 20px rgba(255, 49, 49, 0.4))'
              : loading
                ? ['drop-shadow(0 0 10px rgba(0, 243, 255, 0.2))', 'drop-shadow(0 0 30px rgba(0, 243, 255, 0.5))', 'drop-shadow(0 0 10px rgba(0, 243, 255, 0.2))']
                : 'drop-shadow(0 0 10px rgba(0, 243, 255, 0.1))',
            scale: isEmergency ? [1, 1.05, 1] : loading ? [0.98, 1.02, 0.98] : 1
          }}
          transition={{
            repeat: Infinity,
            duration: loading ? 1.5 : 4,
            ease: "easeInOut"
          }}
          className="relative z-10"
        >
          <motion.img
            src={state.theme === 'dark' ? "/logo.png" : "/logo_light.png"}
            alt="Dr. Dyrane AI"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.8 }}
            className="w-32 h-32 object-contain transition-all duration-1000"
          />
        </motion.div>

        {/* Atmospheric Pulse (Rule 21) */}
        {loading && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
            className="absolute inset-0 bg-neon-cyan/10 rounded-full blur-2xl"
          />
        )}
      </div>
    </div>
  );
};
