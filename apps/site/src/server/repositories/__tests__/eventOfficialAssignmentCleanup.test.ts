/** @jest-environment node */

import { clearRemovedEventOfficialMatchAssignments } from '@/server/repositories/events';

describe('clearRemovedEventOfficialMatchAssignments', () => {
  it('clears assignments when a retained official loses the assigned position or field', async () => {
    const update = jest.fn().mockResolvedValue({});
    const client = {
      matches: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'match_position',
            fieldId: 'field_1',
            officialId: 'official_1',
            officialCheckedIn: true,
            officialIds: [{
              holderType: 'OFFICIAL',
              eventOfficialId: 'event_official_1',
              userId: 'official_1',
              positionId: 'position_removed',
              slotIndex: 0,
              checkedIn: true,
              hasConflict: false,
            }],
          },
          {
            id: 'match_field',
            fieldId: 'field_2',
            officialId: 'official_1',
            officialCheckedIn: true,
            officialIds: [{
              holderType: 'OFFICIAL',
              eventOfficialId: 'event_official_1',
              userId: 'official_1',
              positionId: 'position_kept',
              slotIndex: 0,
              checkedIn: true,
              hasConflict: false,
            }],
          },
        ]),
        update,
      },
    } as any;

    const updatedCount = await clearRemovedEventOfficialMatchAssignments(
      client,
      'event_1',
      [{
        id: 'event_official_1',
        userId: 'official_1',
        positionIds: ['position_kept'],
        fieldIds: ['field_1'],
        isActive: true,
      }],
    );

    expect(updatedCount).toBe(2);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 'match_position' },
      data: {
        officialIds: [{
          positionId: 'position_removed',
          slotIndex: 0,
          holderType: 'OFFICIAL',
          userId: null,
          eventOfficialId: null,
          checkedIn: false,
          hasConflict: false,
        }],
        officialId: null,
        officialCheckedIn: false,
      },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 'match_field' },
      data: {
        officialIds: [{
          positionId: 'position_kept',
          slotIndex: 0,
          holderType: 'OFFICIAL',
          userId: null,
          eventOfficialId: null,
          checkedIn: false,
          hasConflict: false,
        }],
        officialId: null,
        officialCheckedIn: false,
      },
    });
  });

  it('preserves bound PLAYER holders while filling missing named slots as unbound officials', async () => {
    const update = jest.fn().mockResolvedValue({});
    const repositoryClient = {
      matches: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'match_player_holder',
          fieldId: 'field_1',
          officialId: null,
          officialCheckedIn: false,
          officialIds: [{
            positionId: 'line_judge',
            slotIndex: 1,
            holderType: 'PLAYER',
            userId: 'player_1',
            eventOfficialId: null,
            checkedIn: true,
            hasConflict: true,
          }],
        }]),
        update,
      },
    };
    // The focused fake implements exactly the repository delegates exercised here.
    const client = repositoryClient as unknown as Parameters<
      typeof clearRemovedEventOfficialMatchAssignments
    >[0];

    const updatedCount = await clearRemovedEventOfficialMatchAssignments(
      client,
      'event_1',
      [],
      [{ id: 'line_judge', name: 'Line Judge', count: 2, order: 0 }],
    );

    expect(updatedCount).toBe(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'match_player_holder' },
      data: {
        officialIds: [
          {
            positionId: 'line_judge',
            slotIndex: 0,
            holderType: 'OFFICIAL',
            userId: null,
            eventOfficialId: null,
            checkedIn: false,
            hasConflict: false,
          },
          {
            positionId: 'line_judge',
            slotIndex: 1,
            holderType: 'PLAYER',
            userId: 'player_1',
            eventOfficialId: null,
            checkedIn: true,
            hasConflict: true,
          },
        ],
        officialId: null,
        officialCheckedIn: false,
      },
    });
  });

});
