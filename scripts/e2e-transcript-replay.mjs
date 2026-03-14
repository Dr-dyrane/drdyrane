import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureE2EServer } from './e2eServer.mjs';
import {
  InvariantValidator,
  detectOptionIntent,
  detectQuestionIntent,
  hasSingleQuestion,
} from './lib/invariantValidator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultSpecPath = path.join(__dirname, 'specs', 'transcript-replay.json');

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';

const parseArgs = (argv) => {
  const args = {
    strict: true,
    requireLlm: false,
    scenarios: [],
    spec: defaultSpecPath,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--audit') {
      args.strict = false;
      continue;
    }
    if (arg === '--require-llm') {
      args.requireLlm = true;
      continue;
    }
    if (arg === '--scenarios' && argv[index + 1]) {
      args.scenarios = argv[index + 1]
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === '--spec' && argv[index + 1]) {
      const next = argv[index + 1].trim();
      args.spec = path.isAbsolute(next) ? next : path.resolve(process.cwd(), next);
      index += 1;
    }
  }

  return args;
};

const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};

const hasAnyLlmKey = () =>
  Boolean(
    String(process.env.OPENAI_API_KEY || '').trim() ||
      String(process.env.ANTHROPIC_API_KEY || '').trim() ||
      String(process.env.CLAUDE_API_KEY || '').trim()
  );

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
    display_name: 'Transcript Patient',
    age: 34,
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

const callJson = async (url, payload) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  return { response, body };
};

const runLiveTurn = async ({ state, patientInput, turnLabel }) => {
  const consultResult = await callJson(`${baseUrl}/api/consult`, {
    patientInput,
    state,
  });

  ensure(consultResult.response.ok, `${turnLabel}: /api/consult failed (${consultResult.response.status})`);
  ensure(hasSingleQuestion(consultResult.body.question), `${turnLabel}: expected one focused question`);

  const optionsPayload = {
    lastQuestion: consultResult.body.question,
    agentState: consultResult.body.agent_state || state.agent_state,
    currentSOAP: state.soap,
  };
  const optionsResult = await callJson(`${baseUrl}/api/options`, optionsPayload);
  ensure(optionsResult.response.ok, `${turnLabel}: /api/options failed (${optionsResult.response.status})`);

  return {
    consult: consultResult.body,
    options: optionsResult.body,
  };
};

const applyConsultSideEffects = (state, patientInput, consult) => {
  appendConversation(state, patientInput, consult);
  mergeSoapUpdates(state, consult.soap_updates);
  state.ddx = Array.isArray(consult.ddx) ? consult.ddx : state.ddx;
  state.agent_state = consult.agent_state || state.agent_state;
  state.urgency = consult.urgency || state.urgency;
  state.probability = Number(consult.probability) || state.probability;
};

const assertTurnContract = ({ scenario, turnIndex, response, options, assertion }) => {
  const label = `${scenario.id}.turn${turnIndex + 1}`;
  if (!assertion) return;

  if (assertion.intent) {
    const actualIntent = detectQuestionIntent(response.question);
    ensure(actualIntent === assertion.intent, `${label}: expected intent ${assertion.intent}, got ${actualIntent || 'none'}`);
  }

  if (Array.isArray(assertion.intent_one_of) && assertion.intent_one_of.length > 0) {
    const actualIntent = detectQuestionIntent(response.question);
    ensure(
      assertion.intent_one_of.includes(actualIntent),
      `${label}: expected intent in [${assertion.intent_one_of.join(', ')}], got ${actualIntent || 'none'}`
    );
  }

  if (assertion.option_intent) {
    const actualOptionIntent = detectOptionIntent(options);
    ensure(
      actualOptionIntent === assertion.option_intent,
      `${label}: expected option intent ${assertion.option_intent}, got ${actualOptionIntent || 'none'}`
    );
  }

  if (Array.isArray(assertion.option_intent_one_of) && assertion.option_intent_one_of.length > 0) {
    const actualOptionIntent = detectOptionIntent(options);
    ensure(
      assertion.option_intent_one_of.includes(actualOptionIntent),
      `${label}: expected option intent in [${assertion.option_intent_one_of.join(', ')}], got ${actualOptionIntent || 'none'}`
    );
  }

  if (Array.isArray(assertion.status_one_of) && assertion.status_one_of.length > 0) {
    ensure(
      assertion.status_one_of.includes(response.status),
      `${label}: status ${response.status || 'unknown'} not in [${assertion.status_one_of.join(', ')}]`
    );
  }
};

