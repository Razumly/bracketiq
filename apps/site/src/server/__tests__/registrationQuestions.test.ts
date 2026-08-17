/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { listRegistrationQuestions } from '@/server/registrationQuestions';

describe('registration question editor loading', () => {
  it('requests active rows only by default', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'active_1', scopeType: 'EVENT', scopeId: 'event_1', prompt: 'Active', answerType: 'TEXT', required: false, sortOrder: 0, isActive: true },
    ]);

    const rows = await listRegistrationQuestions({
      scopeType: 'EVENT',
      scopeId: 'event_1',
      client: { registrationQuestions: { findMany } },
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { scopeType: 'EVENT', scopeId: 'event_1', isActive: true },
    }));
    expect(rows.map((row) => row.id)).toEqual(['active_1']);
  });
});
