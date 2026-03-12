import { ClerkingSchema, ConversationMessage, SOAPState, UserProfile } from '../../types/clinical';

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();

const appendUniqueLine = (base: string, line: string): string => {
  const normalizedLine = normalize(line);
  if (!normalizedLine) return base;

  const currentLines = base
    .split('\n')
    .map((item) => normalize(item))
    .filter(Boolean);

  if (currentLines.some((item) => item.toLowerCase() === normalizedLine.toLowerCase())) {
    return currentLines.join('\n');
  }

  return [...currentLines, normalizedLine].join('\n').slice(0, 900);
};

const getChiefComplaint = (conversation: ConversationMessage[]): string =>
  normalize(conversation.find((entry) => entry.role === 'patient')?.content || '');

const getLatestPatientUpdate = (conversation: ConversationMessage[]): string =>
  normalize(
    [...conversation].reverse().find((entry) => entry.role === 'patient')?.content || ''
  );

const soapEntriesToLines = (soapSection: Record<string, unknown>): string[] =>
  Object.entries(soapSection || {})
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .map((line) => normalize(line))
    .filter(Boolean)
    .slice(0, 10);

export const buildAutoClerking = (
  existing: ClerkingSchema,
  soap: SOAPState,
  conversation: ConversationMessage[],
  profile: UserProfile
): ClerkingSchema => {
  let hpc = existing.hpc || '';
  let pmh = existing.pmh || '';
  let dh = existing.dh || '';
  let sh = existing.sh || '';
  const fh = existing.fh || '';

  const chiefComplaint = getChiefComplaint(conversation);
  const latestUpdate = getLatestPatientUpdate(conversation);

  if (chiefComplaint) hpc = appendUniqueLine(hpc, `Chief complaint: ${chiefComplaint}`);
  if (latestUpdate && latestUpdate !== chiefComplaint) {
    hpc = appendUniqueLine(hpc, `Latest update: ${latestUpdate}`);
  }
  for (const line of soapEntriesToLines(soap.S || {})) {
    hpc = appendUniqueLine(hpc, line);
  }

  if (profile.chronic_conditions) {
    pmh = appendUniqueLine(pmh, profile.chronic_conditions);
  }
  for (const line of soapEntriesToLines(soap.O || {})) {
    pmh = appendUniqueLine(pmh, line);
  }

  if (profile.medications) {
    dh = appendUniqueLine(dh, `Meds: ${profile.medications}`);
  }
  if (profile.allergies) {
    dh = appendUniqueLine(dh, `Allergies: ${profile.allergies}`);
  }
  for (const line of soapEntriesToLines(soap.P || {})) {
    dh = appendUniqueLine(dh, line);
  }

  if (profile.pronouns) {
    sh = appendUniqueLine(sh, `Pronouns: ${profile.pronouns}`);
  }

  return {
    hpc: normalize(hpc),
    pmh: normalize(pmh),
    dh: normalize(dh),
    sh: normalize(sh),
    fh: normalize(fh),
  };
};
