import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { trackEventRegistrationStarted } from '@/lib/analytics/eventAnalytics';
import { billService } from '@/lib/billService';
import { resolveEventParticipantCapacity } from '@/lib/eventCapacity';
import { eventService, type WeeklyOccurrenceSelection } from '@/lib/eventService';
import { paymentService } from '@/lib/paymentService';
import {
    registrationService,
    type ConsentLinks,
    type DivisionRegistrationSelection,
    type EventRegistration,
} from '@/lib/registrationService';
import type { Bill, Event, RegistrationQuestionAnswerInput, Team, UserData } from '@/types';

import { normalizePriceCents } from '../divisionRegistration';
import {
    createEventRegistrationBill,
    getJoinIntentRegistrationType,
    type JoinIntent,
    type RegistrationBillingPlan,
} from '../eventRegistrationCommands';
import { submitManualPaymentProof } from '../manualPaymentProof';
import type { PendingEventCheckoutState } from './useEventDiscountPreview';

type UseEventJoinFinalizationControllerArgs = {
    event: Event | null;
    checkoutEvent: Event | null;
    user: UserData | null | undefined;
    billing: RegistrationBillingPlan;
    occurrence?: WeeklyOccurrenceSelection;
    selection: DivisionRegistrationSelection;
    weeklySelectionRequired: boolean;
    isDivisionSelectionMissing: boolean;
    registrationByDivisionType: boolean;
    selectedDivisionAtCapacity: boolean;
    isFreeForUser: boolean;
    selectedTeamId: string;
    userTeams: Team[];
    playerCount: number;
    teamCount: number;
    timeoutMs: number;
    prepareCheckout: (checkout: PendingEventCheckoutState) => void | Promise<void>;
    reload: () => void | Promise<void>;
    navigateToCompletion: () => void;
    clearProgress: () => void;
    setJoinError: Dispatch<SetStateAction<string | null>>;
    setJoinNotice: Dispatch<SetStateAction<string | null>>;
    setManualPaymentOpened: (opened: boolean) => void;
};

type ReturnedBill = Bill & { id?: string };

type ChildRegistrationResponse = Awaited<ReturnType<typeof registrationService.registerChildForEvent>>;

function childRegistrationStatus(result: ChildRegistrationResponse) {
    return (result.registration?.status ?? '').toLowerCase();
}

function childConsentNotice(consent: ChildRegistrationResponse['consent'], registrationStatus: string) {
    const status = consent?.status ?? '';
    const notices: Record<string, string> = {
        parentsigned: 'Parent signature completed. Registration is pending child signature.',
        childsigned: 'Child signature completed. Registration is pending parent/guardian signature.',
        completed: 'All signatures are complete. Finalizing registration.',
    };
    if (notices[status.toLowerCase()]) return notices[status.toLowerCase()];
    if (status) return `Child registration is pending. Consent status: ${status}.`;
    if (registrationStatus) return `Child registration is pending. Status: ${registrationStatus}.`;
    return 'Child registration request submitted and is pending processing.';
}

function childRegistrationNotice(result: ChildRegistrationResponse) {
    const status = childRegistrationStatus(result);
    const primary = () => {
        if (status === 'active') return 'Child registration completed.';
        if (result.requiresParentApproval) return 'Child request sent. A parent/guardian must approve before registration can continue.';
        if (result.consent?.requiresChildEmail) return 'Child registration started. Add child email to continue child-signature document steps.';
        return childConsentNotice(result.consent, status);
    };
    const notices = [primary()];
    if (Array.isArray(result.warnings) && result.warnings.length > 0) notices.push(result.warnings[0]);
    return notices.join(' ');
}

