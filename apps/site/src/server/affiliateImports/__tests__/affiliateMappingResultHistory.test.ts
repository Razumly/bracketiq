/** @jest-environment node */

import { stableAgentArtifactSha256 } from '../agentContracts';
import {
  appendAffiliateMappingHistory,
  appendAffiliateMappingResultHistory,
  archiveAffiliateMappingResultEnvelope,
  assertAffiliateMappingResultHistory,
  affiliateArchivedMappingResultEnvelopeSchema,
  affiliateMappingHistorySha256,
  affiliateMappingHistoryPrefixSchema,
  affiliateMappingResultHistoryPrefixes,
  verifyAffiliateMappingResultHistory,
} from '../affiliateMappingResultHistory';

const priorEnvelope = () => ({
  result: {
    status: 'HUMAN_REVIEW_REQUIRED',
    sourceSportLabels: ['Soccer'],
  },
  claimEvidenceContext: {
    evidenceRunId: 'run_1',
    sportsCatalogSha256: 'a'.repeat(64),
  },
  sportReconciliationHistory: [{
    strategyRevision: 'sport-evidence-v1',
    queuedAt: '2026-08-10T00:00:00.000Z',
  }],
  mappingRepairHistory: [{
    repairReason: 'PACKAGE_VALIDATION_FAILED',
  }],
});

describe('affiliate mapping result history', () => {
  it('archives non-history fields and records deterministic sorted prefixes', () => {
    const envelope = priorEnvelope();
    const archived = archiveAffiliateMappingResultEnvelope(envelope);

    expect(archived).toEqual({
      result: envelope.result,
      claimEvidenceContext: envelope.claimEvidenceContext,
      historyPrefixes: [
        {
          field: 'mappingRepairHistory',
          count: 1,
          sha256: stableAgentArtifactSha256(envelope.mappingRepairHistory),
        },
        {
          field: 'sportReconciliationHistory',
          count: 1,
          sha256: stableAgentArtifactSha256(envelope.sportReconciliationHistory),
        },
      ],
    });
    expect(archived).not.toHaveProperty('mappingRepairHistory');
    expect(archived).not.toHaveProperty('sportReconciliationHistory');
    expect(verifyAffiliateMappingResultHistory(envelope, archived)).toBe(true);
    const laterEnvelope = appendAffiliateMappingResultHistory(
      envelope,
      'mappingRepairHistory',
      { repairReason: 'LATER_REPAIR' },
    );
    expect(verifyAffiliateMappingResultHistory(laterEnvelope, archived)).toBe(true);
    expect(verifyAffiliateMappingResultHistory(archived)).toBe(true);
    assertAffiliateMappingResultHistory(envelope, archived);
  });

  it('keeps history hashes stable and appends without mutating the prior envelope', () => {
    const envelope = priorEnvelope();
    const entry = { repairReason: 'SPORT_CATALOG_MISMATCH' };
    const appended = appendAffiliateMappingResultHistory(
      envelope,
      'mappingRepairHistory',
      entry,
    );

    expect(envelope.mappingRepairHistory).toHaveLength(1);
    expect(appended.mappingRepairHistory).toEqual([
      ...envelope.mappingRepairHistory,
      entry,
    ]);
    expect(affiliateMappingHistorySha256(appended.mappingRepairHistory as unknown[]))
      .toBe(stableAgentArtifactSha256(appended.mappingRepairHistory));
    expect(affiliateMappingResultHistoryPrefixes(appended)).toEqual([
      {
        field: 'mappingRepairHistory',
        count: 2,
        sha256: stableAgentArtifactSha256(appended.mappingRepairHistory),
      },
      {
        field: 'sportReconciliationHistory',
        count: 1,
        sha256: stableAgentArtifactSha256(appended.sportReconciliationHistory),
      },
    ]);
    const archived = archiveAffiliateMappingResultEnvelope(envelope);
    const withArchivedPriorSummary = appendAffiliateMappingResultHistory(
      envelope,
      'sportReconciliationHistory',
      { archivedPriorResultSummary: archived },
    );
    expect(withArchivedPriorSummary.sportReconciliationHistory).toHaveLength(2);

    const viaObjectInput = appendAffiliateMappingHistory({
      envelope: appended,
      field: 'sportResolutionHistory',
      entry: { selected: ['Indoor Soccer'] },
    });
    expect(viaObjectInput.sportResolutionHistory).toEqual([{ selected: ['Indoor Soccer'] }]);
  });

  it('rejects nested histories so archives cannot grow recursively', () => {
    expect(() => archiveAffiliateMappingResultEnvelope({
      mappingRepairHistory: [{
        repairReason: 'OLD',
        sportReconciliationHistory: [],
      }],
    })).toThrow('recursive');

    expect(() => appendAffiliateMappingResultHistory(
      priorEnvelope(),
      'sportResolutionHistory',
      { nested: { mappingRepairHistory: [] } },
    )).toThrow('recursive');
  });

  it('detects a tampered prefix, count, or non-history field', () => {
    const envelope = priorEnvelope();
    const archived = archiveAffiliateMappingResultEnvelope(envelope);

    const tamperedHash = {
      ...archived,
      historyPrefixes: archived.historyPrefixes.map((prefix) => (
        prefix.field === 'mappingRepairHistory'
          ? { ...prefix, sha256: 'b'.repeat(64) }
          : prefix
      )),
    };
    expect(verifyAffiliateMappingResultHistory(envelope, tamperedHash)).toBe(false);

    const tamperedCount = {
      ...archived,
      historyPrefixes: archived.historyPrefixes.map((prefix) => (
        prefix.field === 'mappingRepairHistory'
          ? { ...prefix, count: 2 }
          : prefix
      )),
    };
    expect(verifyAffiliateMappingResultHistory(envelope, tamperedCount)).toBe(false);

    expect(verifyAffiliateMappingResultHistory(
      { ...envelope, result: { ...envelope.result, sourceSportLabels: ['Volleyball'] } },
      archived,
    )).toBe(false);
    expect(() => assertAffiliateMappingResultHistory(envelope, tamperedHash)).toThrow('invalid');
  });

  it('rejects malformed and self-referential archive metadata', () => {
    expect(() => affiliateMappingHistoryPrefixSchema.parse({
      field: 'sportResolutionHistory',
      count: -1,
      sha256: 'a'.repeat(64),
    })).toThrow();
    expect(() => affiliateArchivedMappingResultEnvelopeSchema.parse({})).toThrow();

    expect(verifyAffiliateMappingResultHistory(priorEnvelope(), {
      result: priorEnvelope().result,
      historyPrefixes: [{
        field: 'historyPrefixes',
        count: 0,
        sha256: 'a'.repeat(64),
      }],
    })).toBe(false);

    expect(() => archiveAffiliateMappingResultEnvelope({
      historyPrefixes: [],
    })).toThrow('historyPrefixes');
  });
});
