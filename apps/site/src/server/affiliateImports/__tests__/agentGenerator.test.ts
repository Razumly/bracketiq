/** @jest-environment node */

import fs from 'node:fs/promises';
import ts from 'typescript';
import {
  renderAffiliateSourceDraft,
  writeAffiliateGeneratedFiles,
} from '../agentGenerator';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const draft = {
  schemaVersion: 2,
  contextContractVersion: 2,
  intakeId: 'intake_river_city',
  sourceKey: 'river-city-soccer',
  runId: 'run_river_city',
  policyDisposition: 'ALLOWED',
  implementationMode: 'GENERIC_MAPPING',
  listingKind: 'EVENT',
  evidence: [{
    artifactKind: 'PAGE_HTML',
    artifactSha256: HASH_A,
    pageUrl: 'https://rivercity.example/events',
    supports: ['title', 'officialActionUrl'],
  }],
  organization: {
    name: 'River City Sports Club',
    website: 'https://rivercity.example',
    description: 'Local sports organization.',
    city: 'Portland',
    address: '100 Main Street',
  },
  mapping: {
    kind: 'EVENT',
    listUrl: 'https://rivercity.example/events',
    itemSelector: '.event-card',
    fields: {
      title: { selector: '.title' },
      officialActionUrl: {
        selector: 'a.register',
        mode: 'attribute',
        attribute: 'href',
        transform: 'absoluteUrl',
      },
    },
  },
  expectedCandidates: [{
    listingKind: 'EVENT',
    title: 'River City Summer League',
    officialActionUrl: 'https://rivercity.example/register',
    sourceUrl: 'https://rivercity.example/events',
    sportName: 'Grass Soccer',
    tags: ['League'],
    venueName: 'River City Sports Complex',
    address: '100 Main Street',
    city: 'Portland',
    startsAt: null,
    dateDisplayMode: 'NO_FIXED_DATE',
    dateDisplayText: 'Registration open',
    priceText: null,
    divisions: ['Adult'],
  }],
  logo: {
    disposition: 'OFFICIAL_ASSET',
    artifactSha256: HASH_B,
    sourceUrl: 'https://rivercity.example/logo.png',
  },
  warnings: [],
  unresolvedQuestions: [],
  sportDeterminations: [{
    sourceLabels: ['outdoor soccer'],
    status: 'RESOLVED',
    resolutionBasis: 'SOURCE_EVIDENCE',
    canonicalSportNames: ['Grass Soccer'],
    rationale: 'Outdoor soccer is explicitly described.',
    evidence: [{
      artifactId: 'artifact_events',
      artifactSha256: HASH_A,
      artifactKind: 'PAGE_HTML',
      pageUrl: 'https://rivercity.example/events',
      excerpt: 'outdoor soccer',
    }],
  }],
};

describe('affiliate mapping deterministic generator', () => {
  it('renders byte-identical constrained source files', () => {
    const first = renderAffiliateSourceDraft(draft, ['Grass Soccer']);
    const second = renderAffiliateSourceDraft(draft, ['Grass Soccer']);
    expect(second).toEqual(first);
    expect(first.map((file) => file.path)).toEqual([
      'apps/site/scripts/setup-river-city-soccer-affiliate-source.ts',
      'apps/site/src/server/affiliateImports/__tests__/river-city-soccerGeneratedSource.test.ts',
      'apps/site/src/server/affiliateImports/generatedSources/river-city-soccerGeneratedSource.ts',
      'docs/affiliate-source-registry-fragments/river-city-soccer.md',
    ]);
    const setup = first.find((file) => file.path.startsWith('apps/site/scripts/'))?.content ?? '';
    expect(setup).toContain('autoScrapeEnabled: false');
    expect(setup).toContain('validatedAt: null');
    expect(setup).toContain("importMode: 'REVIEW'");
    expect(setup).toContain("process.argv.includes('--scrape')");
    expect(setup).toContain('configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE)');
    expect(setup).toContain("process.env.STORAGE_PROVIDER = 'spaces'");
    expect(setup).not.toContain('Generated agent setup scripts are local-only');
    expect(setup).not.toContain('autoScrapeEnabled: true');
    expect(setup).not.toContain("update: { logoId: null");
    for (const file of first.filter((candidateFile) => candidateFile.path.endsWith('.ts'))) {
      const transpiled = ts.transpileModule(file.content, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
        },
        reportDiagnostics: true,
      });
      expect(transpiled.diagnostics ?? []).toEqual([]);
    }
  });

  it('refuses blocked, insufficient, and custom-extractor proposals', () => {
    for (const implementationMode of [
      'BLOCKED',
      'INSUFFICIENT_EVIDENCE',
      'CUSTOM_EXTRACTOR_REQUIRED',
    ]) {
      const nonExecutable = {
        ...draft,
        policyDisposition: implementationMode === 'BLOCKED' ? 'BLOCKED' : 'ALLOWED',
        implementationMode,
        listingKind: implementationMode === 'BLOCKED' ? null : draft.listingKind,
        mapping: null,
        expectedCandidates: [],
        logo: implementationMode === 'BLOCKED'
          ? { disposition: 'MISSING', artifactSha256: null, sourceUrl: null }
          : draft.logo,
      };
      expect(() => renderAffiliateSourceDraft(nonExecutable)).toThrow(
        `Draft mode ${implementationMode} cannot generate executable files.`,
      );
    }
  });

  it('rejects unsafe source keys before constructing paths', () => {
    expect(() => renderAffiliateSourceDraft({
      ...draft,
      sourceKey: '../../escape',
    })).toThrow();
  });

  it('writes idempotently and refuses to overwrite human changes', async () => {
    const temporaryDirectory = await fs.mkdtemp('/tmp/affiliate-agent-generator-');
    const files = renderAffiliateSourceDraft(draft, ['Grass Soccer']);
    try {
      const first = await writeAffiliateGeneratedFiles({
        rootDirectory: temporaryDirectory,
        files,
      });
      expect(first.written).toHaveLength(4);
      expect(first.unchanged).toHaveLength(0);

      const second = await writeAffiliateGeneratedFiles({
        rootDirectory: temporaryDirectory,
        files,
      });
      expect(second.written).toHaveLength(0);
      expect(second.unchanged).toHaveLength(4);

      const changedPath = `${temporaryDirectory}/${files[0].path}`;
      await fs.appendFile(changedPath, '\nHuman edit.\n');
      await expect(writeAffiliateGeneratedFiles({
        rootDirectory: temporaryDirectory,
        files,
      })).rejects.toThrow('Refusing to overwrite changed generated file');
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
