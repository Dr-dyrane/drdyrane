import React from 'react';
import { motion } from 'framer-motion';
import { useTypewriter } from '../hooks/useTypewriter';

interface ClinicalQuestionCardProps {
  statement?: string;
  question: string;
  reducedMotion?: boolean;
}

export const ClinicalQuestionCard: React.FC<ClinicalQuestionCardProps> = ({
  statement,
  question,
  reducedMotion = false,
}) => {
  const typedQuestion = useTypewriter(question, { speedMs: 16, reducedMotion });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="surface-raised rounded-[30px] px-5 py-6 shadow-glass h-[176px] sm:h-[188px] flex flex-col justify-center overflow-hidden"
    >
      {statement && (
        <p className="text-[10px] uppercase tracking-[0.28em] text-neon-cyan/75 font-semibold text-center mb-3">
          {statement}
        </p>
      )}
      <h2 aria-live="polite" className="display-type text-[1.9rem] font-medium leading-tight tracking-tight text-content-primary text-center">
        {typedQuestion}
        {!reducedMotion && typedQuestion.length < question.length && (
          <span className="inline-block w-[0.5ch] animate-pulse opacity-70">|</span>
        )}
      </h2>
    </motion.div>
  );
};
