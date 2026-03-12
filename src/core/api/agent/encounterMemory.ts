import { ClinicalState, ConversationMessage } from '../../types/clinical';

const findingMatchers: Array<{ label: string; positive: RegExp; negative?: RegExp }> = [
  { label: 'fever', positive: /\bfever|hot and cold|pyrexia\b/i, negative: /\bno fever\b/i },
  { label: 'chills/rigors', positive: /\bchills?|rigors?\b/i, negative: /\bno chills?|no rigors?\b/i },
  { label: 'intermittent fever pattern', positive: /\bintermittent|cyclic|comes and goes|on and off\b/i },
  { label: 'nocturnal fever worsening', positive: /\bnight|nocturnal|worse at night|evening chills|morning relief\b/i },
  { label: 'mosquito exposure', positive: /\bmosquito(es)? bite(s)?|sleeping without net|mosquito exposure\b/i },
  { label: 'bitter/acid taste', positive: /\bbitter taste|acid taste|metallic taste\b/i },
  { label: 'headache', positive: /\bheadache|head pain\b/i, negative: /\bno headache\b/i },
  { label: 'body aches', positive: /\bbody aches?|myalgia|joint pain\b/i, negative: /\bno body aches?|no myalgia\b/i },
  { label: 'nausea', positive: /\bnausea\b/i, negative: /\bno nausea\b/i },
  { label: 'vomiting', positive: /\bvomit|throwing up\b/i, negative: /\bno vomit|no vomiting\b/i },
  { label: 'diarrhea', positive: /\bdiarrh|loose stool\b/i, negative: /\bno diarrh|no loose stool\b/i },
  { label: 'cough', positive: /\bcough\b/i, negative: /\bno cough\b/i },
  { label: 'shortness of breath', positive: /\bshortness of breath|breathless|dyspnea\b/i, negative: /\bno shortness of breath|no breathless\b/i },
  { label: 'chest pain', positive: /\bchest pain|rib pain\b/i, negative: /\bno chest pain\b/i },
  { label: 'abdominal pain', positive: /\babdominal pain|stomach pain|belly pain\b/i, negative: /\bno abdominal pain|no stomach pain\b/i },
  { label: 'dysuria', positive: /\bdysuria|burning urination|painful urination\b/i, negative: /\bno dysuria|no burning urination\b/i },
  { label: 'fatigue/weakness', positive: /\bfatigue|weakness|tired\b/i, negative: /\bno fatigue|no weakness\b/i },
  { label: 'rash/bleeding', positive: /\brash|bleeding|gum bleed|nose bleed\b/i, negative: /\bno rash|no bleeding\b/i },
];

const affirmativeAnswerPattern = /\b(yes|yeah|yep|correct|affirmative|true)\b/i;
const negativeAnswerPattern = /\b(no|none|nope|not at all|false)\b/i;
const unclearAnswerPattern = /\b(not sure|unsure|unknown|maybe)\b/i;

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();

const getPatientMessages = (conversation: ConversationMessage[]): ConversationMessage[] =>
  conversation.filter((entry) => entry.role === 'patient');

const extractQaPairs = (conversation: ConversationMessage[]): string[] => {
  const pairs: string[] = [];
  for (let index = 0; index < conversation.length; index += 1) {
    const current = conversation[index];
    if (current.role !== 'patient') continue;

    for (let reverse = index - 1; reverse >= 0; reverse -= 1) {
      const candidate = conversation[reverse];
      if (candidate.role !== 'doctor') continue;
      const question = normalize(candidate.metadata?.question || candidate.content || '');
      if (!question) break;
      const answer = normalize(current.content || '');
      if (!answer) break;
      pairs.push(`${question} => ${answer}`);
      break;
    }
  }

  const dedup = Array.from(new Set(pairs));
  return dedup.slice(-8);
};

const inferFindingFromQuestion = (question: string): string | null => {
  const normalized = question.toLowerCase();
  for (const matcher of findingMatchers) {
    if (matcher.positive.test(normalized)) {
      return matcher.label;
    }
  }
  return null;
};

