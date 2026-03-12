import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureE2EServer } from './e2eServer.mjs';
import {
  InvariantValidator,
  detectQuestionIntent,
  hasSingleQuestion,
} from './lib/invariantValidator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const specPath = path.join(__dirname, 'specs', 'encounter-matrix.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
const PATH_TYPES = ['positive', 'must_not_miss', 'ambiguous', 'contradiction', 'user_noise'];

const DX_CODE_MAP = {
  fever: 'B54',
  chest_pain: 'R07.9',
  shortness_of_breath: 'R06.02',
  headache: 'R51.9',
  abdominal_pain: 'R10.9',
  vomiting_nausea: 'R11.2',
  diarrhea: 'A09',
  rash: 'R21',
  joint_pain: 'M25.50',
  weakness_fatigue: 'R53',
  bleeding: 'R58',
  altered_mental_status: 'R41.82',
};

const parseArgs = (argv) => {
  const args = {
    mode: 'mock',
    engines: [],
    paths: [],
    strict: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode' && argv[i + 1]) {
      args.mode = argv[i + 1];
      i += 1;
    } else if (arg === '--engines' && argv[i + 1]) {
      args.engines = argv[i + 1].split(',').map((value) => value.trim()).filter(Boolean);
      i += 1;
    } else if (arg === '--paths' && argv[i + 1]) {
      args.paths = argv[i + 1].split(',').map((value) => value.trim()).filter(Boolean);
      i += 1;
    } else if (arg === '--audit') {
      args.strict = false;
    }
  }

  return args;
};

const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
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
    display_name: 'Matrix Patient',
    age: 32,
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
  state.conversation.push({
    role: 'doctor',
    content: [response.statement, response.question].filter(Boolean).join(' ').trim(),
  });
};

const buildScenarioTurns = (engine, pathType) => {
  const byPath = {
    positive: [
      { input: engine.starter_input, expectIntent: 'duration' },
      { input: '1-2 days ago', expectIntent: 'yes_no' },
      { input: engine.positive_detail },
      { input: 'None of these', expectIntent: 'danger_signs' },
      { input: 'Ready for summary', expectIntent: 'summary' },
    ],
    must_not_miss: [
      { input: engine.starter_input, expectIntent: 'duration' },
      { input: 'Started today', expectIntent: 'yes_no' },
      { input: engine.must_not_miss_detail },
      { input: 'Yes', expectIntent: 'yes_no' },
    ],
    ambiguous: [
      { input: engine.starter_input, expectIntent: 'duration' },
      { input: 'Not sure', expectIntent: 'yes_no' },
      { input: engine.ambiguous_detail },
      { input: 'Not sure' },
    ],
    contradiction: [
      { input: engine.starter_input, expectIntent: 'duration' },
      { input: '1-2 days ago', expectIntent: 'yes_no' },
      { input: engine.contradiction_detail },
      { input: 'No' },
    ],
    user_noise: [
      { input: engine.starter_input, expectIntent: 'duration' },
      { input: '1-2 days ago', expectIntent: 'yes_no' },
      { input: engine.noise_detail },
      { input: 'No' },
    ],
  };
  return byPath[pathType];
};

const buildScenarioMatrix = (engineList, pathList) => {
  const scenarios = [];
  for (const engine of engineList) {
    for (const pathType of pathList) {
      scenarios.push({
        id: `${engine.id}.${pathType}`,
        engine,
        pathType,
        turns: buildScenarioTurns(engine, pathType),
      });
    }
  }
  return scenarios;
};

