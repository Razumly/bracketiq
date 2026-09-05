export const profileClaimReturnPath = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.startsWith('/claim/player/') || /[\\\r\n\t]/.test(value)) return undefined;
  const url = new URL(value, 'https://bracket-iq.com');
  if (url.origin !== 'https://bracket-iq.com' || !url.pathname.startsWith('/claim/player/')) return undefined;
  return `${url.pathname}${url.search}`;
};
