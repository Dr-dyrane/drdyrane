import type { Page, Route } from '@playwright/test';

export interface MockConsultEngine {
  id: string;
  discriminatorQuestion: string;
}

const pickOptionSet = (question: string) => {
  const normalized = question.toLowerCase();

  if (/how long|since when|when did/.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'stack',
      options: [
        { id: 'today', text: 'Started today' },
        { id: 'd1-2', text: '1-2 days ago' },
        { id: 'd3-4', text: '3-4 days ago' },
        { id: 'd5-7', text: '5-7 days ago' },
      ],
      allow_custom_input: true,
    };
  }

  if (/danger signs|breathlessness|persistent vomiting|bleeding|confusion/.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'grid',
      options: [
        { id: 'none', text: 'None of these' },
        { id: 'breathless', text: 'Breathlessness' },
        { id: 'confusion', text: 'Confusion' },
        { id: 'vomit', text: 'Persistent vomiting' },
      ],
      allow_custom_input: true,
    };
  }

  if (/summary|working diagnosis|finalize/.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'segmented',
      options: [
        { id: 'ready', text: 'Ready for summary' },
        { id: 'detail', text: 'Add one detail' },
        { id: 'unsure', text: 'Not sure' },
      ],
      allow_custom_input: true,
    };
  }

  return {
    mode: 'single',
    ui_variant: 'segmented',
    options: [
      { id: 'yes', text: 'Yes' },
      { id: 'no', text: 'No' },
      { id: 'unsure', text: 'Not sure' },
    ],
    allow_custom_input: true,
  };
};

const fulfillJson = async (route: Route, payload: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
};

export const installConsultApiMock = async (
  page: Page,
  engine: MockConsultEngine
): Promise<{ consultCount: () => number }> => {
  let consultTurn = 0;

  await page.route('**/api/consult', async (route) => {
    const requestBody = route.request().postDataJSON() as {
      patientInput?: string;
      state?: { question_gate?: { active?: boolean } };
    };

    const patientInput = String(requestBody?.patientInput || '');
    const normalizedInput = patientInput.toLowerCase();

    let question = 'How long has this complaint been present?';
    let statement = 'Noted.';
    let status = 'active';
    let urgency = 'low';
    let probability = 62;
    let checkpointStatus = 'idle';

    if (consultTurn === 0) {
      question = engine.discriminatorQuestion;
      statement = 'Noted. I am narrowing your differential.';
      probability = 72;
    } else if (consultTurn === 1) {
      question =
        'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?';
      statement = 'I need one safety check before finalizing.';
      urgency = 'medium';
      checkpointStatus = 'pending';
      probability = 77;
    } else {
      question = 'I can summarize now. Would you like your working diagnosis and plan?';
      statement = 'I have enough to provide a working impression.';
      probability = 86;
      checkpointStatus = 'cleared';

      if (/ready for summary|yes|none of these|done/.test(normalizedInput)) {
        status = 'complete';
      }
    }

    if (/confusion|collapse|faint|cannot breathe|bleeding/.test(normalizedInput)) {
      status = 'emergency';
      urgency = 'critical';
      checkpointStatus = 'escalate';
      question = 'Can you access emergency care right now?';
      statement = 'This may represent a must-not-miss emergency.';
      probability = 92;
    }

    const payload = {
      statement,
      question,
      soap_updates: {
        S: {
          chief_complaint: engine.id,
          last_input: patientInput,
          turn_index: consultTurn,
        },
      },
      ddx: [`${engine.id} condition (ICD-10: R69)`],
      agent_state: {
        phase: status === 'complete' ? 'resolution' : 'differential',
        confidence: probability,
        focus_area: `${engine.id} engine`,
        pending_actions: ['Collect discriminator', 'Safety checkpoint'],
        last_decision: `mock-turn-${consultTurn + 1}`,
        positive_findings: [`${engine.id} complaint`],
        negative_findings: /none|no\b|not sure/.test(normalizedInput)
          ? ['danger signs denied or uncertain']
          : [],
        must_not_miss_checkpoint: {
          required: consultTurn >= 2,
          status: checkpointStatus,
          last_question: question,
          last_response: patientInput,
          updated_at: Date.now(),
        },
      },
      urgency,
      probability,
      thinking: `mock reasoning for ${engine.id}`,
      needs_options: true,
      lens_trigger: null,
      status,
    };

    consultTurn += 1;
    await fulfillJson(route, payload);
  });

  await page.route('**/api/options', async (route) => {
    const requestBody = route.request().postDataJSON() as { lastQuestion?: string };
    const question = String(requestBody?.lastQuestion || '');
    await fulfillJson(route, pickOptionSet(question));
  });

  await page.route('**/api/vision', async (route) => {
    await fulfillJson(route, {
      summary: 'No critical visual abnormalities in mock mode.',
      findings: [],
      red_flags: [],
      confidence: 75,
      recommendation: 'Continue history-driven assessment.',
    });
  });

  return {
    consultCount: () => consultTurn,
  };
};
