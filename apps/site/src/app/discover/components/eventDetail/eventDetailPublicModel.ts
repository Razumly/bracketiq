import { normalizeTimeZone, formatDisplayDate, formatDisplayTime } from '@/lib/dateUtils';
import { collectOrganizationHostIds } from '@/lib/organizationEventAccess';
import { getFieldDisplayName } from '@/lib/fieldUtils';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';
import { normalizeExternalHttpUrl } from '@/lib/externalUrl';
import { resolveDivisionDisplayName } from '@/lib/divisionDisplay';
import type { Division, Event, Match, Team, UserData } from '@/types';
import {
    formatAffiliateEventPriceRange,
    formatEventDivisionPriceRange,
    getEventDateTime,
    getUserHandle,
} from '@/types';
import {
    getDivisionIdFromEventEntry,
    getNormalizedDivisionAliases,
    normalizePriceCents,
    type EventDivisionOption,
} from './divisionRegistration';
import {
    buildScheduleTimeslotGroups,
    formatReadOnlyValueList,
    formatRefundSummary,
    formatRegistrationCutoffSummary,
    formatSlotTimeRange,
    getDayOfWeekLabel,
    getOrganizationHostedByHref,
    getOrganizationName,
    getSportLabel,
    normalizeComparableLabel,
    uniqueNonEmptyStrings,
} from './eventDetailPresentation';
import { parseDateValue } from './weeklySessions';

const COMPETITION_PHASE_DETAILS_UNAVAILABLE_LABEL = 'Competition Phase details unavailable';
const STAFF_NAME_UNAVAILABLE_LABEL = 'Staff name unavailable';

const getStaffFullName = (user?: Partial<UserData> | null): string | null => {
    if (user?.isIdentityHidden) {
        return null;
    }
    const firstName = typeof user?.firstName === 'string' ? user.firstName.trim() : '';
    const lastName = typeof user?.lastName === 'string' ? user.lastName.trim() : '';
    const fullName = `${firstName} ${lastName}`.trim();
    return firstName.length > 0 && lastName.length > 0 && fullName.length > 0 ? fullName : null;
};

type BuildEventDetailPublicModelArgs = {
    event: Event;
    user: UserData | null | undefined;
    hostUser: UserData | null | undefined;
    teams: Team[];
    participantCapacity: number;
    spotsLeft: number;
    selectedDivisionBillingPriceCents: number;
    selectedDivisionOption: EventDivisionOption | null;
    divisionDisplayNameIndex: Map<string, string>;
    isEventHost: boolean;
    renderInline: boolean;
    isWeeklyParentEvent: boolean;
    now: Date;
};

type PublicCompetitionPhaseDisplay = {
    id: string;
    name: string;
    phase: string;
    label: string;
};

type PublicIncompleteScheduleMatch = Match & {
    phaseDivisionId?: unknown;
    phase?: unknown;
    division?: unknown;
};

type PublicCompetitionPhaseDetail = Division & {
    $id?: unknown;
    key?: unknown;
};

const resolvePublicCompetitionPhaseId = (match: PublicIncompleteScheduleMatch): string => (
    typeof match.phaseDivisionId === "string"
        ? match.phaseDivisionId.trim()
        : typeof match.division === "string" ? match.division.trim() : ""
);

const findPublicCompetitionPhaseDetail = (
    phaseDetails: PublicCompetitionPhaseDetail[],
    phaseId: string,
): PublicCompetitionPhaseDetail | undefined => {
    for (const candidate of phaseDetails) {
        if ([candidate.id, candidate.$id, candidate.key].some(
            (value) => typeof value === "string" && value === phaseId,
        )) {
            return candidate;
        }
    }
    return undefined;
};

const resolvePublicCompetitionPhaseDisplay = (
    match: PublicIncompleteScheduleMatch,
    phaseDetails: PublicCompetitionPhaseDetail[],
): PublicCompetitionPhaseDisplay | null => {
    const phaseId = resolvePublicCompetitionPhaseId(match);
    if (!phaseId) {
        return null;
    }
    const detail = findPublicCompetitionPhaseDetail(phaseDetails, phaseId);
    const name = typeof detail?.name === "string" && detail.name.trim()
        ? detail.name.trim()
        : COMPETITION_PHASE_DETAILS_UNAVAILABLE_LABEL;
    const phase = typeof match.phase === "string" && match.phase.trim()
        ? match.phase.trim()
        : typeof detail?.phase === "string" && detail.phase.trim()
            ? detail.phase.trim()
            : "PHASE";
    return {
        id: phaseId,
        name,
        phase,
        label: name,
    };
};