const buildMockOptions = (question) => {
  const intent = detectQuestionIntent(question);
  if (intent === 'duration') {
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
  if (intent === 'danger_signs') {
    return {
      mode: 'single',
      ui_variant: 'grid',
      options: [
        { id: 'none', text: 'None of these' },
        { id: 'sob', text: 'Breathlessness' },
        { id: 'confusion', text: 'Confusion' },
        { id: 'cp', text: 'Chest pain' },
      ],
      allow_custom_input: true,
    };
  }
  if (intent === 'summary') {
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

const buildMockConsultResponse = ({ scenario, turnIndex, patientInput, state }) => {
  const engine = scenario.engine;
  const pathType = scenario.pathType;
  const code = DX_CODE_MAP[engine.id] || 'R69';
  const likelyDx = `${engine.likely_dx_keyword} condition (ICD-10: ${code})`;
  const dangerousDx = `${engine.must_not_miss_dx_keyword} risk (ICD-10: R57.9)`;
  const baseDdX = [likelyDx, dangerousDx];

  let question = 'How long has this complaint been present?';
  let statement = 'Noted.';
  let status = 'active';
  let urgency = 'low';
  let probability = 58;
  let phase = 'intake';
  let checkpointStatus = 'idle';

  if (turnIndex === 1) {
    question = 'Any other complaint right now?';
    phase = 'assessment';
    probability = 63;
  } else if (turnIndex === 2) {
    question = engine.discriminator_question;
    statement = 'Noted. I am narrowing your differential.';
    phase = 'differential';
    probability = pathType === 'positive' ? 74 : 66;
  } else if (turnIndex === 3) {
    question =
      'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?';
    statement = 'I need one safety check before finalizing.';
    phase = 'differential';
    urgency = pathType === 'must_not_miss' ? 'high' : 'medium';
    checkpointStatus = 'pending';
    probability = pathType === 'must_not_miss' ? 82 : 71;
  } else if (turnIndex >= 4) {
    question = 'I can summarize now. Would you like your working diagnosis and plan?';
    statement = 'I have enough to provide a working impression.';
    phase = 'resolution';
    checkpointStatus = 'cleared';
    probability = 86;
    if (/ready for summary|yes|done|no$/i.test(String(patientInput || '').trim())) {
      status = pathType === 'must_not_miss' ? 'emergency' : 'complete';
      urgency = pathType === 'must_not_miss' ? 'critical' : 'medium';
    }
  }

  if (pathType === 'must_not_miss' && turnIndex >= 3 && /yes|confusion|collapse|seizure|faint/i.test(patientInput)) {
    question = 'Can you access emergency care right now?';
    statement = 'This may represent a must-not-miss emergency.';
    status = 'emergency';
    urgency = 'critical';
    checkpointStatus = 'escalate';
    phase = 'assessment';
    probability = 91;
  }

  const positiveFindings = [
    `${engine.id} complaint present`,
    ...(turnIndex >= 2 ? ['core discriminator captured'] : []),
  ];
  const negativeFindings =
    /none of these|no\b|not sure/i.test(String(patientInput || '').toLowerCase())
      ? ['danger signs denied or uncertain']
      : [];

  return {
    statement,
    question,
    soap_updates: {
      S: {
        chief_complaint: engine.id,
        last_input: patientInput,
        turn_index: turnIndex,
      },
    },
    ddx: baseDdX,
    agent_state: {
      phase,
      confidence: probability,
      focus_area: engine.label,
      pending_actions: ['Collect key discriminator', 'Confirm must-not-miss status'],
      last_decision: `Turn ${turnIndex + 1} processed`,
      positive_findings: positiveFindings,
      negative_findings: negativeFindings,
      must_not_miss_checkpoint: {
        required: turnIndex >= 3,
        status: checkpointStatus,
        last_question: question,
        last_response: patientInput,
        updated_at: Date.now(),
      },
    },
    urgency,
    probability,
    thinking: `Mock state-machine progression for ${engine.id}`,
    needs_options: true,
    lens_trigger: null,
    status,
  };
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

const runLiveConsultTurn = async ({ state, patientInput, turnLabel }) => {
  const { response, body } = await callJson(`${baseUrl}/api/consult`, {
    patientInput,
    state,
  });
  ensure(response.ok, `${turnLabel}: /api/consult failed (${response.status})`);
  ensure(hasSingleQuestion(body.question), `${turnLabel}: question must be single focused question`);
  const optionsPayload = {
    lastQuestion: body.question,
    agentState: body.agent_state || state.agent_state,
    currentSOAP: state.soap,
  };
  const optionsResult = await callJson(`${baseUrl}/api/options`, optionsPayload);
  ensure(optionsResult.response.ok, `${turnLabel}: /api/options failed (${optionsResult.response.status})`);
  return { consult: body, options: optionsResult.body };
};

const applyConsultSideEffects = (state, patientInput, consult) => {
  appendConversation(state, patientInput, consult);
  mergeSoapUpdates(state, consult.soap_updates);
  state.ddx = Array.isArray(consult.ddx) ? consult.ddx : state.ddx;
  state.agent_state = consult.agent_state || state.agent_state;
  state.urgency = consult.urgency || state.urgency;
  state.probability = Number(consult.probability) || state.probability;
};

const assertScenarioOutcome = ({ scenario, finalResponse, state, mode }) => {
  ensure(Array.isArray(state.ddx) && state.ddx.length > 0, `${scenario.id}: ddx must be populated`);
  ensure(Object.keys(state.soap.S || {}).length > 0, `${scenario.id}: SOAP side-effects should be populated`);
  ensure(
    Array.isArray(state.agent_state.pending_actions) && state.agent_state.pending_actions.length > 0,
    `${scenario.id}: pending_actions should be populated`
  );

  if (mode === 'mock') {
    if (scenario.pathType === 'positive') {
      ensure(finalResponse.status === 'complete', `${scenario.id}: positive path should complete`);
      ensure(
        (state.ddx || []).join(' ').toLowerCase().includes(scenario.engine.likely_dx_keyword.toLowerCase()),
        `${scenario.id}: positive path should include likely dx keyword`
      );
    }
    if (scenario.pathType === 'must_not_miss') {
      ensure(
        finalResponse.status === 'emergency' || ['high', 'critical'].includes(finalResponse.urgency),
        `${scenario.id}: must-not-miss path should escalate`
      );
    }
  }
};

const runScenario = async ({ scenario, mode, strict }) => {
  const state = makeInitialState();
  const validator = new InvariantValidator({ strict });
  let finalResponse = null;

  for (let turnIndex = 0; turnIndex < scenario.turns.length; turnIndex += 1) {
    const turn = scenario.turns[turnIndex];
    const turnLabel = `${scenario.id}.turn${turnIndex + 1}`;
    let consult;
    let options;

    if (mode === 'live') {
      const live = await runLiveConsultTurn({ state, patientInput: turn.input, turnLabel });
      consult = live.consult;
      options = live.options;
    } else {
      consult = buildMockConsultResponse({
        scenario,
        turnIndex,
        patientInput: turn.input,
        state,
      });
      options = buildMockOptions(consult.question);
    }

    if (mode === 'mock' && turn.expectIntent) {
      const actualIntent = detectQuestionIntent(consult.question);
      ensure(
        actualIntent === turn.expectIntent,
        `${turnLabel}: expected intent ${turn.expectIntent} but got ${actualIntent || 'none'}`
      );
    }

    validator.validateTurn({
      scenarioId: scenario.id,
      turnIndex,
      patientInput: turn.input,
      response: consult,
      options,
    });

    applyConsultSideEffects(state, turn.input, consult);
    finalResponse = consult;
  }

  assertScenarioOutcome({ scenario, finalResponse, state, mode });
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode === 'live' ? 'live' : 'mock';
  const strict = args.strict;
  const engines =
    args.engines.length > 0
      ? spec.engines.filter((engine) => args.engines.includes(engine.id))
      : mode === 'live'
        ? spec.engines.filter((engine) =>
            ['fever', 'chest_pain', 'shortness_of_breath'].includes(engine.id)
          )
        : spec.engines;
  const paths =
    args.paths.length > 0
      ? PATH_TYPES.filter((pathType) => args.paths.includes(pathType))
      : mode === 'live'
        ? ['positive', 'must_not_miss']
        : PATH_TYPES;

  ensure(engines.length > 0, 'No engine scenarios selected.');
  ensure(paths.length > 0, 'No path scenarios selected.');

  const scenarios = buildScenarioMatrix(engines, paths);
  const server = mode === 'live' ? await ensureE2EServer(baseUrl) : { stop: async () => {} };

  let passed = 0;
  try {
    for (const scenario of scenarios) {
      await runScenario({ scenario, mode, strict });
      passed += 1;
      console.log(`PASS ${scenario.id}`);
    }
    console.log(
      `Encounter matrix passed (${passed}/${scenarios.length}) in ${mode} mode${strict ? '' : ' (audit)'}.`
    );
  } finally {
    await server.stop();
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
