import type { Page } from '@playwright/test';

const SESSION_KEY = 'dr_dyrane.v2.session';
const ONBOARDING_KEY = 'dr_dyrane.v1.onboarding_state';

const now = () => Date.now();

const makeSeedState = () => ({
  sessionId: 'pw-session-1',
  view: 'consult',
  soap: { S: {}, O: {}, A: {}, P: {} },
  ddx: [],
  status: 'idle',
  theme: 'dark',
  redFlag: false,
  pillars: null,
  currentQuestion: null,
  conversation: [],
  agent_state: {
    phase: 'intake',
    confidence: 0,
    focus_area: 'Initial assessment',
    pending_actions: ['Gather chief complaint'],
    last_decision: 'Starting patient intake',
    positive_findings: [],
    negative_findings: [],
    must_not_miss_checkpoint: {
      required: false,
      status: 'idle',
    },
  },
  response_options: null,
  selected_options: [],
  probability: 0,
  urgency: 'low',
  thinking: 'Ready to begin clinical assessment',
  question_gate: null,
  profile: {
    id: 'local-profile',
    display_name: 'Test Patient',
    avatar_url: '',
    age: 30,
    sex: 'female',
    updated_at: now(),
  },
  settings: {
    haptics_enabled: false,
    audio_enabled: false,
    reduced_motion: true,
    notifications_enabled: false,
    text_scale: 'md',
    motion_style: 'balanced',
    gratification_enabled: true,
  },
  notifications: [],
  active_sheet: null,
  clerking: {
    hpc: '',
    pmh: '',
    dh: '',
    sh: '',
    fh: '',
  },
  diagnostic_reviews: [],
  isHxOpen: false,
  history: [],
  archives: [],
});

export const seedClinicalStorage = async (page: Page): Promise<void> => {
  await page.addInitScript(
    ({ sessionKey, onboardingKey, seedAt, state }) => {
      const sessionEnvelope = {
        version: 2,
        savedAt: seedAt,
        revision: 1,
        stateHash: 'playwright-seeded',
        state,
      };

      const onboarding = {
        completed: true,
        updated_at: seedAt,
      };

      if (!localStorage.getItem(sessionKey)) {
        localStorage.setItem(sessionKey, JSON.stringify(sessionEnvelope));
      }
      if (!localStorage.getItem(onboardingKey)) {
        localStorage.setItem(onboardingKey, JSON.stringify(onboarding));
      }
    },
    {
      sessionKey: SESSION_KEY,
      onboardingKey: ONBOARDING_KEY,
      seedAt: now(),
      state: makeSeedState(),
    }
  );
};
