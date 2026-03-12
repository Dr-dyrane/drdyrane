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
  const questionLength = question.trim().length;
  const questionSizeClass =
    questionLength > 185
      ? 'text-[1.04rem] sm:text-[1.2rem] leading-snug'
      : questionLength > 150
        ? 'text-[1.2rem] sm:text-[1.32rem] leading-snug'
      : questionLength > 110
        ? 'text-[1.35rem] sm:text-[1.5rem] leading-tight'
        : 'text-[1.65rem] sm:text-[1.9rem] leading-tight';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="surface-raised rounded-[30px] px-5 py-6 shadow-glass min-h-[182px] sm:min-h-[198px] flex flex-col justify-center"
    >
      {statement && (
        <p className="text-[10px] uppercase tracking-[0.28em] text-accent-soft font-semibold text-center mb-3">
          {statement}
        </p>
      )}
      <h2
        aria-live="polite"
        className={`display-type ${questionSizeClass} font-medium tracking-tight text-content-primary text-center break-words hyphens-auto min-h-[88px] max-h-[118px] overflow-y-auto no-scrollbar flex items-center justify-center pr-1`}
      >
        {typedQuestion}
        {!reducedMotion && typedQuestion.length < question.length && (
          <span className="inline-block w-[0.5ch] animate-pulse opacity-70">|</span>
        )}
      </h2>
    </motion.div>
  );
};
