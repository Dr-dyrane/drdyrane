import { ClinicalState } from '../core/types/clinical';

export interface SBARReport {
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
}

export const generateSBAR = (state: ClinicalState): SBARReport => {
  return {
    situation: `Patient presenting with ${Object.values(state.soap.S).join(', ')}. Red flag triggered.`,
    background: `Medical history: ${JSON.stringify(state.soap.S)}. First session encounter: ${state.sessionId}`,
    assessment: `Potential Must-Not-Miss pathophysiology suspected. Triage Priority: Level 1 (Immediate).`,
    recommendation: `Urgent assessment by senior medical officer. Continuous monitoring of vitals. Stat baseline diagnostics (WBC, CRP, ECG).`
  };
};

export const getNearestED = async (): Promise<string | null> => {
  if (!navigator.geolocation) return null;
  
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        resolve(`https://www.google.com/maps/search/Emergency+Department/@${latitude},${longitude},14z`);
      },
      () => resolve('https://www.google.com/maps/search/nearest+Emergency+Department')
    );
  });
};
