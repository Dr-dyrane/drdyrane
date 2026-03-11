import { ClinicalState } from '../core/types/clinical';
import { processAgentInteraction } from '../core/api/agentCoordinator';

export const callClinicalEngine = async (
  input: string,
  state: ClinicalState
): Promise<Partial<ClinicalState>> => {
  return processAgentInteraction(input, state, false);
};