const buildPublicIncompleteSchedule = (event: Event): {
    isScheduleIncomplete: boolean;
    unscheduledMatchCount: number;
    unscheduledMatchIds: string[];
    affectedCompetitionPhaseIds: string[];
    affectedCompetitionPhaseLabels: string[];
    affectedCompetitionPhases: PublicCompetitionPhaseDisplay[];
} => {
    const unplacedMatches = (event.matches ?? []).filter((match) =>
        String((match as Match & { placementState?: unknown }).placementState ?? "")
            .trim()
            .toUpperCase() === "UNPLACED",
    );
    const unscheduledMatchIds = unplacedMatches
        .map((match) => String(match.$id ?? "").trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));
    const phaseDetails = [
        ...(((event as Event & { divisionDetails?: unknown[] }).divisionDetails ?? [])),
        ...(((event as Event & { playoffDivisionDetails?: unknown[] }).playoffDivisionDetails ?? [])),
        ...(((event as Event & { competitionPhaseDetails?: unknown[] }).competitionPhaseDetails ?? [])),
    ].filter((detail): detail is PublicCompetitionPhaseDetail =>
        Boolean(detail) && typeof detail === "object" && !Array.isArray(detail),
    );
    const phasesById = new Map<string, PublicCompetitionPhaseDisplay>();
    unplacedMatches.forEach((match) => {
        const phase = resolvePublicCompetitionPhaseDisplay(
            match as PublicIncompleteScheduleMatch,
            phaseDetails,
        );
        if (!phase || phasesById.has(phase.id)) {
            return;
        }
        phasesById.set(phase.id, phase);
    });
    const affectedCompetitionPhases = Array.from(phasesById.values())
        .sort((left, right) => left.id.localeCompare(right.id));
    return {
        isScheduleIncomplete: unscheduledMatchIds.length > 0,
        unscheduledMatchCount: unscheduledMatchIds.length,
        unscheduledMatchIds,
        affectedCompetitionPhaseIds: affectedCompetitionPhases.map((phase) => phase.id),
        affectedCompetitionPhaseLabels: affectedCompetitionPhases.map((phase) => phase.label),
        affectedCompetitionPhases,
    };
};