const assertFinalContract = ({ scenario, finalResponse, state }) => {
  const label = scenario.id;
  const final = scenario.final || {};
  const ddxBlob = (state.ddx || []).join(' ').toLowerCase();

  ensure(Array.isArray(state.ddx) && state.ddx.length > 0, `${label}: ddx should be populated`);
  ensure(Object.keys(state.soap.S || {}).length > 0, `${label}: soap.S should be populated`);
  ensure(
    Array.isArray(state.agent_state.pending_actions) && state.agent_state.pending_actions.length > 0,
    `${label}: pending_actions should be populated`
  );

  if (Array.isArray(final.ddx_contains_any) && final.ddx_contains_any.length > 0) {
    const hasMatch = final.ddx_contains_any.some((keyword) => ddxBlob.includes(String(keyword).toLowerCase()));
    ensure(hasMatch, `${label}: expected ddx to include one of [${final.ddx_contains_any.join(', ')}]`);
  }

  if (Array.isArray(final.status_one_of) && final.status_one_of.length > 0) {
    ensure(
      final.status_one_of.includes(finalResponse.status),
      `${label}: final status ${finalResponse.status || 'unknown'} not in [${final.status_one_of.join(', ')}]`
    );
  }

  if (Array.isArray(final.urgency_one_of) && final.urgency_one_of.length > 0) {
    ensure(
      final.urgency_one_of.includes(finalResponse.urgency),
      `${label}: final urgency ${finalResponse.urgency || 'unknown'} not in [${final.urgency_one_of.join(', ')}]`
    );
  }

  if (final.require_checkpoint) {
    const checkpoint = state.agent_state.must_not_miss_checkpoint || {};
    ensure(
      typeof checkpoint.status === 'string',
      `${label}: must_not_miss_checkpoint.status should be present`
    );
  }
};

const runScenario = async ({ scenario, strict }) => {
  const state = makeInitialState();
  const validator = new InvariantValidator({ strict });
  let finalResponse = null;

  for (let turnIndex = 0; turnIndex < scenario.transcript.length; turnIndex += 1) {
    const turn = scenario.transcript[turnIndex];
    const turnLabel = `${scenario.id}.turn${turnIndex + 1}`;
    const live = await runLiveTurn({
      state,
      patientInput: turn.input,
      turnLabel,
    });

    validator.validateTurn({
      scenarioId: scenario.id,
      turnIndex,
      patientInput: turn.input,
      response: live.consult,
      options: live.options,
    });

    assertTurnContract({
      scenario,
      turnIndex,
      response: live.consult,
      options: live.options,
      assertion: turn.assert,
    });

    applyConsultSideEffects(state, turn.input, live.consult);
    finalResponse = live.consult;
  }

  assertFinalContract({ scenario, finalResponse, state });
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  const spec = JSON.parse(fs.readFileSync(args.spec, 'utf-8'));
  if (!hasAnyLlmKey() && !args.requireLlm) {
    console.log('SKIP transcript replay: no OPENAI_API_KEY or ANTHROPIC_API_KEY in environment.');
    return;
  }

  if (!Array.isArray(spec.scenarios) || spec.scenarios.length === 0) {
    throw new Error('Transcript replay spec is empty.');
  }

  const scenarios =
    args.scenarios.length > 0
      ? spec.scenarios.filter((scenario) => args.scenarios.includes(scenario.id))
      : spec.scenarios;

  ensure(scenarios.length > 0, 'No transcript scenarios selected.');

  const server = await ensureE2EServer(baseUrl);
  let passed = 0;
  try {
    for (const scenario of scenarios) {
      await runScenario({ scenario, strict: args.strict });
      passed += 1;
      console.log(`PASS ${scenario.id}`);
    }
    console.log(
      `Transcript replay passed (${passed}/${scenarios.length})${args.strict ? '' : ' (audit mode)'}.`
    );
  } finally {
    await server.stop();
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
