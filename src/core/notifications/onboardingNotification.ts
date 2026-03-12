import { AppNotification } from '../types/clinical';

export const ONBOARDING_NOTIFICATION_TITLE = 'Complete Intake Profile';
export const ONBOARDING_NOTIFICATION_BODY =
  'Finish your intake details before consultation so Dr. Dyrane can reason with full context.';

export const isOnboardingNotification = (
  notification: Pick<AppNotification, 'title'>
): boolean => notification.title.trim().toLowerCase() === ONBOARDING_NOTIFICATION_TITLE.toLowerCase();

