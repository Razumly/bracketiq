import { normalizeBracketTeamCount } from '@/lib/divisionTypes';

type DivisionDefaultsTarget = {
    price: number;
    maxParticipants: number;
    playoffTeamCount?: number;
    poolCount?: number;
    poolTeamCount?: number;
};

type ApplyEventDivisionDefaultsParams<T extends DivisionDefaultsTarget> = {
    details: T[];
    defaultPrice: number;
    defaultMaxParticipants: number;
    includePlayoffs: boolean;
    defaultPlayoffTeamCount?: number;
    includeTournamentPoolPlay?: boolean;
    defaultPoolCount?: number | null;
};

type ApplyEventDivisionDefaultsResult<T extends DivisionDefaultsTarget> = {
    details: T[];
    changed: boolean;
};

const normalizePrice = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, value);
};

const normalizeCapacity = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 2;
    }
    return Math.max(2, Math.trunc(value));
};

const normalizePoolCount = (value: number | null | undefined): number | undefined => {
    if (!Number.isFinite(Number(value))) {
        return undefined;
    }
    return Math.max(1, Math.trunc(Number(value)));
};

const derivePoolTeamCount = (maxTeams: number, poolCount: number | undefined): number | undefined => {
    if (!poolCount || maxTeams % poolCount !== 0) {
        return undefined;
    }
    return maxTeams / poolCount;
};

export const applyEventDefaultsToDivisionDetails = <T extends DivisionDefaultsTarget>(
    params: ApplyEventDivisionDefaultsParams<T>,
): ApplyEventDivisionDefaultsResult<T> => {
    const normalizedPrice = normalizePrice(params.defaultPrice);
    const normalizedMaxParticipants = normalizeCapacity(params.defaultMaxParticipants);
    const isPlayoffUpdateRequired = params.includePlayoffs || Boolean(params.includeTournamentPoolPlay);
    const normalizedPlayoffTeamCount = normalizeBracketTeamCount(params.defaultPlayoffTeamCount);
    const isPoolUpdateRequired = Boolean(params.includeTournamentPoolPlay);
    const normalizedPoolCount = isPoolUpdateRequired
        ? normalizePoolCount(params.defaultPoolCount)
        : undefined;
    const normalizedPoolTeamCount = isPoolUpdateRequired
        ? derivePoolTeamCount(normalizedMaxParticipants, normalizedPoolCount)
        : undefined;

    let changed = false;
    const nextDetails = params.details.map((detail) => {
        const nextPrice = normalizedPrice;
        const nextMaxParticipants = normalizedMaxParticipants;
        const nextPlayoffTeamCount = isPlayoffUpdateRequired
            ? detail.playoffTeamCount ?? normalizedPlayoffTeamCount
            : detail.playoffTeamCount;
        const nextPoolCount = isPoolUpdateRequired
            ? normalizedPoolCount
            : detail.poolCount;
        const nextPoolTeamCount = isPoolUpdateRequired
            ? normalizedPoolTeamCount
            : detail.poolTeamCount;
        const detailChanged = detail.price !== nextPrice
            || detail.maxParticipants !== nextMaxParticipants
            || (isPlayoffUpdateRequired && detail.playoffTeamCount !== nextPlayoffTeamCount)
            || (isPoolUpdateRequired && detail.poolCount !== nextPoolCount)
            || (isPoolUpdateRequired && detail.poolTeamCount !== nextPoolTeamCount);
        if (!detailChanged) {
            return detail;
        }
        changed = true;
        return {
            ...detail,
            price: nextPrice,
            maxParticipants: nextMaxParticipants,
            ...(isPlayoffUpdateRequired ? { playoffTeamCount: nextPlayoffTeamCount } : {}),
            ...(isPoolUpdateRequired ? {
                poolCount: nextPoolCount,
                poolTeamCount: nextPoolTeamCount,
            } : {}),
        };
    });

    return {
        details: nextDetails,
        changed,
    };
};
