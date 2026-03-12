import { ClinicalState } from '../../types/clinical';

type ProfileUpdates = Partial<ClinicalState['profile']>;

export const extractProfileUpdates = (input: string): ProfileUpdates | null => {
  const normalized = input.toLowerCase();
  const updates: ProfileUpdates = {};

  const ageMatch = normalized.match(/\b(\d{1,3})\s*(years old|yo|y\/o|yrs old|yrs)\b/);
  const plainAgeMatch = normalized.match(/\bi am\s+(\d{1,3})\b/);
  const ageCandidate = ageMatch?.[1] || plainAgeMatch?.[1];
  if (ageCandidate) {
    const ageValue = Number(ageCandidate);
    if (!Number.isNaN(ageValue) && ageValue >= 0 && ageValue <= 125) {
      updates.age = ageValue;
    }
  }

  if (/\b(female|woman)\b/.test(normalized)) {
    updates.sex = 'female';
  } else if (/\b(male|man)\b/.test(normalized)) {
    updates.sex = 'male';
  }

  const nameMatch = input.match(/\bmy name is\s+([a-zA-Z][a-zA-Z\s'-]{1,40})/i);
  if (nameMatch?.[1]) {
    updates.display_name = nameMatch[1].trim();
  }

  const pronounMatch = normalized.match(/\b(my pronouns are|pronouns)\s+([a-z/]+)\b/);
  if (pronounMatch?.[2]) {
    updates.pronouns = pronounMatch[2];
  }

  const allergyMatch = input.match(/\ballergic to\s+([^.!,;]+)/i);
  if (allergyMatch?.[1]) {
    updates.allergies = allergyMatch[1].trim();
  }

  return Object.keys(updates).length > 0 ? updates : null;
};

export const getProfileDelta = (
  currentProfile: ClinicalState['profile'],
  updates: ProfileUpdates
): ProfileUpdates | null => {
  const delta: ProfileUpdates = {};
  (Object.keys(updates) as Array<keyof ClinicalState['profile']>).forEach((key) => {
    const nextValue = updates[key];
    if (nextValue !== undefined && currentProfile[key] !== nextValue) {
      (delta as Record<string, unknown>)[key] = nextValue;
    }
  });

  return Object.keys(delta).length > 0 ? delta : null;
};

export const mergeProfile = (
  currentProfile: ClinicalState['profile'],
  updates: ProfileUpdates
): ClinicalState['profile'] => ({
  ...currentProfile,
  ...updates,
  updated_at: Date.now(),
});
