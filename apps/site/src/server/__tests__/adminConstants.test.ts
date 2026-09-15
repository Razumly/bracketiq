const prismaMock = {
  sports: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  sportCategories: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  leagueScoringConfigs: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  AdminConstantsInputError,
  loadAdminConstants,
  normalizePatchForKind,
  parseAdminConstantKind,
  updateAdminConstantByKind,
} from '@/server/adminConstants';

describe('sport category admin constants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.sportCategories.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);
    prismaMock.leagueScoringConfigs.findMany.mockResolvedValue([]);
  });

  it('parses and normalizes the category update contract', () => {
    expect(parseAdminConstantKind('sport-categories')).toBe('sport-categories');
    expect(normalizePatchForKind('sport-categories', {
      name: ' Soccer ',
      sportIds: [' sport-1 ', 'sport-2'],
      displayOrder: '20',
    })).toEqual({
      name: 'Soccer',
      sportIds: ['sport-1', 'sport-2'],
      displayOrder: 20,
    });
  });

  it('rejects a category update with an unknown Sport ID', async () => {
    prismaMock.sports.findMany.mockResolvedValue([{ id: 'sport-1' }]);

    await expect(updateAdminConstantByKind(
      'sport-categories',
      'soccer',
      { sportIds: ['sport-1', 'missing-sport'] },
      prismaMock,
    )).rejects.toEqual(expect.objectContaining({
      message: 'Unknown sport IDs: missing-sport',
      status: 400,
    }));
    expect(prismaMock.sportCategories.update).not.toHaveBeenCalled();
  });

  it('validates member IDs before updating a category', async () => {
    prismaMock.sports.findMany.mockResolvedValue([{ id: 'sport-1' }, { id: 'sport-2' }]);
    prismaMock.sportCategories.update.mockResolvedValue({
      id: 'soccer',
      name: 'Soccer',
      sportIds: ['sport-1', 'sport-2'],
      displayOrder: 10,
    });

    await expect(updateAdminConstantByKind(
      'sport-categories',
      'soccer',
      { sportIds: ['sport-1', 'sport-2'] },
      prismaMock,
    )).resolves.toEqual(expect.objectContaining({ id: 'soccer' }));
    expect(prismaMock.sports.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['sport-1', 'sport-2'] } },
      select: { id: true },
    });
    expect(prismaMock.sportCategories.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'soccer' },
      data: expect.objectContaining({ sportIds: ['sport-1', 'sport-2'] }),
    }));
  });

  it('loads categories beside the existing admin constant collections', async () => {
    const categories = [{ id: 'soccer', name: 'Soccer', sportIds: ['sport-1'], displayOrder: 10 }];
    prismaMock.sportCategories.findMany.mockResolvedValue(categories);

    await expect(loadAdminConstants(prismaMock)).resolves.toEqual(expect.objectContaining({
      sports: [],
      sportCategories: categories,
      divisions: [],
      leagueScoringConfigs: [],
    }));
  });

  it('uses the shared input error for invalid category fields', () => {
    expect(() => normalizePatchForKind('sport-categories', { sportIds: ['sport-1', 2] }))
      .toThrow(AdminConstantsInputError);
  });
});
