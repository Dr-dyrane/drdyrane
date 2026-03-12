import { ensureE2EServer } from './e2eServer.mjs';

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';

const makeInitialState = () => ({
  soap: { S: {}, O: {}, A: {}, P: {} },
  agent_state: {
    phase: 'intake',
    confidence: 0,
    focus_area: 'Initial assessment',
    pending_actions: ['Gather chief complaint'],
    last_decision: 'Starting intake',
    positive_findings: [],
    negative_findings: [],
    must_not_miss_checkpoint: {
      required: false,
      status: 'idle',
    },
  },
  ddx: [],
  urgency: 'low',
  probability: 0,
  profile: {
    display_name: 'Patient',
    age: 30,
    sex: 'female',
    pronouns: null,
    allergies: null,
    chronic_conditions: null,
    medications: null,
  },
  memory_dossier: '',
  conversation: [],
});

const hasSingleQuestion = (question) => {
  const normalized = String(question || '').trim();
  if (!normalized) return false;
  const questionMarks = (normalized.match(/\?/g) || []).length;
  return questionMarks === 1 && normalized.endsWith('?');
};

const run = async () => {
  const server = await ensureE2EServer(baseUrl);
  const state = makeInitialState();
  const patientInput = 'I have fever for 1 day';
  try {
    const response = await fetch(`${baseUrl}/api/consult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientInput, state }),
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Consult API failed: ${response.status} ${raw}`);
    }

    const payload = await response.json();
    const topDx = payload?.ddx?.[0] || '';
    const question = payload?.question || '';
    const probability = Number(payload?.probability) || 0;

    const feverOnlyLead = /undifferentiated febrile illness/i.test(topDx);
    const malariaLead = /\bmalaria\b/i.test(topDx);
    const malariaTestingQuestion = /\b(rdt|rapid test|blood smear|thick|thin film)\b/i.test(question);
    const questionOk = hasSingleQuestion(question);

    if (!questionOk || !feverOnlyLead || malariaLead || malariaTestingQuestion || probability > 65) {
      console.error('E2E fever-only bias test failed.');
      console.error('Top diagnosis:', topDx);
      console.error('Question:', question);
      console.error('Probability:', probability);
      process.exit(1);
    }

    console.log('E2E fever-only bias test passed.');
    console.log('Top diagnosis:', topDx);
    console.log('Question:', question);
    console.log('Probability:', probability);
  } finally {
    await server.stop();
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
