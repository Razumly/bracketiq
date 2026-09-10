/** @jest-environment node */

import { createHash } from 'node:crypto';
import {
  AffiliateSportCitationTextLimitError,
  affiliateHumanSportResolutionSchema,
  affiliateHumanSportResolutionSha256,
  affiliateSportCitationTuple,
  affiliateSportCitationText,
  affiliateSportDeterminationSchema,
  affiliateSportDeterminationSha256,
  assertAffiliateHumanSportResolutionMatchesDeterminations,
  assertAffiliateSportCompletionReady,
  assertAffiliateSportDeterminationReasonStatusConsistency,
  isAffiliateSportCompletionReady,
  resolvedAffiliateSportNameUnion,
  sortAffiliateSportDeterminations,
  verifyAffiliateSportCompletion,
} from '../affiliateSportDetermination';
import { buildAffiliateSportsCatalogSnapshot } from '../affiliateSportsCatalog';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const catalog = buildAffiliateSportsCatalogSnapshot([
  { id: '1', name: 'Grass Soccer' },
  { id: '2', name: 'Indoor Soccer' },
  { id: '3', name: 'Golf' },
], '2026-08-10T00:00:00.000Z');

const citation = (overrides: Partial<{
  artifactId: string;
  artifactSha256: string;
  artifactKind: 'PAGE_HTML' | 'PAGE_MARKDOWN' | 'PAGE_SCREENSHOT';
  pageUrl: string;
  excerpt: string;
}> = {}) => ({
  artifactId: 'artifact-1',
  artifactSha256: HASH_A,
  artifactKind: 'PAGE_HTML' as const,
  pageUrl: 'HTTPS://example.com:443/sports#overview',
  excerpt: 'Outdoor soccer on grass fields',
  ...overrides,
});

const unresolved = {
  sourceLabels: ['Soccer'],
  status: 'VARIANT_UNRESOLVED' as const,
  resolutionBasis: 'SOURCE_EVIDENCE' as const,
  canonicalSportNames: [],
  rationale: 'The source says Soccer but never identifies a surface.',
  evidence: [citation()],
};

const resolved = {
  sourceLabels: ['Outdoor Soccer'],
  status: 'RESOLVED' as const,
  resolutionBasis: 'SOURCE_EVIDENCE' as const,
  canonicalSportNames: ['Grass Soccer'],
  rationale: 'The source expressly identifies outdoor grass soccer.',
  evidence: [citation({ artifactId: 'artifact-2', artifactSha256: HASH_B })],
};

