import { renderHook } from '@testing-library/react';

import type { FamilyChild } from '@/lib/familyService';
import { buildEvent, buildTeam, buildUser } from '../../../../../../../test/factories';
import { useEventParticipantModel } from '../useEventParticipantModel';

const futureStart = new Date('2099-08-01T19:00:00.000Z');

function child(overrides: Partial<FamilyChild> = {}): FamilyChild {
    return {
        userId: 'child-one',
        firstName: 'Avery',
        lastName: 'Rivera',
        dateOfBirth: '2088-01-01',
        linkStatus: 'ACTIVE',
        ...overrides,
    } as FamilyChild;
}

function renderModel(overrides: Partial<Parameters<typeof useEventParticipantModel>[0]> = {}) {
    const args = {
        event: buildEvent({ start: futureStart.toISOString(), teamSignup: false, maxParticipants: 4 }),
        user: buildUser({ $id: 'viewer-one' }), players: [], teams: [], freeAgents: [], children: [],
        childrenLoading: false, childrenError: null, selectedChildId: '', childRegistrationChildId: null,
        eventStartDate: futureStart, hasAgeLimits: false, selectedDivisionOption: null, canRegisterChild: true,
        ...overrides,
    };
    return renderHook(() => useEventParticipantModel({ ...args, isTeamSignup: Boolean(args.event.teamSignup) }));
}
describe('useEventParticipantModel', () => {
    it('does not offer child entry for Team Events or unknown birthdates', () => {
        const team = renderModel({ event: buildEvent({ teamSignup: true }), children: [child()] });
        expect(team.result.current.shouldShowChildRegistrationPanel).toBe(false);
        const unknown = renderModel({ children: [child({ dateOfBirth: undefined })] });
        expect(unknown.result.current.shouldShowChildRegistrationPanel).toBe(false);
        expect(unknown.result.current.childOptions).toEqual([]);
    });

    it('checks division age even when the child meets the Event age range', () => {
        const { result } = renderModel({ children: [child()], selectedChildId: 'child-one',
            eventMinAge: 10, eventMaxAge: 15, hasAgeLimits: true,
            selectedDivisionOption: { id: 'junior', key: 'junior', name: 'Junior', divisionTypeId: 'u10',
                divisionTypeName: 'U10', divisionTypeKey: 'u10', ratingType: 'AGE', gender: 'C' },
        });
        expect(result.current.childOptions).toEqual([]);
        expect(result.current.selectedChildEligible).toBe(false);
        expect(result.current.shouldShowChildRegistrationPanel).toBe(false);
    });
    it('derives participant capacity and merges normalized free-agent sources', () => {
        const event = buildEvent({
            teamSignup: false,
            maxParticipants: 4,
            userIds: ['player-one'],
            freeAgentIds: ['agent-one'],
        });
        const { result } = renderModel({
            event,
            players: [buildUser({ $id: 'player-one' }), buildUser({ $id: 'player-two' })],
            freeAgents: [buildUser({ $id: 'agent-one' }), buildUser({ $id: 'agent-two' })],
        });

        expect(result.current.totalParticipants).toBe(2);
        expect(result.current.participantCapacity).toBe(4);
        expect(result.current.spotsLeft).toBe(2);
        expect(result.current.eventFillPercent).toBe(50);
        expect(result.current.normalizedFreeAgentIds).toEqual(['agent-one', 'agent-two']);
    });

    it('recognizes team membership, waitlist, and free-agent viewer states', () => {
        const viewer = buildUser({ $id: 'viewer-one' });
        const event = buildEvent({
            teamSignup: true,
            waitListIds: ['viewer-one'],
            freeAgentIds: ['viewer-one'],
        });
        const { result } = renderModel({
            event,
            user: viewer,
            teams: [buildTeam({ playerIds: ['viewer-one'] })],
        });

        expect(result.current.isUserRegistered).toBe(true);
        expect(result.current.isUserWaitlisted).toBe(true);
        expect(result.current.isUserFreeAgent).toBe(true);
        expect(result.current.hasRefundTarget).toBe(true);
    });

    it('keeps an ineligible linked child visible when the child already has event state', () => {
        const underageChild = child({
            userId: 'child-underage',
            dateOfBirth: '2095-01-01',
        });
        const event = buildEvent({
            teamSignup: false,
            minAge: 12,
            waitListIds: ['child-underage'],
        });
        const { result } = renderHook(() => useEventParticipantModel({
            event,
            user: buildUser(),
            players: [],
            teams: [],
            freeAgents: [],
            children: [underageChild],
            childrenLoading: false,
            childrenError: null,
            selectedChildId: 'child-underage',
            childRegistrationChildId: null,
            eventStartDate: futureStart,
            eventMinAge: 12,
            eventMaxAge: undefined,
            hasAgeLimits: true,
            isTeamSignup: false,
            selectedDivisionOption: null,
            canRegisterChild: true,
        }));

        expect(result.current.childOptions).toEqual([
            expect.objectContaining({ value: 'child-underage' }),
        ]);
        expect(result.current.selectedChildEligible).toBe(false);
        expect(result.current.selectedChildIsWaitlisted).toBe(true);
        expect(result.current.hasRefundTarget).toBe(true);
    });

    it('exposes selected-child registration and completion status independently', () => {
        const linkedChild = child();
        const { result } = renderModel({
            event: buildEvent({ teamSignup: false, userIds: ['child-one'] }),
            players: [buildUser({ $id: 'child-one' })],
            children: [linkedChild],
            selectedChildId: 'child-one',
            childRegistrationChildId: 'child-one',
        });

        expect(result.current.selectedChildIsRegistered).toBe(true);
        expect(result.current.showChildRegistrationStatus).toBe(true);
        expect(result.current.shouldShowChildRegistrationPanel).toBe(true);
    });
});
