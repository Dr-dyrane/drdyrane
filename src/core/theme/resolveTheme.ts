import { AppTheme } from '../types/clinical';

type ResolvedTheme = 'dark' | 'light';

const SYSTEM_QUERY = '(prefers-color-scheme: dark)';

export const resolveTheme = (theme: AppTheme): ResolvedTheme => {
  if (theme === 'dark' || theme === 'light') {
    return theme;
  }

  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'dark';
  }

  return window.matchMedia(SYSTEM_QUERY).matches ? 'dark' : 'light';
};

export const watchSystemTheme = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => undefined;
  }

  const media = window.matchMedia(SYSTEM_QUERY);
  const onChange = () => listener();

  if (media.addEventListener) {
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }

  media.addListener(onChange);
  return () => media.removeListener(onChange);
};