describe('affiliate sport determinations', () => {
  it('requires evidence, status-consistent names, and sorted unique arrays', () => {
    expect(affiliateSportDeterminationSchema.parse(resolved)).toEqual(resolved);
    expect(() => affiliateSportDeterminationSchema.parse({
      ...resolved,
      canonicalSportNames: ['Grass Soccer', 'Grass Soccer'],
    })).toThrow(/sorted uniquely/i);
    expect(() => affiliateSportDeterminationSchema.parse({
      ...unresolved,
      evidence: [],
    })).toThrow();
    expect(() => affiliateSportDeterminationSchema.parse({
      ...unresolved,
      resolutionBasis: 'USER_DECISION',
      resolvedFromDeterminationSha256: HASH_A,
    })).toThrow(/unresolved/i);
  });

  it('rejects blacklisted source labels at current completion boundaries without rewriting history', () => {
    const unsupportedHistorical = {
      ...resolved,
      sourceLabels: ['Track and Field'],
      status: 'UNSUPPORTED' as const,
      canonicalSportNames: [],
      rationale: 'The historical envelope recorded Track and Field as unsupported.',
      evidence: [citation({ artifactId: 'artifact-3', excerpt: 'Track and Field' })],
    };
    expect(affiliateSportDeterminationSchema.parse(unsupportedHistorical)).toEqual(unsupportedHistorical);
    expect(affiliateSportDeterminationSha256(unsupportedHistorical)).toHaveLength(64);
    expect(() => assertAffiliateSportCompletionReady({
      determinations: [unsupportedHistorical],
      catalog,
      resultKind: 'HUMAN_REVIEW_REQUIRED',
      reasonCodes: ['SPORT_NOT_IN_CATALOG'],
    })).toThrow(/must use BLACKLISTED/i);

    const resolvedReplacement = {
      ...resolved,
      sourceLabels: ['Track and Field'],
      canonicalSportNames: ['Grass Soccer'],
      rationale: 'The historical envelope incorrectly mapped Track and Field to Grass Soccer.',
      evidence: [citation({ artifactId: 'artifact-5', excerpt: 'Track and Field' })],
    };
    expect(affiliateSportDeterminationSchema.parse(resolvedReplacement)).toEqual(resolvedReplacement);
    expect(affiliateSportDeterminationSha256(resolvedReplacement)).toHaveLength(64);
    expect(() => assertAffiliateSportCompletionReady({
      determinations: [resolvedReplacement],
      catalog,
      resultKind: 'REVIEW_REQUIRED',
    })).toThrow(/must use BLACKLISTED/i);

    expect(() => affiliateSportDeterminationSchema.parse({
      ...resolved,
      sourceLabels: ['Track and Field'],
      status: 'BLACKLISTED' as const,
      canonicalSportNames: ['Grass Soccer'],
    })).toThrow(/Only RESOLVED determinations may contain canonical sport names/i);
  });

  it('rejects mixed blacklisted and non-blacklisted labels in one exclusion determination', () => {
    const mixed = {
      ...resolved,
      sourceLabels: ['Indoor Soccer', 'Track and Field'],
      status: 'BLACKLISTED' as const,
      canonicalSportNames: [],
      rationale: 'The historical envelope combined Track and Field with Indoor Soccer.',
      evidence: [citation({ artifactId: 'artifact-6', excerpt: 'Track and Field' })],
    };
    expect(affiliateSportDeterminationSchema.parse(mixed)).toEqual(mixed);
    expect(affiliateSportDeterminationSha256(mixed)).toHaveLength(64);
    expect(() => assertAffiliateSportCompletionReady({
      determinations: [mixed],
      catalog,
      resultKind: 'HUMAN_REVIEW_REQUIRED',
      reasonCodes: ['SPORT_BLACKLISTED'],
    })).toThrow(/cannot mix blacklisted and non-blacklisted/i);
  });

  it('canonicalizes citation URLs and sorts citation tuples', () => {
    expect(affiliateSportCitationTuple(citation())).toEqual([
      'artifact-1',
      HASH_A,
      'PAGE_HTML',
      'https://example.com/sports#overview',
      'Outdoor soccer on grass fields',
    ]);
    const reversed = {
      ...resolved,
      evidence: [
        citation({ artifactId: 'z', artifactSha256: HASH_B }),
        citation({ artifactId: 'a', artifactSha256: HASH_A }),
      ],
    };
    expect(() => affiliateSportDeterminationSchema.parse(reversed)).toThrow(/sorted uniquely/i);
  });

  it('hashes the semantic determination independently of input array order', () => {
    const reordered = {
      ...resolved,
      sourceLabels: ['Outdoor Soccer'],
      canonicalSportNames: ['Grass Soccer'],
      evidence: [citation({ artifactId: 'artifact-2', artifactSha256: HASH_B })],
    };
    expect(affiliateSportDeterminationSha256(resolved)).toBe(affiliateSportDeterminationSha256(reordered));
    const sorted = sortAffiliateSportDeterminations([unresolved, resolved]);
    expect(sorted.map((item) => item.status)).toEqual(['RESOLVED', 'VARIANT_UNRESOLVED']);
  });

  it('computes the exact resolved-name union', () => {
    expect(resolvedAffiliateSportNameUnion([resolved, unresolved, {
      ...resolved,
      canonicalSportNames: ['Indoor Soccer'],
      sourceLabels: ['Indoor Soccer'],
      evidence: [citation({ artifactId: 'artifact-3' })],
    }])).toEqual(['Grass Soccer', 'Indoor Soccer']);
  });

  it('enforces resolution coverage, catalog membership, and blacklist policy', () => {
    const determination = affiliateSportDeterminationSchema.parse(unresolved);
    const determinationSha256 = affiliateSportDeterminationSha256(determination);
    const resolution = affiliateHumanSportResolutionSchema.parse({
      schemaVersion: 1,
      state: 'PENDING',
      decidedAt: '2026-08-10T00:00:00.000Z',
      decidedByUserId: 'admin-1',
      catalogSha256: catalog.sha256,
      priorResultSummarySha256: HASH_A,
      rationale: 'The evidence is generic, so an administrator selected the governed surface.',
      resolutions: [{
        determinationSha256,
        sourceLabels: ['Soccer'],
        canonicalSportNames: ['Grass Soccer'],
      }],
    });
    expect(() => assertAffiliateHumanSportResolutionMatchesDeterminations({
      resolution,
      determinations: [determination],
      catalog,
    })).not.toThrow();
    expect(() => assertAffiliateHumanSportResolutionMatchesDeterminations({
      resolution: {
        ...resolution,
        resolutions: [{ ...resolution.resolutions[0], canonicalSportNames: ['Golf'] }],
      },
      determinations: [determination],
      catalog,
    })).toThrow(/missing or blacklisted/i);
  });

  it.each(['Missing Sport', 'Golf'])('rejects resolved %s despite a permitted source label', (sportName) => {
    expect(() => assertAffiliateSportCompletionReady({
      determinations: [{ ...resolved, canonicalSportNames: [sportName] }],
      catalog,
      resultKind: 'REVIEW_REQUIRED',
    })).toThrow(expect.objectContaining({
      name: 'AffiliateSportVerificationError',
      path: ['sportDeterminations', 0, 'canonicalSportNames'],
    }));
  });

  it('requires consumed metadata only for consumed human resolutions and caps rationale', () => {
    const pending = {
      schemaVersion: 1 as const,
      state: 'PENDING' as const,
      decidedAt: '2026-08-10T00:00:00.000Z',
      decidedByUserId: 'admin-1',
      catalogSha256: HASH_A,
      priorResultSummarySha256: HASH_B,
      rationale: 'A decision.',
      resolutions: [],
    };
    expect(affiliateHumanSportResolutionSha256(pending)).toHaveLength(64);
    expect(() => affiliateHumanSportResolutionSchema.parse({
      ...pending,
      consumedAt: '2026-08-10T00:00:00.000Z',
    })).toThrow(/pending/i);
    expect(() => affiliateHumanSportResolutionSchema.parse({
      ...pending,
      state: 'CONSUMED',
    })).toThrow(/consumed/i);
    expect(() => affiliateHumanSportResolutionSchema.parse({
      ...pending,
      rationale: 'x'.repeat(2_001),
    })).toThrow();
  });

  it('checks reason/status consistency and completion readiness', () => {
    expect(() => assertAffiliateSportDeterminationReasonStatusConsistency({
      determinations: [unresolved],
      reasonCodes: [],
    })).toThrow(/SPORT_VARIANT_UNRESOLVED/);
    expect(() => assertAffiliateSportCompletionReady({
      determinations: [resolved],
      catalog,
      resultKind: 'REVIEW_REQUIRED',
    })).not.toThrow();
    const blacklisted = {
      ...resolved,
      sourceLabels: ['Track and Field'],
      status: 'BLACKLISTED' as const,
      resolutionBasis: 'SOURCE_EVIDENCE' as const,
      canonicalSportNames: [],
      rationale: 'The source explicitly names Track and Field, which remains excluded.',
      evidence: [citation({ artifactId: 'artifact-4', excerpt: 'Track and Field' })],
    };
    expect(() => assertAffiliateSportCompletionReady({
      determinations: sortAffiliateSportDeterminations([resolved, blacklisted]),
      catalog,
      resultKind: 'REVIEW_REQUIRED',
    })).not.toThrow();
    expect(() => assertAffiliateSportCompletionReady({
      determinations: [blacklisted],
      catalog,
      resultKind: 'HUMAN_REVIEW_REQUIRED',
      reasonCodes: ['SPORT_BLACKLISTED'],
    })).not.toThrow();
    expect(() => assertAffiliateSportCompletionReady({
      determinations: [unresolved],
      catalog,
      resultKind: 'REVIEW_REQUIRED',
    })).toThrow(/SPORT_VARIANT_UNRESOLVED/);
    expect(isAffiliateSportCompletionReady({
      determinations: [unresolved],
      catalog,
      resultKind: 'HUMAN_REVIEW_REQUIRED',
      reasonCodes: ['SPORT_VARIANT_UNRESOLVED'],
    })).toBe(true);
    expect(isAffiliateSportCompletionReady({
      determinations: [],
      catalog,
      resultKind: 'HUMAN_REVIEW_REQUIRED',
      reasonCodes: ['SPORT_NOT_IN_CATALOG'],
    })).toBe(false);
  });
  it('uses inert HTML text with decoded entities and no attribute or script content', async () => {
    const html = '<p title="hidden > attribute">Track&nbsp;<b>Records</b> &amp; results</p>'
      + '<!-- hidden comment --><script>hidden script</script><style>hidden style</style>'
      + '<template>hidden template</template>'
      + '<p>&lt;script&gt;literal&lt;/script&gt; &amp;lt;once&amp;gt;</p>';
    await expect(affiliateSportCitationText({ kind: 'PAGE_HTML' }, Buffer.from(html))).resolves.toBe(
      'Track Records & results <script>literal</script> &lt;once&gt;',
    );
  });

  it.each([
    ['lead<noscript>fallback<script>hidden</script><style>hidden</style></noscript>tail', 'lead fallback tail'],
    ['<svg><style/></svg><p>visible</p>', 'visible'],
    ['<svg/><style/>not-visible', ''],
    ['<svg><foreignObject><style/>not-visible</foreignObject></svg><p>visible</p>', ''],
  ])('preserves inert HTML context for %s', async (html, expected) => {
    await expect(affiliateSportCitationText({ kind: 'PAGE_HTML' }, Buffer.from(html))).resolves.toBe(expected);
  });

  it('preserves long text and Unicode during citation interpretation', async () => {
    const text = `${'a'.repeat(32_764)}😀${'b'.repeat(40_000)}`;
    await expect(affiliateSportCitationText(
      { kind: 'PAGE_HTML' }, Buffer.from(`<p>${text}&nbsp;end</p>`),
    )).resolves.toBe(`${text} end`);
  });

  it('rejects artifacts above the existing byte bound before parsing', async () => {
    await expect(affiliateSportCitationText(
      { kind: 'PAGE_HTML' }, Buffer.alloc(8 * 1024 * 1024 + 1, 120),
    )).rejects.toBeInstanceOf(AffiliateSportCitationTextLimitError);
  });

  it('rejects excessive markup and attribute work before DOM construction', async () => {
    await expect(affiliateSportCitationText(
      { kind: 'PAGE_HTML' }, Buffer.from('<b>x</b>'.repeat(4_097)),
    )).rejects.toBeInstanceOf(AffiliateSportCitationTextLimitError);
    await expect(affiliateSportCitationText(
      { kind: 'PAGE_HTML' }, Buffer.from(`<p ${'a="" '.repeat(16_385)}>text</p>`),
    )).rejects.toBeInstanceOf(AffiliateSportCitationTextLimitError);
  });

  it('verifies claim-owned artifacts, excerpts, exact run, and fresh catalog before completion', async () => {
    const bytes = Buffer.from('<p>Outdoor&nbsp;soccer on grass fields</p>', 'utf8');
    const bytesHash = createHash('sha256').update(bytes).digest('hex');
    const completionDetermination = {
      ...resolved,
      evidence: [citation({
        artifactId: 'artifact-2',
        artifactSha256: bytesHash,
        pageUrl: 'https://example.com/sports',
        excerpt: 'Outdoor soccer on grass fields',
      })],
    };
    const result = {
      status: 'REVIEW_REQUIRED' as const,
      evidenceRunId: 'run-1',
      sportsCatalogSha256: catalog.sha256,
      sportDeterminations: [completionDetermination],
    };
    const input = {
      result,
      claimEvidenceContext: {
        intakeId: 'intake-1',
        evidenceRunId: 'run-1',
        sportsCatalog: catalog,
      },
      freshCatalog: catalog,
      expectedIntakeId: 'intake-1',
      artifacts: [{
        artifactId: 'artifact-2',
        runId: 'run-1',
        intakeId: 'intake-1',
        kind: 'PAGE_HTML' as const,
        sourceUrl: 'https://example.com/sports',
        finalUrl: null,
        bytes,
      }],
    };

    await expect(verifyAffiliateSportCompletion(input, {})).resolves.toEqual(expect.objectContaining({
      evidenceRunId: 'run-1',
      sportsCatalogSha256: catalog.sha256,
      expectedSportNames: ['Grass Soccer'],
      observedSportNames: ['Grass Soccer'],
    }));
    await expect(verifyAffiliateSportCompletion({
      ...input,
      freshCatalog: buildAffiliateSportsCatalogSnapshot([
        ...catalog.sports,
        { id: '4', name: 'Futsal' },
      ], '2026-08-10T00:00:00.000Z'),
    }, {})).rejects.toMatchObject({ name: 'SPORT_CATALOG_MISMATCH' });
    await expect(verifyAffiliateSportCompletion({
      ...input,
      artifacts: [{ ...input.artifacts[0], runId: 'other-run' }],
    }, {})).rejects.toMatchObject({
      name: 'AffiliateSportVerificationError',
      path: ['sportDeterminations', 0, 'evidence', 0, 'artifactId'],
    });
    await expect(verifyAffiliateSportCompletion({
      ...input,
      artifacts: [{ ...input.artifacts[0], bytes: Buffer.from('tampered', 'utf8') }],
    }, {})).rejects.toMatchObject({
      name: 'AffiliateSportVerificationError',
      path: ['sportDeterminations', 0, 'evidence', 0, 'artifactSha256'],
    });
  });
});
