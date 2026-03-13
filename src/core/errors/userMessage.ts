export type DrErrorContext = 'consult' | 'scan' | 'generic';

const sanitizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const stripTransportPrefixes = (message: string): string =>
  message
    .replace(/^(conversation|options|vision|scan plan)\s+api\s+error:\s*/i, '')
    .replace(/^(consultation interrupted|image intake failed):\s*/i, '')
    .replace(/^error:\s*/i, '')
    .trim();

const tryExtractJsonError = (message: string): string => {
  const trimmed = message.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return message;
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
    const extracted = sanitizeText(parsed.error) || sanitizeText(parsed.message);
    return extracted || message;
  } catch {
    return message;
  }
};

const isPayloadTooLarge = (text: string): boolean =>
  /entity too large|payload too large|request body too large|function payload too large|413\b/i.test(text);

const isInvalidImagePayload = (text: string): boolean =>
  /invalid image|base64|decode selected image|unable to read image|expects a base64|media type must be image/i.test(
    text
  );

const isNetworkFailure = (text: string): boolean =>
  /failed to fetch|networkerror|network request failed|load failed|connection reset|connection refused/i.test(text);

const isRateLimited = (text: string): boolean => /rate limit|too many requests|\b429\b/i.test(text);

const isServiceMisconfigured = (text: string): boolean =>
  /no llm api key configured|missing openai key|no anthropic key|no openai model configured|no anthropic model configured|provider api key configured/i.test(
    text
  );

const isTimeoutFailure = (text: string): boolean => /timeout|timed out|aborted/i.test(text);

const isRouteNotFound = (text: string): boolean =>
  /\b404\b|not found|cannot post|cannot get|no route matched|<!doctype html|<html/i.test(text);

export const toUserFriendlyErrorMessage = (
  error: unknown,
  context: DrErrorContext = 'generic'
): string => {
  const rawMessage =
    error instanceof Error
      ? sanitizeText(error.message)
      : sanitizeText(error) || 'Request failed unexpectedly.';
  const decoded = tryExtractJsonError(rawMessage);
  const normalized = stripTransportPrefixes(decoded);
  const lower = normalized.toLowerCase();

  if (!normalized || normalized === 'undefined') {
    return context === 'scan'
      ? 'Review interrupted. Please try again.'
      : 'Consultation interrupted. Please try again.';
  }

  if (isPayloadTooLarge(lower)) {
    return 'Image is too large for review. Crop or zoom in, then retry.';
  }

  if (isInvalidImagePayload(lower)) {
    return 'Image could not be processed. Use a clear JPG/PNG photo and retry.';
  }

  if (isNetworkFailure(lower)) {
    return 'Connection issue detected. Check internet and retry.';
  }

  if (isRateLimited(lower)) {
    return 'Dr service is busy right now. Wait a few seconds and retry.';
  }

  if (isServiceMisconfigured(lower)) {
    return 'Dr service is temporarily unavailable. Please try again shortly.';
  }

  if (isTimeoutFailure(lower)) {
    return 'Request timed out. Retry now.';
  }

  if (isRouteNotFound(lower)) {
    return 'Service route is unavailable. Refresh app and retry.';
  }

  if (/method not allowed|405\b/i.test(lower)) {
    return 'Service request method is invalid. Refresh app and retry.';
  }

  return normalized.length > 180
    ? context === 'scan'
      ? 'Review interrupted. Please retry.'
      : 'Consultation interrupted. Please retry.'
    : normalized;
};
