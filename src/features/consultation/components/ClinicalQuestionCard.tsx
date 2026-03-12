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
      className="surface-raised rounded-[24px] px-5 py-5 shadow-glass min-h-[168px] sm:min-h-[186px] flex flex-col justify-center"
    >
      {statement && (
        <p className="text-xs tracking-wide text-accent-soft font-medium text-center mb-3">
          {statement}
        </p>
      )}
      <h2
        aria-live="polite"
        className={`display-type ${questionSizeClass} font-semibold tracking-tight text-content-primary text-center break-words hyphens-auto min-h-[86px] max-h-[124px] overflow-y-auto no-scrollbar flex items-center justify-center pr-1`}
      >
        {typedQuestion}
        {!reducedMotion && typedQuestion.length < question.length && (
          <span className="inline-block w-[0.5ch] animate-pulse opacity-70">|</span>
        )}
      </h2>
    </motion.div>
  );
};

