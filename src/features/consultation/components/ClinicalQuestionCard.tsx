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
      ? 'text-[1rem] sm:text-[1.08rem] leading-snug'
      : questionLength > 150
        ? 'text-[1.05rem] sm:text-[1.14rem] leading-snug'
      : questionLength > 110
        ? 'text-[1.1rem] sm:text-[1.2rem] leading-tight'
        : 'text-[1.2rem] sm:text-[1.3rem] leading-tight';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="surface-raised rounded-[24px] px-4 py-4 shadow-glass min-h-[128px] sm:min-h-[140px] flex flex-col justify-center"
    >
      {statement && (
        <p className="text-xs tracking-wide text-accent-soft font-medium text-left mb-2">
          {statement}
        </p>
      )}
      <h2
        aria-live="polite"
        className={`display-type ${questionSizeClass} font-semibold tracking-tight text-content-primary text-left break-words hyphens-auto min-h-[64px] max-h-[124px] overflow-y-auto no-scrollbar flex items-center pr-1`}
      >
        {typedQuestion}
        {!reducedMotion && typedQuestion.length < question.length && (
          <span className="inline-block w-[0.5ch] animate-pulse opacity-70">|</span>
        )}
      </h2>
    </motion.div>
  );
};

