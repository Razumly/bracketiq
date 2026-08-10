import { createHash } from 'node:crypto';
import {
  affiliateSportsCatalogSha256,
  affiliateSportsCatalogSnapshotSchema,
  buildAffiliateSportsCatalogSnapshot,
  loadAffiliateSportsCatalogSnapshot,
} from '../affiliateSportsCatalog';

describe('affiliate sports catalog snapshot', () => {
  const rows = [
    { id: 'z', name: 'Soccer' },
    { id: 'a', name: 'Indoor Soccer' },
    { id: 'b', name: 'Indoor Soccer 2' },
  ];

  it('sorts by code-unit name then id and hashes without capturedAt', () => {
    const first = buildAffiliateSportsCatalogSnapshot(rows, '2026-08-10T00:00:00.000Z');
    const second = buildAffiliateSportsCatalogSnapshot([...rows].reverse(), '2027-01-01T00:00:00.000Z');
    expect(first.sports).toEqual([
      { id: 'a', name: 'Indoor Soccer' },
      { id: 'b', name: 'Indoor Soccer 2' },
      { id: 'z', name: 'Soccer' },
    ]);
    expect(first.sha256).toBe(second.sha256);
    expect(first.sha256).toBe(affiliateSportsCatalogSha256(first.sports));
    expect(first.sha256).toBe(affiliateSportsCatalogSha256([...rows].reverse()));
    expect(first.sha256).toBe(createHash('sha256').update(JSON.stringify({
      schemaVersion: 1,
      sports: first.sports,
    })).digest('hex'));
  });

  it.each([
    ['empty catalog', []],
    ['blank id', [{ id: ' ', name: 'Soccer' }]],
    ['padded id', [{ id: ' id', name: 'Soccer' }]],
    ['padded name', [{ id: '1', name: ' Soccer' }]],
    ['duplicate id', [{ id: '1', name: 'Soccer' }, { id: '1', name: 'Futsal' }]],
    ['duplicate exact name', [{ id: '1', name: 'Soccer' }, { id: '2', name: 'Soccer' }]],
    ['case-folded name collision', [{ id: '1', name: 'Soccer' }, { id: '2', name: 'soccer' }]],
  ])('rejects %s', (_label, invalidRows) => {
    expect(() => buildAffiliateSportsCatalogSnapshot(invalidRows, '2026-08-10T00:00:00.000Z')).toThrow();
  });

  it('strictly verifies a supplied snapshot hash and ordering', () => {
    const snapshot = buildAffiliateSportsCatalogSnapshot(rows, '2026-08-10T00:00:00.000Z');
    expect(affiliateSportsCatalogSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(() => affiliateSportsCatalogSnapshotSchema.parse({
      ...snapshot,
      sha256: '0'.repeat(64),
    })).toThrow(/hash/i);
    expect(() => affiliateSportsCatalogSnapshotSchema.parse({
      ...snapshot,
      sports: [...snapshot.sports].reverse(),
    })).toThrow(/sorted/i);
  });

  it('loads only id and name from an injectable current catalog query', async () => {
    const findMany = jest.fn().mockResolvedValue(rows);
    const snapshot = await loadAffiliateSportsCatalogSnapshot({ sports: { findMany } }, '2026-08-10T00:00:00.000Z');
    expect(findMany).toHaveBeenCalledWith({ select: { id: true, name: true } });
    expect(snapshot.sports).toHaveLength(rows.length);
  });
});
