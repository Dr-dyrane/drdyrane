import { ensureE2EServer } from './e2eServer.mjs';

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';

const VALID_URGENCY = new Set(['low', 'medium', 'high', 'critical']);
const VALID_STATUS = new Set(['idle', 'intake', 'active', 'lens', 'emergency', 'complete']);
const VALID_PHASE = new Set(['intake', 'assessment', 'differential', 'resolution', 'followup']);
const VALID_CHECKPOINT_STATUS = new Set(['idle', 'pending', 'cleared', 'escalate']);
const VALID_OPTION_MODES = new Set(['single', 'multiple', 'freeform', 'confirm']);
const VALID_UI_VARIANTS = new Set([
  'stack',
  'grid',
  'binary',
  'segmented',
  'scale',
  'ladder',
  'chips',
]);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const hasSingleQuestion = (question) => {
  const normalized = String(question || '').trim();
  if (!normalized) return false;
  const questionMarks = (normalized.match(/\?/g) || []).length;
  return questionMarks === 1 && normalized.endsWith('?');
};

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
    age: 29,
    sex: 'female',
    pronouns: null,
    allergies: null,
    chronic_conditions: null,
    medications: null,
  },
  memory_dossier: '',
  conversation: [],
});

const mergeSoapUpdates = (state, soapUpdates) => {
  if (!soapUpdates || typeof soapUpdates !== 'object') return;
  for (const key of ['S', 'O', 'A', 'P']) {
    if (!soapUpdates[key] || typeof soapUpdates[key] !== 'object') continue;
    state.soap[key] = { ...(state.soap[key] || {}), ...soapUpdates[key] };
  }
};

const appendConversation = (state, patientInput, response) => {
  state.conversation.push({ role: 'patient', content: patientInput });
  const doctorContent = [response.statement, response.question].filter(Boolean).join(' ').trim();
  if (doctorContent) {
    state.conversation.push({ role: 'doctor', content: doctorContent });
  }
};

const validateConsultPayload = (payload, label) => {
  assert(payload && typeof payload === 'object', `${label}: consult payload must be an object`);
  assert(typeof payload.statement === 'string', `${label}: statement must be string`);
  assert(typeof payload.question === 'string', `${label}: question must be string`);
  assert(hasSingleQuestion(payload.question), `${label}: question must be single focused question`);
  assert(Array.isArray(payload.ddx), `${label}: ddx must be array`);
  assert(payload.ddx.every((item) => typeof item === 'string'), `${label}: ddx entries must be strings`);
  assert(VALID_URGENCY.has(payload.urgency), `${label}: urgency must be valid`);
  assert(VALID_STATUS.has(payload.status), `${label}: status must be valid`);
  assert(Number.isFinite(payload.probability), `${label}: probability must be numeric`);
  assert(payload.probability >= 0 && payload.probability <= 100, `${label}: probability out of range`);
  assert(typeof payload.needs_options === 'boolean', `${label}: needs_options must be boolean`);
  assert(
    payload.lens_trigger === null || typeof payload.lens_trigger === 'string',
    `${label}: lens_trigger must be string|null`
  );

  const agent = payload.agent_state;
  assert(agent && typeof agent === 'object', `${label}: agent_state must be object`);
  assert(VALID_PHASE.has(agent.phase), `${label}: agent_state.phase invalid`);
  assert(Array.isArray(agent.pending_actions), `${label}: pending_actions must be array`);
  assert(Array.isArray(agent.positive_findings), `${label}: positive_findings must be array`);
  assert(Array.isArray(agent.negative_findings), `${label}: negative_findings must be array`);
  assert(typeof agent.last_decision === 'string', `${label}: last_decision must be string`);
  assert(Number.isFinite(agent.confidence), `${label}: confidence must be numeric`);

  const checkpoint = agent.must_not_miss_checkpoint;
  assert(checkpoint && typeof checkpoint === 'object', `${label}: checkpoint must be object`);
  assert(VALID_CHECKPOINT_STATUS.has(checkpoint.status), `${label}: checkpoint.status invalid`);
  assert(typeof checkpoint.required === 'boolean', `${label}: checkpoint.required must be boolean`);

  assert(payload.diagnosis && typeof payload.diagnosis === 'object', `${label}: diagnosis must be object`);
  assert(
    typeof payload.diagnosis.label === 'string' && payload.diagnosis.label.trim().length > 0,
    `${label}: diagnosis.label must be populated`
  );
  assert(
    typeof payload.diagnosis.icd10 === 'string' && payload.diagnosis.icd10.trim().length > 0,
    `${label}: diagnosis.icd10 must be populated`
  );
  assert(Array.isArray(payload.differentials) && payload.differentials.length > 0, `${label}: differentials must be populated`);
  assert(Array.isArray(payload.management) && payload.management.length > 0, `${label}: management must be populated`);
  assert(Array.isArray(payload.investigations) && payload.investigations.length > 0, `${label}: investigations must be populated`);
  assert(Array.isArray(payload.counseling) && payload.counseling.length > 0, `${label}: counseling must be populated`);
  assert(Array.isArray(payload.red_flags) && payload.red_flags.length > 0, `${label}: red_flags must be populated`);
};

