import type { SportResourceLabels } from '@/lib/sportResourceLabels';

type BuildLeagueWarningOptions = {
    hasPendingExternalConflictChecks: boolean;
    hasExternalSlotConflictWarnings: boolean;
    resourceLabels: SportResourceLabels;
};

export const buildLeagueScheduleWarning = ({
    hasPendingExternalConflictChecks,
    hasExternalSlotConflictWarnings,
    resourceLabels,
}: BuildLeagueWarningOptions): string | null => {
    if (hasPendingExternalConflictChecks) {
        return `Checking ${resourceLabels.singular.toLocaleLowerCase()} conflicts for timeslots. You can still save while this warning check finishes.`;
    }
    if (hasExternalSlotConflictWarnings) {
        return `Timeslot ${resourceLabels.singular.toLocaleLowerCase()} conflicts are warnings. The scheduler will avoid overlaps when building matches, but review or auto resolve the affected slots if needed.`;
    }
    return null;
};

export const buildLeagueScheduleError = (issue: unknown): string | null => {
    if (!issue || typeof issue !== 'object') {
        return null;
    }
    const message = typeof (issue as { message?: unknown }).message === 'string'
        ? (issue as { message: string }).message
        : null;
    return message && message.trim().length > 0
        ? message
        : 'Please resolve schedule timeslot issues before submitting.';
};
