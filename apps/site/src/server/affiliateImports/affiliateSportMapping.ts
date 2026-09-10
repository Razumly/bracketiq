export const BLACKLISTED_AFFILIATE_SPORT_NAMES = [
  'Cheerleading',
  'Dance',
  'Running',
  'Swimming',
  'Track and Field',
  'Golf',
] as const;

const blacklistedAffiliateSportNameSet = new Set(
  BLACKLISTED_AFFILIATE_SPORT_NAMES.map((name) => name.toLowerCase()),
);

const codeUnitCompare = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

const canonicalSportNamesFromCatalog = (catalogNames: readonly string[]): string[] => (
  Array.from(new Set(
    catalogNames
      .map((name) => (typeof name === 'string' ? name.trim() : ''))
      .filter(Boolean),
  )).sort(codeUnitCompare)
);

const normalizedString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

export const isAffiliateSportBlacklisted = (value: unknown): boolean => (
  typeof value === 'string'
    && blacklistedAffiliateSportNameSet.has(value.trim().toLowerCase())
);

export type AffiliateAgentSportIssue = {
  path: string;
  sportName: string | null;
  canonicalSuggestion: string | null;
  code: 'SPORT_NAME_REQUIRED' | 'SPORT_NAME_NOT_CANONICAL' | 'SPORT_NOT_IN_CATALOG' | 'SPORT_BLACKLISTED';
  message: string;
};

export const affiliateAgentCanonicalSportNames = (
  catalogNames: readonly string[],
): string[] => canonicalSportNamesFromCatalog(catalogNames);

export const validateAffiliateAgentSportName = (
  value: unknown,
  path: string,
  catalogNames: readonly string[],
): AffiliateAgentSportIssue | null => {
  const sportName = normalizedString(value);
  if (!sportName) {
    return {
      path,
      sportName: null,
      canonicalSuggestion: null,
      code: 'SPORT_NAME_REQUIRED',
      message: 'Executable affiliate mappings require an exact canonical sport name.',
    };
  }

  // Blacklist policy is intentionally checked before catalog membership. A
  // blacklisted name remains ineligible even when the live catalog contains it.
  if (isAffiliateSportBlacklisted(sportName)) {
    return {
      path,
      sportName,
      canonicalSuggestion: null,
      code: 'SPORT_BLACKLISTED',
      message: `The sport ${sportName} is blacklisted because BracketIQ does not support tournament or league scoring for it. Send it to human review; do not add it to the catalog or replace it with another sport.`,
    };
  }

  const canonicalSportNames = canonicalSportNamesFromCatalog(catalogNames);
  const canonicalSportNameSet = new Set(canonicalSportNames);
  if (canonicalSportNameSet.has(sportName)) return null;

  const canonicalSportNamesByLowercase = new Map(
    canonicalSportNames.map((name) => [name.toLowerCase(), name]),
  );
  const canonicalSuggestion = canonicalSportNamesByLowercase.get(sportName.toLowerCase()) ?? null;
  if (canonicalSuggestion) {
    return {
      path,
      sportName,
      canonicalSuggestion,
      code: 'SPORT_NAME_NOT_CANONICAL',
      message: `Use the exact canonical sport name ${canonicalSuggestion}.`,
    };
  }

  return {
    path,
    sportName,
    canonicalSuggestion: null,
    code: 'SPORT_NOT_IN_CATALOG',
    message: `The sport ${sportName} is not in the BracketIQ sports catalog. Send it to human review; do not guess a surface or replacement sport.`,
  };
};

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const asUnknownArray = (value: unknown): unknown[] => (
  Array.isArray(value) ? value : []
);

export const collectAffiliateAgentSportIssues = (
  draft: unknown,
  catalogNames: readonly string[],
): AffiliateAgentSportIssue[] => {
  const draftRecord = asRecord(draft);
  const implementationMode = draftRecord?.implementationMode;
  const executable = implementationMode === 'GENERIC_MAPPING'
    || implementationMode === 'MANUAL_CANDIDATES';
  if (!executable) return [];
  const issues: AffiliateAgentSportIssue[] = [];
  const collectCandidateIssues = (candidateValue: unknown, path: string) => {
    const candidate = asRecord(candidateValue);
    const sportNames = asUnknownArray(candidate?.sportNames);
    if (sportNames.length > 0) {
      sportNames.forEach((sportName: unknown, sportIndex: number) => {
        const issue = validateAffiliateAgentSportName(
          sportName,
          `${path}.sportNames.${sportIndex}`,
          catalogNames,
        );
        if (issue) issues.push(issue);
      });
      if (candidate?.sportName != null) {
        const issue = validateAffiliateAgentSportName(candidate.sportName, `${path}.sportName`, catalogNames);
        if (issue) issues.push(issue);
      }
      return;
    }
    const issue = validateAffiliateAgentSportName(candidate?.sportName, `${path}.sportName`, catalogNames);
    if (issue) issues.push(issue);
  };

  asUnknownArray(draftRecord?.expectedCandidates).forEach((candidate, index) => {
    collectCandidateIssues(candidate, `expectedCandidates.${index}`);
  });

  const mapping = asRecord(draftRecord?.mapping);
  asUnknownArray(mapping?.manualCandidates).forEach((candidate, index) => {
    collectCandidateIssues(candidate, `mapping.manualCandidates.${index}`);
  });

  const fields = asRecord(mapping?.fields);
  const sportField = asRecord(fields?.sportName);
  if (sportField?.mode === 'literal') {
    const issue = validateAffiliateAgentSportName(
      sportField.value,
      'mapping.fields.sportName.value',
      catalogNames,
    );
    if (issue) issues.push(issue);
  }
  if (sportField?.valueMap && typeof sportField.valueMap === 'object') {
    Object.entries(sportField.valueMap).forEach(([sourceValue, mappedValue]) => {
      const issue = validateAffiliateAgentSportName(
        mappedValue,
        `mapping.fields.sportName.valueMap.${sourceValue}`,
        catalogNames,
      );
      if (issue) issues.push(issue);
    });
  }

  const sportNamesField = asRecord(fields?.sportNames);
  if (sportNamesField?.mode === 'literal') {
    const values = String(sportNamesField.value ?? '').split(/[,;|]/).map((value) => value.trim()).filter(Boolean);
    values.forEach((value, index) => {
      const issue = validateAffiliateAgentSportName(value, `mapping.fields.sportNames.value.${index}`, catalogNames);
      if (issue) issues.push(issue);
    });
  }
  if (sportNamesField?.valueMap && typeof sportNamesField.valueMap === 'object') {
    Object.entries(sportNamesField.valueMap).forEach(([sourceValue, mappedValue]) => {
      String(mappedValue ?? '').split(/[,;|]/).map((value) => value.trim()).filter(Boolean).forEach((value, index) => {
        const issue = validateAffiliateAgentSportName(
          value,
          `mapping.fields.sportNames.valueMap.${sourceValue}.${index}`,
          catalogNames,
        );
        if (issue) issues.push(issue);
      });
    });
  }

  return issues;
};

/**
 * Enforces injected-catalog sport membership at executable boundaries.
 *
 * The context-free draft schema intentionally cannot perform this check because
 * catalog membership is claim-time data rather than compiled application data.
 */
export const assertAffiliateSourceDraftSports = (
  draft: unknown,
  catalogNames: readonly string[],
): void => {
  const issues = collectAffiliateAgentSportIssues(draft, catalogNames);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
  }
};
