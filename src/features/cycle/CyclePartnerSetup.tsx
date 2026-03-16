import React, { useState } from 'react';
import { Users } from 'lucide-react';
import { GlassContainer } from '../../components/shared/GlassContainer';
import { useClinical } from '../../core/context/ClinicalContext';

export const CyclePartnerSetup: React.FC = () => {
  const { dispatch } = useClinical();
  const [partnerInput, setPartnerInput] = useState('');

  const handleConnect = () => {
    if (partnerInput.trim()) {
      dispatch({ type: 'UPDATE_CYCLE_SETTINGS', payload: { partner_name: partnerInput.trim() } });
    }
  };

  return (
    <div className="flex-1 w-full min-w-0 py-8 space-y-8 animate-emergence">
      <div className="space-y-2 text-center">
        <div className="w-16 h-16 bg-neon-rose/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users size={32} className="text-neon-rose" />
        </div>
        <h1 className="display-type text-3xl text-content-primary">
          Ava Partner
        </h1>
        <p className="text-sm text-content-dim max-w-[280px] mx-auto leading-relaxed">
          Step into sync. Connect with your partner's health data to stay ahead of milestones.
        </p>
      </div>

      <GlassContainer className="p-8 rounded-[40px] surface-raised space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-content-dim">Partner's Name</label>
            <input 
              type="text"
              placeholder="e.g. Sarah"
              value={partnerInput}
              onChange={(e) => setPartnerInput(e.target.value)}
              className="w-full bg-white/5 border-0 surface-strong rounded-2xl py-4 px-5 text-sm focus:outline-none ring-1 ring-white/10 focus:ring-neon-rose/30 transition-all font-medium"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConnect();
              }}
            />
          </div>
          <p className="text-[10px] text-content-dim italic">Cycle data is stored locally on this device for privacy.</p>
        </div>
        <button 
          onClick={handleConnect}
          className="w-full py-4 rounded-3xl bg-neon-rose text-white text-sm font-bold shadow-lg shadow-neon-rose/20 interactive-tap"
        >
          Add Partner
        </button>
      </GlassContainer>
    </div>
  );
};