export const deriveFindingMemory = (
  state: ClinicalState
): { positive: string[]; negative: string[] } => {
  const positive = new Set<string>(state.agent_state?.positive_findings || []);
  const negative = new Set<string>(state.agent_state?.negative_findings || []);
  const patientMessages = getPatientMessages(state.conversation);

  for (const message of patientMessages) {
    const text = message.content || '';
    for (const matcher of findingMatchers) {
      if (matcher.negative?.test(text)) {
        negative.add(matcher.label);
        positive.delete(matcher.label);
        continue;
      }
      if (matcher.positive.test(text)) {
        positive.add(matcher.label);
        negative.delete(matcher.label);
      }
    }
  }

  for (let index = 0; index < state.conversation.length; index += 1) {
    const current = state.conversation[index];
    if (current.role !== 'patient') continue;
    const answer = normalize(current.content || '');
    if (!answer || unclearAnswerPattern.test(answer)) continue;

    let question = '';
    for (let reverse = index - 1; reverse >= 0; reverse -= 1) {
      const candidate = state.conversation[reverse];
      if (candidate.role !== 'doctor') continue;
      question = normalize(candidate.metadata?.question || candidate.content || '');
      if (question) break;
    }
    if (!question) continue;

    const inferredFinding = inferFindingFromQuestion(question);
    if (!inferredFinding) continue;

    if (negativeAnswerPattern.test(answer)) {
      negative.add(inferredFinding);
      positive.delete(inferredFinding);
      continue;
    }
    if (affirmativeAnswerPattern.test(answer)) {
      positive.add(inferredFinding);
      negative.delete(inferredFinding);
    }
  }

  const soapSubjective = JSON.stringify(state.soap?.S || {}).toLowerCase();
  for (const matcher of findingMatchers) {
    if (matcher.negative?.test(soapSubjective)) {
      negative.add(matcher.label);
      positive.delete(matcher.label);
      continue;
    }
    if (matcher.positive.test(soapSubjective)) {
      positive.add(matcher.label);
      negative.delete(matcher.label);
    }
  }

  return {
    positive: Array.from(positive).slice(0, 24),
    negative: Array.from(negative).slice(0, 24),
  };
};

const buildLongitudinalMemorySummary = (state: ClinicalState): string | null => {
  const archives = Array.isArray(state.archives) ? state.archives.slice(0, 12) : [];
  if (archives.length === 0) return null;

  const priorDiagnoses = Array.from(
    new Set(
      archives
        .map((record) => normalize(record.diagnosis || ''))
        .filter(Boolean)
    )
  ).slice(0, 8);

  const recentComplaints = archives
    .map((record) => normalize(record.complaint || ''))
    .filter(Boolean)
    .slice(0, 8);

  const highRiskHistory = archives.some((record) => record.status === 'emergency');

  const sections = [
    priorDiagnoses.length ? `Prior diagnoses: ${priorDiagnoses.join(', ')}` : null,
    recentComplaints.length ? `Recent complaints: ${recentComplaints.join(' | ')}` : null,
    `Past encounters: ${archives.length}`,
    highRiskHistory ? 'Emergency history: yes' : 'Emergency history: no',
  ].filter(Boolean) as string[];

  return sections.join(' | ');
};

export const buildEncounterDossier = (state: ClinicalState): string => {
  const patientMessages = getPatientMessages(state.conversation);
  const chiefComplaint = normalize(patientMessages[0]?.content || '');
  const latestPatient = normalize(patientMessages[patientMessages.length - 1]?.content || '');
  const qaPairs = extractQaPairs(state.conversation);
  const findingMemory = deriveFindingMemory(state);
  const longitudinalSummary = buildLongitudinalMemorySummary(state);

  const lines = [
    chiefComplaint ? `Chief complaint: ${chiefComplaint}` : 'Chief complaint: unavailable',
    latestPatient ? `Latest update: ${latestPatient}` : null,
    findingMemory.positive.length ? `Positive findings: ${findingMemory.positive.join(', ')}` : null,
    findingMemory.negative.length ? `Negative findings: ${findingMemory.negative.join(', ')}` : null,
    longitudinalSummary ? `Longitudinal memory: ${longitudinalSummary}` : null,
    state.profile.age ? `Age: ${state.profile.age}` : null,
    state.profile.weight_kg ? `Weight: ${state.profile.weight_kg} kg` : null,
    state.profile.sex ? `Sex: ${state.profile.sex}` : null,
    qaPairs.length ? `Recent Q/A: ${qaPairs.join(' | ')}` : null,
    `SOAP-S: ${JSON.stringify(state.soap.S || {})}`,
    `SOAP-O: ${JSON.stringify(state.soap.O || {})}`,
    `SOAP-A: ${JSON.stringify(state.soap.A || {})}`,
    `SOAP-P: ${JSON.stringify(state.soap.P || {})}`,
  ].filter(Boolean) as string[];

  return lines.join('\n').slice(0, 2200);
};
