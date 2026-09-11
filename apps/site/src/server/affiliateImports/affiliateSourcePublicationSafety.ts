type CandidateVisibility = {
  listingKind?: unknown;
  status?: unknown;
  publishedEventId?: unknown;
  publishedTeamId?: unknown;
  publishedFacilityId?: unknown;
  publishedOrganizationId?: unknown;
};

type OrganizationVisibility = {
  id?: unknown;
  status?: unknown;
  publicPageEnabled?: unknown;
  publicWidgetsEnabled?: unknown;
};

const normalizedUpper = (value: unknown): string => String(value ?? '').trim().toUpperCase();

export const hasPublicAffiliateCandidate = (
  candidate: CandidateVisibility,
  sourceOrganizationId: unknown,
  organizations: readonly OrganizationVisibility[],
): boolean => {
  if (candidate.publishedEventId || candidate.publishedTeamId || candidate.publishedFacilityId) return true;
  if (candidate.publishedOrganizationId) {
    const organization = organizations.find((row) => row.id === candidate.publishedOrganizationId);
    return normalizedUpper(candidate.listingKind) !== 'CLUB'
      || candidate.publishedOrganizationId !== sourceOrganizationId
      || !organization
      || normalizedUpper(organization.status) !== 'UNLISTED'
      || organization.publicPageEnabled === true
      || organization.publicWidgetsEnabled === true;
  }
  return normalizedUpper(candidate.status) === 'PUBLISHED';
};
