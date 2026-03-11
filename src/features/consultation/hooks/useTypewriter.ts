import { useEffect, useMemo, useState } from 'react';

interface UseTypewriterOptions {
  speedMs?: number;
  reducedMotion?: boolean;
}

export const useTypewriter = (
  text: string,
  options: UseTypewriterOptions = {}
): string => {
  const { speedMs = 18, reducedMotion = false } = options;
  const normalizedText = useMemo(() => text || '', [text]);
  const [visibleText, setVisibleText] = useState(normalizedText);

  useEffect(() => {
    if (!normalizedText) {
      setVisibleText('');
      return;
    }

    if (reducedMotion) {
      setVisibleText(normalizedText);
      return;
    }

    let index = 0;
    setVisibleText('');
    const timer = window.setInterval(() => {
      index += 1;
      setVisibleText(normalizedText.slice(0, index));
      if (index >= normalizedText.length) {
        window.clearInterval(timer);
      }
    }, speedMs);

    return () => window.clearInterval(timer);
  }, [normalizedText, speedMs, reducedMotion]);

  return visibleText;
};
