export class EventRegistrationConfigurationError extends Error {}

export const assertEventRegistrationConfiguration = (
  eventType: string | null,
  affiliateUrl: string,
): void => {
  if (eventType && !['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT', 'TRYOUT'].includes(eventType)) {
    throw new EventRegistrationConfigurationError(
      'Select a supported Event Type. External Registration is a registration destination.',
    );
  }
  if (!affiliateUrl.trim()) return;
  try {
    const url = new URL(affiliateUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new EventRegistrationConfigurationError('Enter a valid external registration URL.');
  }
};