export function buildEventDetailPublicModel({
    event,
    user,
    hostUser,
    teams,
    participantCapacity,
    spotsLeft,
    selectedDivisionBillingPriceCents,
    selectedDivisionOption,
    divisionDisplayNameIndex,
    isEventHost,
    renderInline,
    isWeeklyParentEvent,
    now,
}: BuildEventDetailPublicModelArgs) {
    const incompleteSchedule = buildPublicIncompleteSchedule(event);
    const { date, time } = getEventDateTime(event);
    const affiliateActionUrl = normalizeExternalHttpUrl(event.affiliateActionUrl)
        ?? normalizeExternalHttpUrl(event.affiliateUrl)
        ?? '';
    const isAffiliateEvent = affiliateActionUrl.length > 0;
    const normalizedDateDisplayMode = typeof event.dateDisplayMode === 'string'
        ? event.dateDisplayMode.trim().toUpperCase()
        : 'SCHEDULED';
    const isEvergreenProgram = normalizedDateDisplayMode === 'NO_FIXED_DATE'
        || normalizedDateDisplayMode === 'ONGOING';
    const eventScheduleDisplayText = isEvergreenProgram
        ? (event.dateDisplayText?.trim() || event.scheduleText?.trim() || 'No fixed start date')
        : `${date} at ${time}`;
    const startDateValue = parseDateValue(event.start ?? null);
    const endDateValue = parseDateValue(event.end ?? null);
    const sharesSingleDayWindow = Boolean(
        startDateValue
        && endDateValue
        && startDateValue.toDateString() === endDateValue.toDateString(),
    );
    const sportLabel = getSportLabel(event);
    const isTeamSignup = Boolean(event.teamSignup);
    const organization = typeof event.organization === 'object' && event.organization
        ? event.organization
        : null;
    const organizationName = getOrganizationName(event.organization);
    const isOrganizationEvent = typeof event.organizationId === 'string'
        && event.organizationId.trim().length > 0;
    const hostedByLabel = (() => {
        if (isOrganizationEvent && organizationName) {
            return organizationName;
        }
        if (hostUser) {
            return getStaffFullName(hostUser) ?? STAFF_NAME_UNAVAILABLE_LABEL;
        }
        if (organizationName) {
            return organizationName;
        }
        return 'Hosted by organizer';
    })();
    const hostedByHandle = !isOrganizationEvent && hostUser ? getUserHandle(hostUser) : null;
    const hostedByHref = getOrganizationHostedByHref({
        organization,
        organizationId: event.organizationId,
        affiliateUrl: affiliateActionUrl,
        isAffiliateEvent,
    });
    const hasCoordinates = Array.isArray(event.coordinates) && event.coordinates.length >= 2;
    const mapLat = hasCoordinates ? Number(event.coordinates[1]) : undefined;
    const mapLng = hasCoordinates ? Number(event.coordinates[0]) : undefined;
    const hasValidCoords = typeof mapLat === 'number'
        && typeof mapLng === 'number'
        && !Number.isNaN(mapLat)
        && !Number.isNaN(mapLng);
    const eventAddress = (event.address || '').trim();
    const mapQuery = eventAddress.length > 0
        ? eventAddress
        : (hasValidCoords ? `${mapLat},${mapLng}` : '');
    const mapEmbedSrc = mapQuery
        ? `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=14&output=embed`
        : null;
    const eventPriceSummary = isAffiliateEvent
        ? formatAffiliateEventPriceRange(event)
        : `${formatEventDivisionPriceRange(event)} / ${isTeamSignup ? 'team' : 'player'}`;
    const usesManualRegistrationPayments = event.registrationPaymentMode === 'MANUAL'
        || (event.manualPaymentLinks ?? []).length > 0
        || Boolean(event.manualPaymentInstructions?.trim());
    const showSecurePaymentNote = !isAffiliateEvent
        && !usesManualRegistrationPayments
        && normalizePriceCents(selectedDivisionBillingPriceCents) > 0;
    const showPoweredByBracketIqNote = !isAffiliateEvent;
    const registrationCutoffSummary = formatRegistrationCutoffSummary(event.registrationCutoffHours);
    const refundSummary = formatRefundSummary(event.cancellationRefundHours);
    const eventTypeLabel = isEvergreenProgram
        ? 'Program'
        : formatEnumDisplayLabel(event.eventType, 'Event');
    const registrationTypeLabel = isTeamSignup ? 'Team registration' : 'Individual registration';
    const spotsSummary = participantCapacity > 0
        ? `${spotsLeft} ${spotsLeft === 1 ? 'spot' : 'spots'} left`
        : 'Open capacity';
    const eventLocationSummary = event.location || 'Location coming soon';
    const shouldShowHostedByHeroLabel = Boolean(
        hostedByLabel
        && normalizeComparableLabel(hostedByLabel) !== normalizeComparableLabel(eventLocationSummary),
    );
    const officialPositionsSummary = uniqueNonEmptyStrings(
        (event.officialPositions ?? [])
            .slice()
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
            .map((position) => {
                const normalizedName = position.name?.trim() || 'Official';
                const normalizedCount = Number.isFinite(Number(position.count))
                    ? Math.max(1, Math.trunc(Number(position.count)))
                    : 1;
                return `${normalizedName} x${normalizedCount}`;
            }),
    ).join(', ') || 'None';
    const assistantHostNames = (() => {
        const hydratedIds = new Set((event.assistantHosts ?? []).map((entry) => entry.$id));
        return uniqueNonEmptyStrings([
            ...(event.assistantHosts ?? []).map(
                (entry) => getStaffFullName(entry) ?? STAFF_NAME_UNAVAILABLE_LABEL,
            ),
            ...((event.assistantHostIds ?? [])
                .filter((entry) => !hydratedIds.has(entry))
                .map(() => STAFF_NAME_UNAVAILABLE_LABEL)),
        ]);
    })();
    const officialNames = (() => {
        const hydratedIds = new Set((event.officials ?? []).map((entry) => entry.$id));
        return uniqueNonEmptyStrings([
            ...(event.officials ?? []).map(
                (entry) => getStaffFullName(entry) ?? STAFF_NAME_UNAVAILABLE_LABEL,
            ),
            ...((event.officialIds ?? [])
                .filter((entry) => !hydratedIds.has(entry))
                .map(() => STAFF_NAME_UNAVAILABLE_LABEL)),
        ]);
    })();
    const normalizedViewerId = typeof user?.$id === 'string' ? user.$id.trim() : '';
    const organizationHostIds = typeof event.organization === 'object' && event.organization
        ? collectOrganizationHostIds(event.organization)
        : [];
    const canViewStaffSection = Boolean(
        normalizedViewerId
        && (
            event.hostId === normalizedViewerId
            || (event.assistantHostIds ?? []).includes(normalizedViewerId)
            || (event.officialIds ?? []).includes(normalizedViewerId)
            || organizationHostIds.includes(normalizedViewerId)
        ),
    );
    const readOnlyFieldCount = (() => {
        if (Array.isArray(event.fields) && event.fields.length > 0) {
            return event.fields.length;
        }
        if (Array.isArray(event.fieldIds) && event.fieldIds.length > 0) {
            return event.fieldIds.length;
        }
        if (typeof event.fieldCount === 'number' && Number.isFinite(event.fieldCount)) {
            return Math.max(0, Math.trunc(event.fieldCount));
        }
        return 0;
    })();
    const scheduleFieldNamesById = new Map((event.fields ?? []).map((field) => [field.$id, field]));
    const fallbackDivisionIds = Array.isArray(event.divisions)
        ? event.divisions
            .map((entry) => getDivisionIdFromEventEntry(entry))
            .filter((entry): entry is string => Boolean(entry))
        : [];
    const scheduleTimeslotGroups = buildScheduleTimeslotGroups(event.timeSlots ?? []);
    const teamNameById = new Map(teams.map((team) => [team.$id, team.name || 'Team']));
    const selectedDivisionScheduleAliases = new Set<string>([
        ...getNormalizedDivisionAliases(selectedDivisionOption?.id),
        ...getNormalizedDivisionAliases(selectedDivisionOption?.key),
        ...getNormalizedDivisionAliases(selectedDivisionOption?.divisionTypeKey),
    ]);
    const matchesSelectedScheduleDivision = (value: unknown): boolean => {
        if (selectedDivisionScheduleAliases.size === 0) {
            return false;
        }
        const aliases = new Set<string>();
        if (value && typeof value === 'object') {
            const row = value as { id?: unknown; $id?: unknown; key?: unknown; name?: unknown };
            [row.id, row.$id, row.key, row.name].forEach((entry) => {
                getNormalizedDivisionAliases(entry).forEach((alias) => aliases.add(alias));
            });
        } else {
            getNormalizedDivisionAliases(value).forEach((alias) => aliases.add(alias));
        }
        return Array.from(aliases).some((alias) => selectedDivisionScheduleAliases.has(alias));
    };
    const getMatchTeamLabel = (match: Match, side: 'team1' | 'team2'): string => {
        const hydratedTeam = match[side];
        if (
            hydratedTeam
            && typeof hydratedTeam === 'object'
            && typeof hydratedTeam.name === 'string'
            && hydratedTeam.name.trim().length > 0
        ) {
            return hydratedTeam.name.trim();
        }
        const teamId = side === 'team1' ? match.team1Id : match.team2Id;
        if (teamId && teamNameById.has(teamId)) {
            return teamNameById.get(teamId) ?? 'Team';
        }
        const seed = side === 'team1' ? match.team1Seed : match.team2Seed;
        return typeof seed === 'number' ? `Seed ${seed}` : 'TBD';
    };
    const eventDisplayTimeZone = normalizeTimeZone(event.timeZone);
    const formatEventWeekday = (value: Date): string => new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        timeZone: eventDisplayTimeZone,
    }).format(value);
    const schedulePreviewItems = (() => {
        const nowMs = now.getTime();
        const allMatchRows = (event.matches ?? [])
            .map((match) => {
                const start = parseDateValue(match.start ?? null);
                if (!start) {
                    return null;
                }
                const fieldLabel = match.field
                    ? getFieldDisplayName(match.field, match.fieldId ?? undefined)
                    : match.fieldId
                        ? getFieldDisplayName({
                            $id: match.fieldId,
                            name: scheduleFieldNamesById.get(match.fieldId)?.name ?? '',
                        }, match.fieldId)
                        : 'Field TBD';
                return {
                    id: match.$id,
                    startMs: start.getTime(),
                    dateKey: formatDisplayDate(start, { year: '2-digit', timeZone: eventDisplayTimeZone }),
                    dateLabel: formatDisplayDate(start, { year: '2-digit', timeZone: eventDisplayTimeZone }),
                    dayLabel: formatEventWeekday(start),
                    timeLabel: formatDisplayTime(start, { timeZone: eventDisplayTimeZone }),
                    title: `${getMatchTeamLabel(match, 'team1')} vs ${getMatchTeamLabel(match, 'team2')}`,
                    meta: fieldLabel,
                    matchesSelectedDivision: matchesSelectedScheduleDivision(match.division),
                };
            })
            .filter((row): row is NonNullable<typeof row> => row !== null)
            .sort((left, right) => left.startMs - right.startMs);
        const selectedDivisionMatchRows = allMatchRows.filter((row) => row.matchesSelectedDivision);
        const matchRows = selectedDivisionMatchRows.length > 0 ? selectedDivisionMatchRows : allMatchRows;
        const preferredMatches = matchRows.filter((row) => row.startMs >= nowMs);
        const selectedMatches = (preferredMatches.length > 0 ? preferredMatches : matchRows).slice(0, 4);
        if (selectedMatches.length > 0) {
            return selectedMatches;
        }

        const timeslotRows = scheduleTimeslotGroups
            .flatMap(([dayOfWeek, slots]) => slots.map((slot) => {
                const slotDivisionIds = Array.isArray(slot.divisions) && slot.divisions.length
                    ? slot.divisions
                    : [];
                const fieldNames = uniqueNonEmptyStrings((
                    Array.isArray(slot.scheduledFieldIds) && slot.scheduledFieldIds.length
                        ? slot.scheduledFieldIds
                        : typeof slot.scheduledFieldId === 'string' && slot.scheduledFieldId.trim().length > 0
                            ? [slot.scheduledFieldId]
                            : []
                ).map((fieldId: string) => {
                    const resolved = scheduleFieldNamesById.get(fieldId);
                    return getFieldDisplayName({ $id: fieldId, name: resolved?.name ?? '' }, fieldId);
                }));
                const divisionNames = uniqueNonEmptyStrings((
                    slotDivisionIds.length ? slotDivisionIds : fallbackDivisionIds
                ).map((divisionId: string) => resolveDivisionDisplayName({
                    division: divisionId,
                    divisionNameIndex: divisionDisplayNameIndex,
                    sportInput: sportLabel,
                }) ?? divisionId));
                const dayLabel = getDayOfWeekLabel(dayOfWeek);
                return {
                    id: slot.$id,
                    startMs: typeof slot.startTimeMinutes === 'number'
                        ? slot.startTimeMinutes
                        : Number.MAX_SAFE_INTEGER,
                    dateKey: dayLabel,
                    dateLabel: dayLabel,
                    dayLabel: 'Weekly',
                    timeLabel: formatSlotTimeRange(slot.startTimeMinutes, slot.endTimeMinutes),
                    title: formatReadOnlyValueList(fieldNames, 'Fields TBD'),
                    meta: formatReadOnlyValueList(divisionNames, 'All divisions'),
                    matchesSelectedDivision: slotDivisionIds.some(matchesSelectedScheduleDivision),
                };
            }))
            .sort((left, right) => left.startMs - right.startMs);
        const selectedDivisionTimeslotRows = timeslotRows.filter((row) => row.matchesSelectedDivision);
        return (selectedDivisionTimeslotRows.length > 0 ? selectedDivisionTimeslotRows : timeslotRows)
            .slice(0, 4);
    })();
    const scheduleDateChips = Array.from(
        schedulePreviewItems.reduce((entries, item) => {
            if (!entries.has(item.dateKey)) {
                entries.set(item.dateKey, {
                    key: item.dateKey,
                    dayLabel: item.dayLabel,
                    dateLabel: item.dateLabel,
                });
            }
            return entries;
        }, new Map<string, { key: string; dayLabel: string; dateLabel: string }>()),
    ).map(([, value]) => value).slice(0, 5);
    const supportsScheduleDetails = event.eventType === 'LEAGUE'
        || event.eventType === 'TOURNAMENT'
        || event.eventType === 'WEEKLY_EVENT'
        || Boolean(readOnlyFieldCount)
        || Boolean(event.timeSlots?.length);

    return {
        affiliateActionUrl,
        isAffiliateEvent,
        isEvergreenProgram,
        eventScheduleDisplayText,
        startDateValue,
        endDateValue,
        sharesSingleDayWindow,
        sportLabel,
        organization,
        hostedByLabel,
        hostedByHandle,
        hostedByHref,
        mapLat,
        mapLng,
        eventAddress,
        mapEmbedSrc,
        eventPriceSummary,
        showSecurePaymentNote,
        showPoweredByBracketIqNote,
        registrationCutoffSummary,
        refundSummary,
        eventTypeLabel,
        registrationTypeLabel,
        spotsSummary,
        eventLocationSummary,
        shouldShowHostedByHeroLabel,
        officialPositionsSummary,
        assistantHostNames,
        officialNames,
        canViewStaffSection,
        eventDisplayTimeZone,
        schedulePreviewItems,
        ...incompleteSchedule,
        scheduleDateChips,
        supportsScheduleDetails,
        canShowScheduleButton: isEventHost && !renderInline && !isWeeklyParentEvent,
        showParticipantsSection: !isWeeklyParentEvent,
        scheduleButtonLabel: isEventHost ? 'Manage Event' : 'View Schedule',
    };
}
