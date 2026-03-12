import { ClinicalState, ConversationMessage } from '../../types/clinical';

const symptomMatchers: Array<{ label: string; pattern: RegExp }> = [
  { label: 'fever', pattern: /\bfever|hot and cold|chills?\b/i },
  { label: 'headache', pattern: /\bheadache|head pain\b/i },
  { label: 'body aches', pattern: /\bbody aches?|myalgia|joint pain\b/i },
  { label: 'nausea', pattern: /\bnausea\b/i },
  { label: 'vomiting', pattern: /\bvomit|throwing up\b/i },
  { label: 'diarrhea', pattern: /\bdiarrh|loose stool\b/i },
  { label: 'cough', pattern: /\bcough\b/i },
  { label: 'chest pain', pattern: /\bchest pain|rib pain\b/i },
  { label: 'fatigue', pattern: /\bfatigue|weakness|tired\b/i },
];

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

const extractSymptomFacts = (conversation: ConversationMessage[]): string[] => {
  const symptoms = new Set<string>();
  const patientMessages = getPatientMessages(conversation);
  for (const message of patientMessages) {
    const text = message.content || '';
    for (const matcher of symptomMatchers) {
      if (matcher.pattern.test(text)) {
        symptoms.add(matcher.label);
      }
    }
  }
  return Array.from(symptoms);
};

export const buildEncounterDossier = (state: ClinicalState): string => {
  const patientMessages = getPatientMessages(state.conversation);
  const chiefComplaint = normalize(patientMessages[0]?.content || '');
  const latestPatient = normalize(patientMessages[patientMessages.length - 1]?.content || '');
  const qaPairs = extractQaPairs(state.conversation);
  const symptoms = extractSymptomFacts(state.conversation);

  const lines = [
    chiefComplaint ? `Chief complaint: ${chiefComplaint}` : 'Chief complaint: unavailable',
    latestPatient ? `Latest update: ${latestPatient}` : null,
    symptoms.length ? `Symptoms captured: ${symptoms.join(', ')}` : null,
    state.profile.age ? `Age: ${state.profile.age}` : null,
    state.profile.sex ? `Sex: ${state.profile.sex}` : null,
    qaPairs.length ? `Recent Q/A: ${qaPairs.join(' | ')}` : null,
    `SOAP-S: ${JSON.stringify(state.soap.S || {})}`,
    `SOAP-O: ${JSON.stringify(state.soap.O || {})}`,
    `SOAP-A: ${JSON.stringify(state.soap.A || {})}`,
    `SOAP-P: ${JSON.stringify(state.soap.P || {})}`,
  ].filter(Boolean) as string[];

  return lines.join('\n').slice(0, 2200);
};