const callJson = async (url, payload) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
};

const runConsultTurn = async (state, patientInput, turnLabel) => {
  const { response, body } = await callJson(`${baseUrl}/api/consult`, { patientInput, state });
  assert(response.ok, `${turnLabel}: consult RPC failed (${response.status})`);
  validateConsultPayload(body, turnLabel);

  appendConversation(state, patientInput, body);
  mergeSoapUpdates(state, body.soap_updates);
  state.ddx = Array.isArray(body.ddx) ? body.ddx : state.ddx;
  state.agent_state = body.agent_state || state.agent_state;
  state.urgency = body.urgency || state.urgency;
  state.probability = Number(body.probability) || state.probability;

  return body;
};

const assertMethodGuard = async (endpoint) => {
  const response = await fetch(`${baseUrl}${endpoint}`, { method: 'GET' });
  assert(response.status === 405, `${endpoint}: expected 405 for non-POST`);
};

const runFeverEncounterContract = async () => {
  const state = makeInitialState();
  const scenario = [
    'I have fever for 2 days with evening chills and body aches.',
    'It rises at night and is lower by morning.',
    'Yes, recent mosquito exposure.',
    'No confusion, no chest pain, no breathlessness, no bleeding.',
  ];

  let finalPayload = null;
  for (let i = 0; i < scenario.length; i += 1) {
    finalPayload = await runConsultTurn(state, scenario[i], `fever.turn${i + 1}`);
  }

  const subjectiveKeys = Object.keys(state.soap.S || {});
  const hasAnyIcd10 = (state.ddx || []).some((entry) => /\(ICD-10:\s*[A-Z0-9.-]+\)/i.test(entry));
  const findingCount =
    (state.agent_state.positive_findings || []).length +
    (state.agent_state.negative_findings || []).length;

  assert(subjectiveKeys.length > 0, 'fever: expected SOAP.S side-effects to be populated');
  assert(hasAnyIcd10, 'fever: expected ICD-10 coding in differential');
  assert((state.agent_state.pending_actions || []).length > 0, 'fever: pending_actions should be populated');
  assert(findingCount > 0, 'fever: positive/negative findings memory should be populated');
  assert(
    /malaria|febrile/i.test((finalPayload?.ddx || []).join(' ')),
    'fever: expected febrile/malaria-oriented differential'
  );
};

const runEmergencyTriggerContract = async () => {
  const state = makeInitialState();
  const first = await runConsultTurn(
    state,
    'I have sudden crushing chest pain, shortness of breath, and I fainted.',
    'emergency.turn1'
  );

  const second = await runConsultTurn(
    state,
    'Pain radiates to my left arm and jaw and I feel sweaty.',
    'emergency.turn2'
  );

  const combined = `${(first.ddx || []).join(' ')} ${(second.ddx || []).join(' ')}`.toLowerCase();
  const emergencyLike =
    ['high', 'critical'].includes(first.urgency) ||
    ['high', 'critical'].includes(second.urgency) ||
    /acute coronary|myocardial infarction|pulmonary embol|aortic dissection/.test(combined);
  assert(emergencyLike, 'emergency: trigger path did not elevate risk as expected');
};

const runOptionsRpcContract = async () => {
  const payload = {
    lastQuestion:
      'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?',
    agentState: {
      phase: 'differential',
      confidence: 72,
      focus_area: 'Fever Engine',
      pending_actions: ['Safety check'],
      last_decision: 'Risk checkpoint',
    },
    currentSOAP: {
      S: { fever: true, chills: true },
      O: {},
      A: {},
      P: {},
    },
  };

  const { response, body } = await callJson(`${baseUrl}/api/options`, payload);
  assert(response.ok, `options RPC failed (${response.status})`);
  assert(body && typeof body === 'object', 'options: payload must be object');
  assert(VALID_OPTION_MODES.has(body.mode), 'options: mode invalid');
  if (body.ui_variant) {
    assert(VALID_UI_VARIANTS.has(body.ui_variant), 'options: ui_variant invalid');
  }
  assert(Array.isArray(body.options), 'options: options must be array');
  assert(body.options.length >= 2, 'options: expected at least 2 options');
  assert(body.options.every((opt) => typeof opt.text === 'string'), 'options: option text must be string');
};

const runVisionRpcContract = async () => {
  const invalid = await callJson(`${baseUrl}/api/vision`, { imageDataUrl: 'bad-payload' });
  assert(!invalid.response.ok, 'vision: invalid payload should fail');
  assert(
    /base64 data url|expects a base64/i.test(String(invalid.body.error || '')),
    'vision: invalid payload should return validation error'
  );
};

const run = async () => {
  const server = await ensureE2EServer(baseUrl);
  try {
    await assertMethodGuard('/api/consult');
    await assertMethodGuard('/api/options');
    await assertMethodGuard('/api/vision');

    await runFeverEncounterContract();
    await runEmergencyTriggerContract();
    await runOptionsRpcContract();
    await runVisionRpcContract();

    console.log('E2E RPC/side-effects contract test passed.');
  } finally {
    await server.stop();
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
