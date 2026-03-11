import { ClinicalState } from '../types/clinical';
import { processAgentInteraction } from './agentCoordinator';

export const callClinicalEngine = async (
  input: string,
  state: ClinicalState
): Promise<Partial<ClinicalState>> => {
  return processAgentInteraction(input, state, false);
};
