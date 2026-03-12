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
    age: 27,
    sex: 'female',
    pronouns: null,
    allergies: null,
    chronic_conditions: null,
    medications: null,
  },
  memory_dossier: '',
  conversation: [],
});

const scenario = [
  'I have had fever for 2 days with chills and body aches',
  'Yes, I have headache and pain behind my eyes',
  'I also feel weak with nausea and occasional vomiting',
  'No cough, no sore throat, and no burning urination',
];

const hasSingleQuestion = (question) => {
  const normalized = String(question || '').trim();
  if (!normalized) return false;
  const questionMarks = (normalized.match(/\?/g) || []).length;
  return questionMarks === 1 && normalized.endsWith('?');
};

const mergeSoapUpdates = (state, soapUpdates) => {
  if (!soapUpdates) return;
  for (const key of ['S', 'O', 'A', 'P']) {
    if (!soapUpdates[key]) continue;
    state.soap[key] = { ...(state.soap[key] || {}), ...soapUpdates[key] };
  }
};

const updateConversation = (state, input, response) => {
  state.conversation.push({ role: 'patient', content: input });
  const doctorContent = [response.statement, response.question].filter(Boolean).join(' ').trim();
  if (doctorContent) {
    state.conversation.push({ role: 'doctor', content: doctorContent });
  }
};

const run = async () => {
  const server = await ensureE2EServer(baseUrl);
  const state = makeInitialState();
  let finalResponse = null;
  try {
    for (let turn = 0; turn < scenario.length; turn += 1) {
      const patientInput = scenario[turn];
      const response = await fetch(`${baseUrl}/api/consult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientInput, state }),
      });

      if (!response.ok) {
        const raw = await response.text();
        throw new Error(`Consult API failed at turn ${turn + 1}: ${response.status} ${raw}`);
      }

      finalResponse = await response.json();
      const ddx = Array.isArray(finalResponse.ddx) ? finalResponse.ddx : [];
      console.log(`Turn ${turn + 1}:`, ddx[0] || 'No DDX');

      if (!hasSingleQuestion(finalResponse.question)) {
        console.error('Single-question policy failed.');
        console.error('Turn:', turn + 1);
        console.error('Question:', finalResponse.question);
        process.exit(1);
      }

      updateConversation(state, patientInput, finalResponse);
      mergeSoapUpdates(state, finalResponse.soap_updates);
      state.ddx = ddx;
      state.agent_state = finalResponse.agent_state || state.agent_state;
      state.urgency = finalResponse.urgency || state.urgency;
      state.probability = Number(finalResponse.probability) || state.probability;
    }

    const topDx = finalResponse?.ddx?.[0] || '';
    const hasMalaria = /malaria/i.test(topDx);
    const hasIcd10 = /ICD-10:\s*B54/i.test(topDx);

    if (!hasMalaria || !hasIcd10) {
      console.error('E2E malaria test failed.');
      console.error('Top diagnosis:', topDx);
      process.exit(1);
    }

    console.log('E2E malaria test passed.');
    console.log('Top diagnosis:', topDx);
  } finally {
    await server.stop();
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
