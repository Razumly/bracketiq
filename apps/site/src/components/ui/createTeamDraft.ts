import type { TeamJoinPolicy, UserData } from "@/types";
import type { teamService } from "@/lib/teamService";
import {
  buildDivisionName,
  getDivisionTypeOptionsForSport,
} from "@/lib/divisionTypes";

export type CreateTeamDraft = {
  name: string;
  sport: string;
  joinPolicy: TeamJoinPolicy;
  registrationPriceDollars: string | number;
  divisionGender: "M" | "F" | "C" | "";
  skillDivisionTypeId: string;
  ageDivisionTypeId: string;
  teamSize: string | number;
  addSelfAsPlayer: boolean;
  profileImageId: string;
  imageUrl: string;
  isAffiliateRegistration: boolean;
  affiliateUrl: string;
  requiredTemplateIds: string[];
};

export const emptyTeamDraft = (): CreateTeamDraft => ({
  name: "",
  sport: "",
  joinPolicy: "CLOSED",
  registrationPriceDollars: 0,
  divisionGender: "",
  skillDivisionTypeId: "",
  ageDivisionTypeId: "",
  teamSize: 6,
  addSelfAsPlayer: true,
  profileImageId: "",
  imageUrl: "",
  isAffiliateRegistration: false,
  affiliateUrl: "",
  requiredTemplateIds: [],
});

const normalizeDivisionToken = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const effectiveTeamJoinPolicy = (
  draft: CreateTeamDraft,
): TeamJoinPolicy =>
  draft.isAffiliateRegistration ? "OPEN_REGISTRATION" : draft.joinPolicy;

export const requiresTeamDivision = (draft: CreateTeamDraft) =>
  effectiveTeamJoinPolicy(draft) !== "CLOSED" && !draft.isAffiliateRegistration;

export function teamSizeError(value: string | number): string | null {
  const size = Number(value);
  return !Number.isFinite(size) || Math.trunc(size) < 2
    ? "Team size must be 2 or above."
    : null;
}

function normalizeUserId(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function teamCreatorId(
  user: (UserData & { id?: unknown }) | null,
): string {
  return normalizeUserId(user?.$id) || normalizeUserId(user?.id);
}

export function updateTeamDraft(
  draft: CreateTeamDraft,
  patch: Partial<CreateTeamDraft>,
): CreateTeamDraft {
  const next = { ...draft, ...patch };
  if (patch.isAffiliateRegistration) {
    next.joinPolicy = "OPEN_REGISTRATION";
    next.registrationPriceDollars = 0;
  }
  if (patch.joinPolicy === "CLOSED") {
    next.isAffiliateRegistration = false;
    next.affiliateUrl = "";
    next.registrationPriceDollars = 0;
  }
  return normalizeDraftDivision(next);
}

function normalizeDraftDivision(draft: CreateTeamDraft): CreateTeamDraft {
  if (!requiresTeamDivision(draft) || !draft.sport.trim()) {
    return {
      ...draft,
      divisionGender: "",
      skillDivisionTypeId: "",
      ageDivisionTypeId: "",
    };
  }
  const options = getDivisionTypeOptionsForSport(draft.sport);
  const hasSkill = options.some(
    (option) =>
      option.ratingType === "SKILL" && option.id === draft.skillDivisionTypeId,
  );
  const hasAge = options.some(
    (option) =>
      option.ratingType === "AGE" && option.id === draft.ageDivisionTypeId,
  );
  return {
    ...draft,
    skillDivisionTypeId: hasSkill ? draft.skillDivisionTypeId : "",
    ageDivisionTypeId: hasAge ? draft.ageDivisionTypeId : "",
  };
}

export function teamDivisionPreview(draft: CreateTeamDraft): string {
  if (
    !requiresTeamDivision(draft) ||
    !draft.divisionGender ||
    !draft.skillDivisionTypeId ||
    !draft.ageDivisionTypeId
  )
    return "";
  return buildDivisionName({
    gender: draft.divisionGender,
    sportInput: draft.sport.trim(),
    skillDivisionTypeId: normalizeDivisionToken(draft.skillDivisionTypeId),
    ageDivisionTypeId: normalizeDivisionToken(draft.ageDivisionTypeId),
  });
}

function validateTeamDraft(
  draft: CreateTeamDraft,
  creatorId: string,
): string | null {
  if (!draft.name.trim()) return "Team name is required.";
  if (!draft.sport.trim()) return "Sport is required.";
  if (requiresTeamDivision(draft) && !teamDivisionPreview(draft))
    return "Select gender, skill division, and age division.";
  const sizeError = teamSizeError(draft.teamSize);
  if (sizeError) return sizeError;
  if (!creatorId) return "Sign in again before creating a team.";
  if (draft.isAffiliateRegistration && !draft.affiliateUrl.trim())
    return "Affiliate registration link is required.";
  return null;
}

function registrationPriceCents(
  draft: CreateTeamDraft,
  canCharge: boolean,
): number {
  if (draft.affiliateUrl.trim()) return 0;
  const policy = effectiveTeamJoinPolicy(draft);
  const canSetPrice =
    policy === "REQUEST_TO_JOIN" ||
    (policy === "OPEN_REGISTRATION" && canCharge);
  if (!canSetPrice) return 0;
  return Math.max(
    0,
    Math.round((Number(draft.registrationPriceDollars) || 0) * 100),
  );
}

function teamCreationOptions(
  draft: CreateTeamDraft,
  canCharge: boolean,
  organizationId?: string,
) {
  const policy = effectiveTeamJoinPolicy(draft);
  const skill = normalizeDivisionToken(draft.skillDivisionTypeId) || "open";
  const age = normalizeDivisionToken(draft.ageDivisionTypeId) || "18plus";
  return {
    divisionTypeId: requiresTeamDivision(draft)
      ? `skill_${skill}_age_${age}`
      : undefined,
    addSelfAsPlayer: draft.addSelfAsPlayer,
    organizationId,
    affiliateUrl: draft.isAffiliateRegistration
      ? draft.affiliateUrl.trim()
      : null,
    joinPolicy: policy,
    openRegistration: policy === "OPEN_REGISTRATION",
    registrationPriceCents: registrationPriceCents(draft, canCharge),
    requiredTemplateIds: organizationId ? draft.requiredTemplateIds : [],
  };
}

type TeamCreationResult =
  | { error: string }
  | { args: Parameters<typeof teamService.createTeam> };

export function prepareTeamCreation(
  draft: CreateTeamDraft,
  user: UserData | null,
  organizationId?: string,
): TeamCreationResult {
  const creatorId = teamCreatorId(user);
  const error = validateTeamDraft(draft, creatorId);
  if (error) return { error };
  return {
    args: [
      draft.name.trim(),
      creatorId,
      teamDivisionPreview(draft),
      draft.sport.trim(),
      Math.trunc(Number(draft.teamSize)),
      draft.profileImageId || undefined,
      teamCreationOptions(
        draft,
        Boolean(user?.hasStripeAccount),
        organizationId,
      ),
    ],
  };
}
