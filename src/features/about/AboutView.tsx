import React from 'react';
import { GlassContainer } from '../../components/shared/GlassContainer';
import { ShieldCheck, Database, Cpu, Activity } from 'lucide-react';

export const AboutView: React.FC = () => {
  const specs = [
    { title: 'Core Processor', value: 'Anthropic Multi-Model', icon: Cpu },
    { title: 'Clinical Scope', value: 'Adult Registrar Level', icon: ShieldCheck },
    { title: 'Logic Pattern', value: 'SOAP Induction', icon: Activity },
    { title: 'Privacy Mode', value: 'Local Persistence', icon: Database },
  ];

  return (
    <div className="flex-1 px-2 py-4 space-y-4 animate-emergence">
      <div className="text-center space-y-4">
        <span className="text-content-dim text-xs font-medium">System</span>
        <h1 className="display-type text-[1.7rem] text-content-primary leading-tight">System Specification</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 pb-24">
        {specs.map((spec) => (
          <GlassContainer
            key={spec.title}
            className="p-6 rounded-[22px] space-y-4 shadow-none text-center bg-surface-muted"
          >
            <div className="p-3 bg-accent-soft rounded-2xl mx-auto w-fit">
              <spec.icon size={20} className="text-accent-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs text-content-dim font-bold uppercase tracking-widest">{spec.title}</h3>
              <p className="text-sm font-medium text-content-primary leading-none">{spec.value}</p>
            </div>
          </GlassContainer>
        ))}
      </div>

      <div className="text-center opacity-40">
        <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-content-dim">Version 1.0.5 | Dr. Dyrane Digital</p>
      </div>
    </div>
  );
};

