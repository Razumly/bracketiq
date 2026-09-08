import { boldsignService, type SignStep } from '@/lib/boldsignService';
import { billService } from '@/lib/billService';
import type { WeeklyOccurrenceSelection } from '@/lib/eventService';
import type { RegistrationAttemptType } from '@/lib/analytics/eventAnalytics';
import type { RegistrationQuestionAnswerInput, Event, Team, UserData } from '@/types';

import {
    normalizeInstallmentAmountsCents,
    normalizeInstallmentDueDateValues,
    normalizeInstallmentDueRelativeDayValues,
    normalizePriceCents,
} from './divisionRegistration';

export type JoinIntent = {
    mode: 'user' | 'team' | 'child' | 'child_free_agent' | 'user_free_agent' | 'user_waitlist' | 'team_waitlist' | 'child_waitlist';
    team?: Team | null;
    childId?: string;
    childEmail?: string | null;
    answers?: RegistrationQuestionAnswerInput[];
};

export type RegistrationBillingPlan = {
    priceCents: number;
    allowPaymentPlans: boolean;
    installmentAmounts: number[];
    installmentDueDates: string[];
    installmentDueRelativeDays: number[];
};

export function isChildJoinIntent(intent: JoinIntent): boolean {
    return intent.mode === 'child'
        || intent.mode === 'child_free_agent'
        || intent.mode === 'child_waitlist';
}

export function getJoinIntentRegistrationType(intent: JoinIntent): RegistrationAttemptType {
    switch (intent.mode) {
        case 'team':
            return 'team';
        case 'child':
            return 'child';
        case 'user_waitlist':
        case 'child_waitlist':
            return 'waitlist';
        case 'team_waitlist':
            return 'team_waitlist';
        case 'child_free_agent':
        case 'user_free_agent':
            return 'free_agent';
        case 'user':
        default:
            return 'self';
    }
}

export function dedupeSignSteps(
    steps: SignStep[],
    fallbackSignerContext: 'participant' | 'parent_guardian' | 'child',
): SignStep[] {
    const seen = new Set<string>();
    return steps.filter((step) => {
        const key = `${step.signerContext ?? fallbackSignerContext}:${step.templateId}:${step.documentId ?? ''}:${step.type}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

export function normalizeEmailValue(value?: string | null): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
}

function normalizeBillInstallments(billing: RegistrationBillingPlan) {
    return {
        installmentAmounts: billing.allowPaymentPlans ? normalizeInstallmentAmountsCents(billing.installmentAmounts) : [],
        installmentDueDates: billing.allowPaymentPlans ? normalizeInstallmentDueDateValues(billing.installmentDueDates) : [],
        installmentDueRelativeDays: billing.allowPaymentPlans ? normalizeInstallmentDueRelativeDayValues(billing.installmentDueRelativeDays) : [],
    };
}

function billSchedule(event: Event, billing: RegistrationBillingPlan, occurrence?: WeeklyOccurrenceSelection) {
    const installments = normalizeBillInstallments(billing);
    if (event.eventType !== 'WEEKLY_EVENT' || event.parentEvent) {
        return { ...installments, installmentDueRelativeDays: [], slotId: null, occurrenceDate: null };
    }
    if (!occurrence?.slotId || !occurrence.occurrenceDate) {
        throw new Error('Select a weekly session before starting a payment plan.');
    }
    if (installments.installmentDueRelativeDays.length !== installments.installmentAmounts.length) {
        throw new Error('Weekly payment plans need a due date offset for each installment.');
    }
    return { ...installments, installmentDueDates: [], slotId: occurrence.slotId, occurrenceDate: occurrence.occurrenceDate };
}

export async function createEventRegistrationBill({
    ownerType,
    ownerId,
    event,
    billing,
    occurrence,
    user,
    timeoutMs,
}: {
    ownerType: 'USER' | 'TEAM';
    ownerId: string;
    event: Event | null;
    billing: RegistrationBillingPlan;
    occurrence?: WeeklyOccurrenceSelection;
    user: UserData | null | undefined;
    timeoutMs: number;
}) {
    if (!event) {
        throw new Error('Event is not loaded.');
    }

    const priceCents = normalizePriceCents(billing.priceCents);
    if (priceCents <= 0) {
        throw new Error('This event does not have a price set for a payment plan.');
    }

    const schedule = billSchedule(event, billing, occurrence);

    return billService.createBill({
        ownerType,
        ownerId,
        totalAmountCents: priceCents,
        eventId: event.$id,
        slotId: schedule.slotId,
        occurrenceDate: schedule.occurrenceDate,
        organizationId: event.organizationId ?? null,
        installmentAmounts: schedule.installmentAmounts,
        installmentDueDates: schedule.installmentDueDates,
        installmentDueRelativeDays: schedule.installmentDueRelativeDays,
        allowSplit: ownerType === 'TEAM' ? Boolean(event.allowTeamSplitDefault) : false,
        paymentPlanEnabled: true,
        timeoutMs,
        event: {
            $id: event.$id,
            start: event.start,
            price: priceCents,
            installmentAmounts: schedule.installmentAmounts,
            installmentDueDates: schedule.installmentDueDates,
            installmentDueRelativeDays: schedule.installmentDueRelativeDays,
        },
        user,
    });
}

function collectChildSignatureInSession(intent: JoinIntent, userEmail: string) {
    const accountEmail = normalizeEmailValue(userEmail);
    const childEmail = normalizeEmailValue(intent.childEmail);
    return isChildJoinIntent(intent) && Boolean(intent.childId && accountEmail && childEmail && accountEmail === childEmail);
}

export async function loadRequiredEventSignLinks({
    intent,
    event,
    user,
    userEmail,
    timeoutMs,
}: {
    intent: JoinIntent;
    event: Event | null;
    user: UserData | null | undefined;
    userEmail?: string | null;
    timeoutMs: number;
}): Promise<SignStep[]> {
    if (!event || !user || !userEmail) {
        throw new Error('Sign-in email is required to sign documents.');
    }

    const signerContext: 'participant' | 'parent_guardian' = isChildJoinIntent(intent)
        ? 'parent_guardian'
        : 'participant';
    const parentLinks = await boldsignService.createSignLinks({
        eventId: event.$id,
        user,
        userEmail,
        signerContext,
        childUserId: intent.childId,
        childEmail: intent.childEmail ?? undefined,
        timeoutMs,
    });

    const shouldCollectChildSignatureInSameSession = collectChildSignatureInSession(intent, userEmail);
    if (!shouldCollectChildSignatureInSameSession || !intent.childId) {
        return dedupeSignSteps(parentLinks, signerContext);
    }

    const childLinks = await boldsignService.createSignLinks({
        eventId: event.$id,
        user,
        userEmail,
        signerContext: 'child',
        childUserId: intent.childId,
        childEmail: intent.childEmail ?? undefined,
        timeoutMs,
    });
    return dedupeSignSteps([...parentLinks, ...childLinks], signerContext);
}
