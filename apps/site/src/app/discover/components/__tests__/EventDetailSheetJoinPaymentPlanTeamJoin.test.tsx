import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';
import { buildEvent, buildTeam, buildUser } from '../../../../../test/factories';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    const { src, alt, fill, unoptimized, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={typeof src === 'string' ? src : ''} alt={alt ?? ''} {...rest} />;
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/o/river-city/events/team-registration',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/app/providers', () => ({
  useApp: jest.fn(),
}));

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventWithRelations: jest.fn(),
    getEvent: jest.fn(),
    getEventParticipants: jest.fn(),
    addToWaitlist: jest.fn(),
    removeFromWaitlist: jest.fn(),
    addFreeAgent: jest.fn(),
    removeFreeAgent: jest.fn(),
  },
}));

jest.mock('@/lib/userService', () => ({
  userService: {
    getUserById: jest.fn(),
    getUsersByIds: jest.fn(),
  },
}));

jest.mock('@/lib/teamService', () => ({
  teamService: {
    getTeamsByIds: jest.fn(),
  },
}));

jest.mock('@/lib/eventRegistrationDraftService', () => ({
  eventRegistrationDraftService: { get: jest.fn(), save: jest.fn(), clear: jest.fn() },
}));

jest.mock('@/lib/paymentService', () => ({
  paymentService: {
    createPaymentIntent: jest.fn(),
    joinEvent: jest.fn(),
    leaveEvent: jest.fn(),
    requestTeamRefund: jest.fn(),
  },
}));

jest.mock('@/lib/billService', () => ({
  billService: {
    createBill: jest.fn(),
  },
}));

jest.mock('@/lib/billingAddressService', () => ({
  billingAddressService: {
    getBillingAddressProfile: jest.fn(),
  },
}));

jest.mock('@/lib/boldsignService', () => ({
  boldsignService: {
    createSignLinks: jest.fn(),
  },
}));

jest.mock('@/lib/signedDocumentService', () => ({
  signedDocumentService: {
    isDocumentSigned: jest.fn(),
  },
}));

jest.mock('@/lib/familyService', () => ({
  familyService: {
    listChildren: jest.fn(),
  },
}));

jest.mock('@/lib/registrationService', () => ({
  registrationService: {
    registerSelfForEvent: jest.fn(),
    registerChildForEvent: jest.fn(),
  },
}));

jest.mock('@/components/ui/ParticipantsPreview', () => () => null);
jest.mock('@/components/ui/ParticipantsDropdown', () => () => null);
jest.mock('@/components/ui/PaymentModal', () => {
  function MockPaymentModal(props: any) {
    if (!props.isOpen) {
      return null;
    }
    return (
      <button type="button" onClick={() => void props.onPaymentSuccess()}>
        Complete Mock Payment
      </button>
    );
  }
  MockPaymentModal.displayName = 'MockPaymentModal';
  return MockPaymentModal;
});
jest.mock('@/components/ui/RefundSection', () => () => null);
jest.mock('@/components/ui/UserCard', () => () => null);

import EventDetailSheet from '../EventDetailSheet';
import EventRegistrationClient from '@/app/o/[slug]/events/[eventId]/EventRegistrationClient';
import { useApp } from '@/app/providers';
import { billingAddressService } from '@/lib/billingAddressService';
import { billService } from '@/lib/billService';
import { eventService } from '@/lib/eventService';
import { eventRegistrationDraftService } from '@/lib/eventRegistrationDraftService';
import type { EventRegistrationDraftSave, EventRegistrationDraftState } from '@/lib/contracts/eventRegistrationDraft';
import { familyService } from '@/lib/familyService';
import { paymentService } from '@/lib/paymentService';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import type { Team } from '@/types';

let draftState: EventRegistrationDraftState;

function selectEligibleTeam(team: Team) {
  draftState = {
    ...draftState,
    eligibleTeams: [{ id: team.$id, name: team.name, sport: team.sport ?? null }],
    selectedTeamId: team.$id,
    selectionSource: 'sole',
  };
}

