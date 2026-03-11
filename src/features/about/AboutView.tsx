import React from 'react';
import { GlassContainer } from '../../components/shared/GlassContainer';
import { ShieldCheck, Database, Cpu, Activity } from 'lucide-react';
import { Orb } from '../consultation/Orb';

export const AboutView: React.FC = () => {
  const specs = [
    { title: 'Core Processor', value: 'Anthropic Multi-Model', icon: Cpu },
    { title: 'Clinical Scope', value: 'Adult Registrar Level', icon: ShieldCheck },
    { title: 'Logic Pattern', value: 'SOAP Induction', icon: Activity },
    { title: 'Privacy Mode', value: 'Local Persistence', icon: Database },
  ];

  return (
    <div className="flex-1 px-4 py-8 space-y-4 animate-emergence">
      <div className="flex justify-center">
        <Orb />
      </div>
      <div className="text-center space-y-4">
        <span className="text-neon-cyan/40 uppercase tracking-[0.3em] text-[10px] font-bold">Protocol</span>
        <h1 className="text-2xl font-light text-content-primary leading-tight">System Specification</h1>
        <p className="text-content-dim font-light text-sm max-w-xs mx-auto leading-relaxed">
          Dr. Dyrane is a high-fidelity clinical registrar designed to bridge the gap between human distress and mathematical certainty.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 pb-24">
        {specs.map((spec) => (
          <GlassContainer
            key={spec.title}
            className="p-6 rounded-[32px] space-y-4 border-none shadow-none text-center bg-surface-muted"
          >
            <div className="p-3 bg-neon-cyan/5 rounded-2xl mx-auto w-fit">
              <spec.icon size={20} className="text-neon-cyan" />
            </div>
            <div className="space-y-1">
              <h3 className="text-[10px] text-content-dim font-bold uppercase tracking-widest">{spec.title}</h3>
              <p className="text-sm font-medium text-content-primary leading-none">{spec.value}</p>
            </div>
          </GlassContainer>
        ))}
      </div>

      <div className="text-center opacity-40">
        <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-content-dim">Version 1.0.5 | Dr. Dyrane Digital</p>
      </div>
    </div>
  );
};
