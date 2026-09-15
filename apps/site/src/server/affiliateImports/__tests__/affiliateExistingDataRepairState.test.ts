/** @jest-environment node */

import { captureAffiliateExistingRepairSourceState } from '../affiliateExistingDataRepairState';

describe('existing-data repair source state', () => {
  it('rejects a correction hold that coexists with a pending mapping pointer', async () => {
    const hold = {
      schemaVersion: 1 as const,
      sourceId: 'source_1',
      supplySourceId: 'root_1',
      mappingJobId: 'mapping_job_1',
      admissionHash: 'a'.repeat(64),
      priorPendingMappingHash: 'b'.repeat(64),
    };
    const database = {
      affiliateScrapeSources: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'source_1',
          supplySourceId: 'root_1',
          metadata: {
            existingDataRepairCorrectionHold: hold,
            pendingMapping: {},
          },
        }),
      },
      affiliateSupplySources: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'root_1',
          metadata: {
            existingDataRepairCorrectionHold: hold,
            pendingMapping: {},
          },
        }),
      },
      affiliateScrapeMappings: { findUnique: jest.fn() },
      affiliateImportCandidates: { findMany: jest.fn() },
      affiliateSupplyTargets: { findMany: jest.fn() },
    };

    await expect(
      captureAffiliateExistingRepairSourceState(database as never, 'source_1'),
    ).rejects.toThrow('cannot coexist with a pending mapping pointer');
    expect(database.affiliateScrapeMappings.findUnique).not.toHaveBeenCalled();
    expect(database.affiliateImportCandidates.findMany).not.toHaveBeenCalled();
    expect(database.affiliateSupplyTargets.findMany).not.toHaveBeenCalled();
  });
});
