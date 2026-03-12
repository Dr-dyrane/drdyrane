import { UserProfile } from '../types/clinical';

const isMeaningfulName = (value: string | undefined): boolean => {
  const normalized = (value || '').trim();
  if (!normalized) return false;
  return normalized.toLowerCase() !== 'patient';
};

const isValidAge = (value: number | undefined): boolean =>
  typeof value === 'number' && !Number.isNaN(value) && value >= 0 && value <= 125;

const isValidSex = (value: UserProfile['sex'] | undefined): boolean => Boolean(value);

export const isProfileOnboardingComplete = (profile: UserProfile): boolean =>
  isMeaningfulName(profile.display_name) && isValidAge(profile.age) && isValidSex(profile.sex);

export const getProfileOnboardingProgress = (
  profile: UserProfile
): {
  completed: number;
  total: number;
  ratio: number;
  missing: Array<'name' | 'age' | 'sex'>;
} => {
  const missing: Array<'name' | 'age' | 'sex'> = [];
  if (!isMeaningfulName(profile.display_name)) missing.push('name');
  if (!isValidAge(profile.age)) missing.push('age');
  if (!isValidSex(profile.sex)) missing.push('sex');

  const total = 3;
  const completed = total - missing.length;

  return {
    completed,
    total,
    ratio: completed / total,
    missing,
  };
};