export function useEventJoinFinalizationController({
    event,
    checkoutEvent,
    user,
    billing,
    occurrence,
    selection,
    weeklySelectionRequired,
    isDivisionSelectionMissing,
    registrationByDivisionType,
    selectedDivisionAtCapacity,
    isFreeForUser,
    selectedTeamId,
    userTeams,
    playerCount,
    teamCount,
    timeoutMs,
    prepareCheckout,
    reload,
    navigateToCompletion,
    clearProgress,
    setJoinError,
    setJoinNotice,
    setManualPaymentOpened,
}: UseEventJoinFinalizationControllerArgs) {
    const [manualPaymentBill, setManualPaymentBill] = useState<Bill | null>(null);
    const [registeringChild, setRegisteringChild] = useState(false);
    const [childRegistration, setChildRegistration] = useState<EventRegistration | null>(null);
    const [childConsent, setChildConsent] = useState<ConsentLinks | null>(null);
    const [childRegistrationChildId, setChildRegistrationChildId] = useState<string | null>(null);

    const ensureWeeklyOccurrenceSelected = useCallback((
        message: string = 'Select a weekly session before continuing.',
    ) => {
        if (!weeklySelectionRequired) {
            return true;
        }
        setJoinError(message);
        return false;
    }, [setJoinError, weeklySelectionRequired]);

    const createBillForOwner = useCallback(async (ownerType: 'USER' | 'TEAM', ownerId: string) => (
        createEventRegistrationBill({
            ownerType,
            ownerId,
            event,
            billing,
            occurrence,
            user,
            timeoutMs,
        })
    ), [billing, event, occurrence, timeoutMs, user]);

    const registerChildForEvent = useCallback(async (
        childId: string,
        childSelection: DivisionRegistrationSelection = {},
        answers?: RegistrationQuestionAnswerInput[],
    ) => {
        if (!event) {
            throw new Error('Event is not loaded.');
        }
        const resolvedSelection = occurrence
            ? {
                ...childSelection,
                slotId: occurrence.slotId ?? undefined,
                occurrenceDate: occurrence.occurrenceDate ?? undefined,
            }
            : childSelection;

        setRegisteringChild(true);
        try {
            const result = await registrationService.registerChildForEvent(
                event.$id,
                childId,
                resolvedSelection,
                answers,
            );
            setChildRegistration(result.registration ?? null);
            setChildConsent(result.consent ?? null);
            setChildRegistrationChildId(childId);
            const registrationStatus = childRegistrationStatus(result);
            setJoinNotice(childRegistrationNotice(result));
            await reload();
            if (registrationStatus === 'active') {
                navigateToCompletion();
            }
        } finally {
            setRegisteringChild(false);
        }
    }, [event, navigateToCompletion, occurrence, reload, setJoinNotice]);

    const completeChildRegistration = useCallback(async (
        childId: string,
        childSelection: DivisionRegistrationSelection = {},
        answers?: RegistrationQuestionAnswerInput[],
    ) => {
        if (!event || !user) {
            throw new Error('Event is not loaded.');
        }

        const childPriceCents = normalizePriceCents(billing.priceCents);
        if (childPriceCents > 0) {
            if (event.registrationPaymentMode === 'MANUAL') {
                throw new Error('Child registration requires payment. Manual child payment checkout is not available yet.');
            }
            if (billing.allowPaymentPlans) {
                throw new Error('Child registration requires payment. Payment plans for child registration are not available yet.');
            }
            await prepareCheckout({
                event: checkoutEvent ?? event,
                selection: childSelection,
                answers,
                eventRegistration: {
                    registrantId: childId,
                    registrantType: 'CHILD',
                    parentId: user.$id,
                },
            });
            return;
        }

        await registerChildForEvent(childId, childSelection, answers);
    }, [billing.allowPaymentPlans, billing.priceCents, checkoutEvent, event, prepareCheckout, registerChildForEvent, user]);

    const finalizeJoin = useCallback(async (intent: JoinIntent) => {
        if (!user || !event) return;
        if (!ensureWeeklyOccurrenceSelected()) return;

        const validateAndTrack = () => {
            const requiresDivision = !['child_free_agent', 'user_free_agent'].includes(intent.mode);
            if (requiresDivision && isDivisionSelectionMissing) {
                throw new Error(registrationByDivisionType ? 'Select a division type before joining.' : 'Select a division before joining.');
            }
            trackEventRegistrationStarted(event, getJoinIntentRegistrationType(intent), {
                division_id: selection.divisionId, division_type_id: selection.divisionTypeId,
                slot_id: occurrence?.slotId, occurrence_date: occurrence?.occurrenceDate,
            });
        };
        const finishChildOrFreeAgent = async () => {
            if (intent.mode === 'child') {
                if (!intent.childId) throw new Error('Select a child to register.');
                await completeChildRegistration(intent.childId, selection, intent.answers);
                return true;
            }
            if (intent.mode === 'child_free_agent') {
                if (!intent.childId) throw new Error('Select a child to add as a free agent.');
                await eventService.addFreeAgent(event.$id, intent.childId, occurrence);
                setJoinNotice('Child added to free agent list.');
            } else if (intent.mode === 'child_waitlist') {
                if (!intent.childId) throw new Error('Select a child to add to waitlist.');
                await eventService.addToWaitlist(event.$id, intent.childId, 'user', occurrence);
                setJoinNotice('Child added to waitlist.');
            } else if (intent.mode === 'user_free_agent') {
                await eventService.addFreeAgent(event.$id, user.$id, occurrence);
                setJoinNotice('You are listed as a free agent.');
            } else return false;
            await reload();
            return true;
        };
        const resolveTeam = () => {
            if (intent.mode !== 'team' && intent.mode !== 'team_waitlist') return undefined;
            if (intent.team) return intent.team;
            if (selectedTeamId) return userTeams.find((team) => team.$id === selectedTeamId) ?? ({ $id: selectedTeamId } as Team);
            return undefined;
        };
        const atCapacity = () => {
            const total = event.teamSignup ? teamCount : playerCount;
            const capacity = resolveEventParticipantCapacity(event);
            return (capacity > 0 && total >= capacity) || selectedDivisionAtCapacity;
        };
        const waitlistKind = (): 'user' | 'team' | null => {
            if (intent.mode === 'user_waitlist') return 'user';
            if (intent.mode === 'team_waitlist') return 'team';
            if (!atCapacity()) return null;
            if (intent.mode === 'user') return 'user';
            if (intent.mode === 'team') return 'team';
            return null;
        };
        const finishWaitlist = async (team: Team | undefined) => {
            const kind = waitlistKind();
            if (!kind) return false;
            if (kind === 'team' && !team?.$id) throw new Error('Team is required to join the waitlist.');
            const id = kind === 'team' ? team!.$id : user.$id;
            await eventService.addToWaitlist(event.$id, id, kind, occurrence);
            setJoinNotice(kind === 'team' ? 'Team added to waitlist.' : 'Added to waitlist.');
            await reload();
            return true;
        };
        const shouldRegisterSelf = () => intent.mode === 'user' && !event.teamSignup && (isFreeForUser || billing.allowPaymentPlans);
        const isManualPaid = () => event.registrationPaymentMode === 'MANUAL' && !isFreeForUser && ['user', 'team'].includes(intent.mode);
        const registerSelf = async () => {
            if (!shouldRegisterSelf()) return null;
            const result = await registrationService.registerSelfForEvent(event.$id, selection, intent.answers);
            const registration = result.registration ?? null;
            if (registration?.status && registration.status !== 'active') setJoinNotice(`Registration status: ${registration.status}`);
            return registration;
        };
        const join = (team: Team | undefined) => paymentService.joinEvent(user, checkoutEvent ?? event, team, selection, timeoutMs, occurrence, intent.answers);
        const openManualBill = async (returnedBill: ReturnedBill | undefined) => {
            const billId = returnedBill?.$id ?? returnedBill?.id;
            if (!billId) throw new Error('Registration was created, but no manual payment bill was returned.');
            const fullBill = await billService.getBill(billId);
            setManualPaymentBill(fullBill ?? returnedBill ?? null);
            setManualPaymentOpened(true);
        };
        const finishManual = async (team: Team | undefined) => {
            const joinTeam = intent.mode === 'team' ? team : undefined;
            if (intent.mode === 'team' && !joinTeam?.$id) throw new Error('Team is required to register.');
            const result = await join(joinTeam);
            await openManualBill(result?.bill as ReturnedBill | undefined);
            setJoinNotice('Registration started. Send payment to the host, then upload proof for review.');
            await reload();
        };
        const joinBeforePlan = async (team: Team | undefined) => {
            try { return Boolean((await join(team))?.bill); }
            catch (failure) {
                const message = failure instanceof Error ? failure.message : 'Failed to join event.';
                if (!message.toLowerCase().includes('already registered')) throw failure;
                return false;
            }
        };
        const planNotice = (exists: boolean) => {
            if (exists) return intent.mode === 'team'
                ? 'Team joined. Payment plan already exists - you can manage payments from your Profile.'
                : 'Joined. Payment plan already exists - you can manage payments from your Profile.';
            return intent.mode === 'team'
                ? 'Team joined. Payment plan started. A bill was created - you can manage payments from your Profile.'
                : 'Joined. Payment plan started. A bill was created - pay installments from your Profile.';
        };
        const createMissingPlanBill = async (team: Team | undefined, created: boolean) => {
            if (!created) {
                if (intent.mode === 'team' && team?.$id) await createBillForOwner('TEAM', team.$id);
                else await createBillForOwner('USER', user.$id);
            }
            setJoinNotice(planNotice(false));
        };
        const recoverPlanFailure = async (failure: unknown, team: Team | undefined) => {
            const message = failure instanceof Error ? failure.message : 'Failed to start payment plan.';
            if (message.toLowerCase().includes('payment plan already exists')) {
                setJoinNotice(planNotice(true));
                return;
            }
            try { await paymentService.leaveEvent(user, checkoutEvent ?? event, team, undefined, undefined, timeoutMs, occurrence); }
            catch (rollbackError) { console.error('Failed to rollback payment-plan join after billing error', rollbackError); }
            throw new Error(message);
        };
        const finishPaymentPlan = async (team: Team | undefined) => {
            const joinTeam = intent.mode === 'team' ? team : undefined;
            if (intent.mode === 'team' && !joinTeam?.$id) throw new Error('Team is required to start a payment plan.');
            const created = await joinBeforePlan(joinTeam);
            try { await createMissingPlanBill(joinTeam, created); }
            catch (failure) { await recoverPlanFailure(failure, joinTeam); }
            await reload();
            navigateToCompletion();
        };
        const finishFree = async (team: Team | undefined, registration: EventRegistration | null) => {
            if (!shouldRegisterSelf()) await join(team);
            await reload();
            const pending = shouldRegisterSelf() && registration?.status && registration.status !== 'active';
            if (!pending) navigateToCompletion();
        };

        validateAndTrack();
        if (await finishChildOrFreeAgent()) return;
        const team = resolveTeam();
        if (await finishWaitlist(team)) return;
        const registration = await registerSelf();
        if (isManualPaid()) return finishManual(team);
        if (billing.allowPaymentPlans) return finishPaymentPlan(team);
        if (isFreeForUser) return finishFree(team, registration);
        await prepareCheckout({ event: checkoutEvent ?? event, team, selection, answers: intent.answers });
    }, [
        billing.allowPaymentPlans,
        checkoutEvent,
        completeChildRegistration,
        createBillForOwner,
        ensureWeeklyOccurrenceSelected,
        event,
        isDivisionSelectionMissing,
        isFreeForUser,
        navigateToCompletion,
        occurrence,
        playerCount,
        prepareCheckout,
        registrationByDivisionType,
        reload,
        selectedDivisionAtCapacity,
        selectedTeamId,
        selection,
        setJoinNotice,
        setManualPaymentOpened,
        teamCount,
        timeoutMs,
        user,
        userTeams,
    ]);

    const submitManualProof = useCallback(async (proofFile: File) => {
        await submitManualPaymentProof({
            event: checkoutEvent ?? event,
            bill: manualPaymentBill,
            proofFile,
        });
        setManualPaymentOpened(false);
        setManualPaymentBill(null);
        clearProgress();
        await reload();
        setJoinNotice('Payment proof uploaded. The host will review it and confirm your payment.');
    }, [
        checkoutEvent,
        clearProgress,
        event,
        manualPaymentBill,
        reload,
        setJoinNotice,
        setManualPaymentOpened,
    ]);

    const resetChildRegistrationState = useCallback(() => {
        setRegisteringChild(false);
        setChildRegistration(null);
        setChildConsent(null);
        setChildRegistrationChildId(null);
    }, []);

    return {
        manualPaymentBill,
        registeringChild,
        setRegisteringChild,
        childRegistration,
        childConsent,
        childRegistrationChildId,
        ensureWeeklyOccurrenceSelected,
        finalizeJoin,
        submitManualProof,
        resetChildRegistrationState,
    };
}
