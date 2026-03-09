import React from 'react';
import { Sun, Moon, ClipboardList } from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';

interface HeaderProps {
  onToggleTheme: () => void;
  onToggleHx: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleTheme, onToggleHx }) => {
  const { state } = useClinical();

  return (
    <header className="fixed top-0 max-w-[440px] w-full z-40 px-6 pt-8 flex items-center justify-between pointer-events-none">
      <div className="flex items-center gap-2 pointer-events-auto">
        <img
          src={state.theme === 'dark' ? "/logo.png" : "/logo_light.png"}
          alt="Dr. Dyrane"
          className="w-5 h-5 object-contain opacity-60 drop-shadow-[0_0_8px_var(--accent-glow)]"
        />
        <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-content-dim">Dr. Dyrane</span>
      </div>
      <div className="flex items-center gap-2 pointer-events-auto">
        {state.status !== 'idle' && (
          <button
            onClick={onToggleHx}
            className="p-3 bg-surface-muted rounded-2xl active:scale-90 transition-all text-content-dim hover:text-neon-cyan border-none outline-none"
          >
            <ClipboardList size={18} />
          </button>
        )}
        <button
          onClick={onToggleTheme}
          className="p-3 bg-surface-muted rounded-2xl active:scale-90 transition-all text-content-dim hover:text-content-primary border-none outline-none"
        >
          {state.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
};
