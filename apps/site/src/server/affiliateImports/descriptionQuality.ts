export type AffiliateDescriptionEntityKind = 'EVENT' | 'ORGANIZATION';

export type AffiliateDescriptionQualityIssue = {
  code: 'MISSING_DESCRIPTION' | 'DISCOVERY_NARRATION' | 'URL_DESCRIPTION';
  message: string;
};

const discoveryVerbs = '(?:listed|shown|found|published|posted)';
const genericSubjects = '(?:(?:this|that|the|a|an)\\s+)?(?:event|organization|org|record|listing|league|tournament|club)';

const absoluteOrProtocolRelativeUrlPattern = /^(?:[a-z][a-z\d+.-]*:\/\/|\/\/)[^\s/]+(?:\/[^\s]*)?$/i;
const rootRelativeUrlPattern = /^\/(?!\/)\S*$/;
const schemeLessUrlPattern = /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}(?:[/?#]\S*)?$/i;
const passiveDiscoveryPattern = new RegExp(`^${discoveryVerbs}\\s+(?:by|on|at)\\b`, 'i');
const sourceProvenanceCuePattern = /\b(?:website|site|webpage|page|homepage|source|listing|agent|mapper|scraper|crawler|importer)\b|(?:https?:\/\/|\bwww\.)/i;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const descriptionClauses = (description: string): string[] => description
  .split(/[.!?;](?=\s|$)|\n+/)
  .map((clause) => clause.trim())
  .filter(Boolean);

const sourceSubjectPatterns: RegExp[] = [
  /^(?:(?:the|this)\s+)?(?:(?:official|public)\s+)?(?:website|site|source|listing|page|homepage)\s+(?:says|states|shows|lists|publishes|posts|describes)\b/i,
  /^according\s+to\s+(?:(?:our|their|the|this)\s+)?(?:(?:official|public)\s+)?(?:website|site|source|listing|page|homepage)\b/i,
  new RegExp(
    `^(?:(?:our|the)\\s+)?(?:(?:mapping|discovery|affiliate|research)\\s+)?(?:agent|mapper|scraper|crawler|importer)\\s+${discoveryVerbs}\\b`,
    'i',
  ),
];

const discoveryTransferPatterns: RegExp[] = [
  /\b(?:scraped|captured|mapped|imported)\s+from\b/i,
  /\b(?:stored|captured|scraped)\s+(?:HTML|Markdown|evidence|homepage|page)\b/i,
];

const hasDiscoveryNarration = (input: {
  name: string;
  description: string;
}): boolean => {
  const name = input.name.trim();
  const namedSubject = name
    ? `(?:the\\s+)?${escapeRegExp(name).replace(/\s+/g, '\\s+')}(?!\\w)`
    : '';
  const subject = [namedSubject, genericSubjects].filter(Boolean).join('|');
  const subjectProvenancePattern = new RegExp(
    `(?:^|[.!?;]\\s+|\\n\\s*)(?:${subject})\\s+(?:(?:is|was|are|were|has been|have been|had been|can be|could be|may be|might be|will be|would be|be|being)\\s+)?${discoveryVerbs}\\s+(?:by|on|at)\\b`,
    'i',
  );
  const firstPersonDiscoveryPattern = new RegExp(
    `(?:^|[.!?;]\\s+|\\n\\s*)(?:I|we|our\\s+team)\\s+(?:found|listed|showed|published|posted|mapped|imported|captured|scraped)\\s+(?:${subject})\\s+(?:by|on|at|from|through|via)\\b`,
    'i',
  );
  const completedAgentReportPattern = new RegExp(
    `(?:^|[.!?;]\\s+|\\n\\s*)(?:I|we|our\\s+team)\\s+(?:found|mapped|imported|captured|scraped)\\s+(?:${subject})(?=\\s*(?:[.!?;]|$))`,
    'i',
  );

  return subjectProvenancePattern.test(input.description)
    || firstPersonDiscoveryPattern.test(input.description)
    || completedAgentReportPattern.test(input.description)
    || descriptionClauses(input.description).some((clause) => (
    sourceSubjectPatterns.some((pattern) => pattern.test(clause))
    || discoveryTransferPatterns.some((pattern) => pattern.test(clause))
    || (passiveDiscoveryPattern.test(clause) && sourceProvenanceCuePattern.test(clause))
  ));
};

export const analyzeAffiliateDescriptionQuality = (input: {
  kind: AffiliateDescriptionEntityKind;
  name: string;
  description: string | null | undefined;
}): AffiliateDescriptionQualityIssue[] => {
  const description = input.description?.trim() ?? '';
  if (!description) {
    return [{
      code: 'MISSING_DESCRIPTION',
      message: `${input.kind === 'EVENT' ? 'Event' : 'Organization'} description is missing.`,
    }];
  }

  if (absoluteOrProtocolRelativeUrlPattern.test(description)
    || rootRelativeUrlPattern.test(description)
    || schemeLessUrlPattern.test(description)) {
    return [{
      code: 'URL_DESCRIPTION',
      message: 'Description contains only a URL instead of source prose.',
    }];
  }

  const issues: AffiliateDescriptionQualityIssue[] = [];
  if (hasDiscoveryNarration({ name: input.name, description })) {
    issues.push({
      code: 'DISCOVERY_NARRATION',
      message: 'Description narrates where the record was found instead of describing the subject.',
    });
  }
  return issues;
};