async function confirmJoin() {
  const confirmButton = await screen.findByRole('button', { name: /Confirm registration/i });
  expect(paymentService.joinEvent).not.toHaveBeenCalled();
  expect(paymentService.createPaymentIntent).not.toHaveBeenCalled();
  expect(billService.createBill).not.toHaveBeenCalled();
  fireEvent.click(confirmButton);
}

async function continueToReview(team: Team) {
  const registration = within(await screen.findByRole('dialog', { name: /^Team registration$/i }));
  const continueButton = await registration.findByRole('button', {
    name: /^(Continue with this team|Continue registration)$/i,
  });
  await waitFor(() => expect(continueButton).toBeEnabled());
  fireEvent.click(continueButton);

  const players = within(await screen.findByRole('dialog', { name: /^Add players \(optional\)$/i }));
  expect(await players.findByRole('heading', { name: team.name })).toBeInTheDocument();
  const reviewButton = players.getByRole('button', { name: /^Continue to review$/i });
  await waitFor(() => expect(reviewButton).toBeEnabled());
  await act(async () => { fireEvent.click(reviewButton); });
}

const completeBillingAddressProfile = {
  email: 'user@example.com',
  billingAddress: {
    name: 'Test User',
    line1: '123 Court St',
    line2: '',
    city: 'Portland',
    state: 'OR',
    postalCode: '97201',
    countryCode: 'US',
  },
};

async function openTeamRegistration(team: Team) {
  fireEvent.click(await screen.findByRole('button', { name: /^(Register|Continue registration)$/i }));

  const registration = within(await screen.findByRole('dialog', { name: /^Team registration$/i }));
  const teamOption = await registration.findByRole('radio', { name: team.name });
  await waitFor(() => expect(teamOption).toBeEnabled());
  fireEvent.click(teamOption);
  expect(teamOption).toBeChecked();
  return registration;
}

describe('EventDetailSheet payment-plan team join', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    draftState = {
      version: 1, draft: null, eligibleTeams: [], selectedTeamId: null,
      selectionSource: null, available: true, unavailableReason: null, invalidations: [],
    };
    jest.mocked(eventRegistrationDraftService.get).mockImplementation(async () => draftState);
    jest.mocked(eventRegistrationDraftService.save).mockImplementation(async (eventId: string, input: EventRegistrationDraftSave) => {
      const draft = {
        id: 'draft', eventId, slotId: null, occurrenceDate: null,
        selectedTeamId: draftState.selectedTeamId, selectedDivisionId: null, selectedDivisionTypeKey: null,
        answers: {}, step: 'review' as const, completedSteps: [], registrationId: null,
        holdExpiresAt: null, teamCreationId: null, completedAt: null, updatedAt: '2026-09-05T23:00:00Z',
        ...draftState.draft, ...input.patch, revision: input.baseRevision + 1,
      };
      draftState = { ...draftState, draft, selectedTeamId: draft.selectedTeamId, selectionSource: 'draft' };
      return draftState;
    });
    jest.mocked(eventRegistrationDraftService.clear).mockImplementation(async () => {
      draftState = { ...draftState, draft: null };
    });
    (userService.getUserById as jest.Mock).mockResolvedValue(undefined);
    (billingAddressService.getBillingAddressProfile as jest.Mock).mockResolvedValue(completeBillingAddressProfile);
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      participants: {
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      registrations: {
        teams: [],
        users: [],
        children: [],
        waitlist: [],
        freeAgents: [],
      },
      teams: [],
      users: [],
      participantCount: 0,
      participantCapacity: null,
      divisionWarnings: [],
    });
  });

  it('keeps the selected team when returning from the public checkout page and its player dialog', async () => {
    const event = buildEvent({
      name: 'Fall Tip-Off Classic',
      eventType: 'EVENT',
      teamSignup: true,
      start: '2099-09-19T14:00:00Z',
      end: '2099-09-20T20:00:00Z',
      price: 45000,
      requiredTemplateIds: [],
    });
    const user = buildUser({ $id: 'captain', dateOfBirth: '1990-01-01' });
    const teams = [
      buildTeam({ $id: 'cascade', name: 'Cascade Crew', captainId: user.$id }),
      buildTeam({ $id: 'north', name: 'North Loop', captainId: user.$id }),
    ];
    draftState = {
      ...draftState,
      eligibleTeams: teams.map((team) => ({ id: team.$id, name: team.name, sport: team.sport ?? null })),
    };
    (useApp as jest.Mock).mockReturnValue({
      user, authUser: { $id: user.$id, email: 'captain@example.test' },
      isAuthenticated: true, isGuest: false, loading: false,
    });
    jest.mocked(familyService.listChildren).mockResolvedValue([]);
    jest.mocked(eventService.getEventWithRelations).mockResolvedValue(event);
    jest.mocked(eventService.getEvent).mockResolvedValue(event);
    jest.mocked(teamService.getTeamsByIds).mockResolvedValue(teams);
    jest.mocked(userService.getUsersByIds).mockResolvedValue([]);
    renderWithMantine(<EventRegistrationClient event={event} />);

    fireEvent.click(await screen.findByRole('button', { name: /^Register$/ }));
    const page = screen.getByRole('region', { name: 'Choose a team' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(page).getByRole('heading', { level: 1 })).toHaveFocus();
    const selectedOption = await within(page).findByRole('radio', { name: 'North Loop' });
    await waitFor(() => expect(selectedOption).toBeEnabled());
    fireEvent.click(selectedOption);
    await waitFor(() => expect(within(page).getByRole('button', { name: 'Continue registration' })).toBeEnabled());
    expect(selectedOption).toBeChecked();
    expect(within(within(page).getByRole('complementary', { name: 'Registration summary' })).getByText('North Loop')).toBeInTheDocument();

    fireEvent.click(within(page).getByRole('button', { name: 'Continue registration' }));
    const players = await screen.findByRole('dialog', { name: 'Add players (optional)' });
    expect(within(players).getByRole('heading', { name: 'North Loop' })).toBeInTheDocument();
    fireEvent.click(within(players).getByRole('button', { name: 'Back to teams' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: `Back to ${event.name}` }));
    const resumeButton = await screen.findByRole('button', { name: 'Continue registration' });
    expect(resumeButton).toHaveFocus();
    expect(screen.queryByRole('region', { name: 'Choose a team' })).not.toBeInTheDocument();
    fireEvent.click(resumeButton);
    expect(screen.getByRole('radio', { name: 'North Loop' })).toBeChecked();
    expect(paymentService.joinEvent).not.toHaveBeenCalled();
  });

  it('lists tournament bracket divisions, not generated pools, for tournament pool registration', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const bracketId = 'event_pool__division__c_skill_open_age_18plus';
    const poolA = `${bracketId}_pool_a`;
    const poolB = `${bracketId}_pool_b`;

    const event = buildEvent({
      $id: 'event_pool',
      eventType: 'TOURNAMENT',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      teamSignup: true,
      singleDivision: false,
      start: futureStart,
      end: futureEnd,
      price: 0,
      requiredTemplateIds: [],
      divisions: [poolA, poolB],
      divisionDetails: [
        {
          id: poolA,
          key: 'c_skill_open_age_18plus_pool_a',
          name: 'CoEd Open 18+ Pool A',
          isSystemGenerated: true,
          playoffPlacementDivisionIds: [bracketId],
          maxParticipants: 4,
        },
        {
          id: poolB,
          key: 'c_skill_open_age_18plus_pool_b',
          name: 'CoEd Open 18+ Pool B',
          isSystemGenerated: true,
          playoffPlacementDivisionIds: [bracketId],
          maxParticipants: 4,
        },
      ] as any,
      playoffDivisionDetails: [
        {
          id: bracketId,
          key: 'c_skill_open_age_18plus',
          kind: 'PLAYOFF',
          name: 'CoEd Open 18+',
          price: 2500,
          maxParticipants: 8,
        },
      ] as any,
    });

    const user = buildUser({ $id: 'user_pool', dateOfBirth: '1990-01-01', teamIds: [] });
    const authUser = { $id: user.$id, email: 'user@example.com', name: user.fullName };

    (useApp as jest.Mock).mockReturnValue({ user, authUser, isAuthenticated: true, isGuest: false, loading: false });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([]);

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    expect(await screen.findAllByRole('button', { name: /CoEd Open 18\+/i })).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Pool A/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pool B/i })).not.toBeInTheDocument();
  });

  it('lists league divisions, not playoff divisions, for league playoff registration', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const event = buildEvent({
      $id: 'event_league_playoff',
      eventType: 'LEAGUE',
      includePlayoffs: true,
      teamSignup: true,
      singleDivision: false,
      start: futureStart,
      end: futureEnd,
      price: 0,
      requiredTemplateIds: [],
      divisions: ['league_open', 'playoff_gold'],
      divisionDetails: [
        {
          id: 'league_open',
          key: 'league_open',
          name: 'Open League',
          playoffPlacementDivisionIds: ['playoff_gold'],
        },
        {
          id: 'playoff_gold',
          key: 'playoff_gold',
          kind: 'PLAYOFF',
          name: 'Gold Playoff',
        },
      ] as any,
    });

    const user = buildUser({ $id: 'user_league', dateOfBirth: '1990-01-01', teamIds: [] });
    const authUser = { $id: user.$id, email: 'user@example.com', name: user.fullName };

    (useApp as jest.Mock).mockReturnValue({ user, authUser, isAuthenticated: true, isGuest: false, loading: false });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([]);

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    expect(await screen.findAllByRole('button', { name: /Open League/i })).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Gold Playoff/i })).not.toBeInTheDocument();
  });

  it('registers the team immediately, then creates the payment-plan bill', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const openDivisionId = 'event_1__division__c_skill_open_age_18plus';
    const premierDivisionId = 'event_1__division__c_skill_premier_age_18plus';

    const event = buildEvent({
      $id: 'event_1',
      teamSignup: true,
      start: futureStart,
      end: futureEnd,
      price: 2500,
      allowPaymentPlans: true,
      requiredTemplateIds: [],
      divisions: [openDivisionId, premierDivisionId],
      divisionDetails: [
        { id: openDivisionId, key: 'c_skill_open_age_18plus', name: 'Open 18+' },
        { id: premierDivisionId, key: 'c_skill_premier_age_18plus', name: 'Premier 18+' },
      ] as any,
    });

    const team = buildTeam({
      $id: 'team_1',
      name: 'Camka Team',
      division: 'Premier 18+',
      sport: 'Volleyball',
      managerId: 'user_1',
    });

    const user = buildUser({
      $id: 'user_1',
      dateOfBirth: '1990-01-01',
      teamIds: [team.$id],
    });
    const authUser = { $id: user.$id, email: 'user@example.com', name: user.fullName };

    (useApp as jest.Mock).mockReturnValue({
      user,
      authUser,
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      userTeams: [team],
      userTeamsLoading: false,
    });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([team]);
    selectEligibleTeam(team);
    (paymentService.joinEvent as jest.Mock).mockResolvedValue(undefined);
    (billService.createBill as jest.Mock).mockResolvedValue({ bill: { id: 'bill_1' } });

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Premier 18\+/i }));
    await openTeamRegistration(team);
    await continueToReview(team);
    expect(await screen.findByText(/Payment plan preview/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue with Payment Plan/i }));
    await confirmJoin();

    await waitFor(() => {
      expect(screen.getByText(/payment plan started/i)).toBeInTheDocument();
    });

    expect(paymentService.joinEvent).toHaveBeenCalled();
    expect(billService.createBill).toHaveBeenCalled();

    const joinSelectionArg = (paymentService.joinEvent as jest.Mock).mock.calls[0][3];
    expect(joinSelectionArg).toEqual(expect.objectContaining({ divisionId: premierDivisionId }));

    const joinCallOrder = (paymentService.joinEvent as jest.Mock).mock.invocationCallOrder[0];
    const billCallOrder = (billService.createBill as jest.Mock).mock.invocationCallOrder[0];
    expect(joinCallOrder).toBeLessThan(billCallOrder);

    expect(billService.createBill).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: 'TEAM',
        ownerId: team.$id,
        eventId: event.$id,
        timeoutMs: 5000,
      }),
    );

    expect(paymentService.joinEvent).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ $id: event.$id }),
      expect.objectContaining({ $id: team.$id }),
      expect.objectContaining({ divisionId: premierDivisionId }),
      5000,
      undefined,
      undefined,
    );
  });

  it('shows an already-in-event disabled join button and a withdraw action for registered teams', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const event = buildEvent({
      $id: 'event_2',
      teamSignup: true,
      start: futureStart,
      end: futureEnd,
      price: 0,
      requiredTemplateIds: [],
      divisions: ['u17'],
      divisionDetails: [{ id: 'u17', name: 'U17' }] as any,
      teams: [
        buildTeam({
          $id: 'slot_1',
          name: 'Camka Team',
          parentTeamId: 'team_1',
          managerId: 'user_1',
          sport: 'Volleyball',
        }),
      ],
    });

    const managedTeam = buildTeam({
      $id: 'team_1',
      name: 'Camka Team',
      division: 'c_skill_open_age_18plus',
      sport: 'Volleyball',
      managerId: 'user_1',
    });

    const user = buildUser({
      $id: 'user_1',
      dateOfBirth: '1990-01-01',
      teamIds: [managedTeam.$id],
    });
    const authUser = { $id: user.$id, email: 'user@example.com', name: user.fullName };

    (useApp as jest.Mock).mockReturnValue({
      user,
      authUser,
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      userTeams: [managedTeam],
      userTeamsLoading: false,
    });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      participants: {
        teamIds: ['slot_1'],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      registrations: {
        teams: [],
        users: [],
        children: [],
        waitlist: [],
        freeAgents: [],
      },
      teams: event.teams,
      users: [],
      participantCount: 1,
      participantCapacity: 24,
      divisionWarnings: [],
    });
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([managedTeam]);
    selectEligibleTeam(managedTeam);

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    const registration = await openTeamRegistration(managedTeam);
    const teamOption = registration.getByRole('radio', { name: /Camka Team/i });
    expect(teamOption).toHaveAccessibleName('Camka Team');
    expect(registration.getByRole('radiogroup', { name: /Eligible teams/i }))
      .not.toHaveTextContent('c_skill_open_age_18plus');
    expect(registration.getByRole('button', { name: /^Manage team$/i })).toBeEnabled();

    const disabledJoinButton = await screen.findByRole('button', { name: /Already in Event/i });
    expect(disabledJoinButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /Withdraw Team/i })).toBeInTheDocument();
  });

  it('requests payment intent for host when joining a paid team event', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const event = buildEvent({
      $id: 'event_3',
      teamSignup: true,
      hostId: 'user_1',
      start: futureStart,
      end: futureEnd,
      price: 5000,
      allowPaymentPlans: false,
      requiredTemplateIds: [],
      divisions: ['open'],
      divisionDetails: [{ id: 'open', name: 'Open' }] as any,
    });

    const team = buildTeam({
      $id: 'team_3',
      name: 'Beach Legends',
      division: 'Open',
      sport: 'Volleyball',
      managerId: 'user_1',
    });

    const user = buildUser({
      $id: 'user_1',
      dateOfBirth: '1990-01-01',
      teamIds: [team.$id],
    });
    const authUser = { $id: user.$id, email: 'user@example.com', name: user.fullName };

    (useApp as jest.Mock).mockReturnValue({
      user,
      authUser,
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      userTeams: [team],
      userTeamsLoading: false,
    });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([team]);
    selectEligibleTeam(team);
    (paymentService.joinEvent as jest.Mock).mockResolvedValue(undefined);
    (paymentService.createPaymentIntent as jest.Mock).mockResolvedValue({
      clientSecret: 'pi_secret',
      paymentIntentId: 'pi_1',
    });

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /^Open\b/i }));
    await openTeamRegistration(team);

    await continueToReview(team);
    await confirmJoin();
    fireEvent.click(await screen.findByRole('button', { name: /^Checkout$/i }));

    await waitFor(() => {
      expect(paymentService.createPaymentIntent).toHaveBeenCalled();
    });

    const [paymentIntentCall] = (paymentService.createPaymentIntent as jest.Mock).mock.calls;
    expect(paymentIntentCall?.[0]).toEqual(user);
    expect(paymentIntentCall?.[1]).toEqual(expect.objectContaining({ $id: event.$id, price: 5000 }));
    expect(paymentIntentCall?.[2]).toEqual(expect.objectContaining({ $id: team.$id }));

    expect(paymentService.joinEvent).not.toHaveBeenCalled();
    expect(billService.createBill).not.toHaveBeenCalled();
  });

  it('completes team registration after instant payment success', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const event = buildEvent({
      $id: 'event_4',
      teamSignup: true,
      hostId: 'host_1',
      start: futureStart,
      end: futureEnd,
      price: 5000,
      allowPaymentPlans: false,
      requiredTemplateIds: [],
      divisions: ['open'],
      divisionDetails: [{ id: 'open', name: 'Open' }] as any,
      teams: [],
    });

    const registeredSlotTeam = buildTeam({
      $id: 'slot_4',
      name: 'Beach Legends',
      parentTeamId: 'team_4',
      managerId: 'user_1',
      sport: 'Volleyball',
      division: 'Open',
    });

    const team = buildTeam({
      $id: 'team_4',
      name: 'Beach Legends',
      division: 'Open',
      sport: 'Volleyball',
      managerId: 'user_1',
    });

    const user = buildUser({
      $id: 'user_1',
      dateOfBirth: '1990-01-01',
      teamIds: [team.$id],
    });
    const authUser = { $id: user.$id, email: 'user@example.com', name: user.fullName };

    let eventFetchCount = 0;
    (useApp as jest.Mock).mockReturnValue({
      user,
      authUser,
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      userTeams: [team],
      userTeamsLoading: false,
    });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockImplementation(async () => {
      eventFetchCount += 1;
      return eventFetchCount >= 2 ? { ...event, teams: [registeredSlotTeam] } : event;
    });
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([team]);
    selectEligibleTeam(team);
    (paymentService.createPaymentIntent as jest.Mock).mockResolvedValue({
      paymentIntent: 'pi_secret',
      publishableKey: 'pk_test_123',
      feeBreakdown: {
        eventPrice: 5000,
        stripeFee: 175,
        processingFee: 50,
        totalCharge: 5225,
        hostReceives: 5000,
        feePercentage: 1,
        purchaseType: 'event',
      },
    });
    (paymentService.joinEvent as jest.Mock).mockResolvedValue(undefined);

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /^Open\b/i }));
    await openTeamRegistration(team);

    const baselineEventFetchCount = eventFetchCount;

    await continueToReview(team);
    await confirmJoin();
    fireEvent.click(await screen.findByRole('button', { name: /^Checkout$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Complete Mock Payment/i }));

    await waitFor(() => {
      expect(eventFetchCount).toBeGreaterThan(baselineEventFetchCount);
    }, { timeout: 4000 });
    expect(paymentService.joinEvent).not.toHaveBeenCalled();
  });
});
