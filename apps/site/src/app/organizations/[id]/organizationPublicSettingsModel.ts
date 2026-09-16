import type { Organization } from "@/types";
import type { PublicSlugCheckResult } from "@/lib/organizationService";
import { slugifyPublicOrganizationName as slugify } from "@/lib/publicOrganizationSlug";
export type SlugCheckStatus =
  | "idle"
  | "checking"
  | "available"
  | "current"
  | "taken"
  | "invalid"
  | "error";

export type SlugCheckState = {
  status: SlugCheckStatus;
  checkedSlug: string | null;
  message: string;
};

export const idleSlugCheck: SlugCheckState = {
  status: "idle",
  checkedSlug: null,
  message: "",
};

export const getSlugCheckState = (
  result: PublicSlugCheckResult,
): SlugCheckState => {
  if (!result.valid) {
    return {
      status: "invalid",
      checkedSlug: result.slug,
      message: result.error ?? "This slug is not valid.",
    };
  }
  if (result.current) {
    return {
      status: "current",
      checkedSlug: result.slug,
      message: "Current slug.",
    };
  }
  if (result.available) {
    return {
      status: "available",
      checkedSlug: result.slug,
      message: "Available.",
    };
  }
  return {
    status: "taken",
    checkedSlug: result.slug,
    message: result.error ?? "This public slug is already in use.",
  };
};

export function initialPublicPageDraft(organization: Organization) {
  return {
    publicSlug: organization.publicSlug ?? slugify(organization.name),
    publicPageEnabled: Boolean(organization.publicPageEnabled),
    publicWidgetsEnabled: Boolean(organization.publicWidgetsEnabled),
    brandPrimaryColor: organization.brandPrimaryColor ?? "#0f766e",
    brandAccentColor: organization.brandAccentColor ?? "#f59e0b",
    publicHeadline:
      organization.publicHeadline ?? `${organization.name} on BracketIQ`,
    publicIntroText:
      organization.publicIntroText ??
      "Find upcoming events, teams, rentals, and products.",
    embedAllowedDomains: (organization.embedAllowedDomains ?? []).join(", "),
    publicCompletionRedirectUrl: organization.publicCompletionRedirectUrl ?? "",
  };
}
export type PublicPageDraft = ReturnType<typeof initialPublicPageDraft>;
export function publicPagePayload(
  draft: PublicPageDraft,
  normalizedSlug: string,
) {
  return {
    ...draft,
    publicSlug: normalizedSlug || null,
    brandPrimaryColor: draft.brandPrimaryColor || null,
    brandAccentColor: draft.brandAccentColor || null,
    embedAllowedDomains: draft.embedAllowedDomains
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    publicCompletionRedirectUrl:
      draft.publicCompletionRedirectUrl.trim() || null,
  };
}

function getSlugReadiness(
  normalizedSlug: string,
  slugCheck: SlugCheckState,
  draft: PublicPageDraft,
) {
  const slugCheckIsPending =
    Boolean(normalizedSlug) &&
    (slugCheck.status === "checking" ||
      slugCheck.checkedSlug !== normalizedSlug);
  const slugHasValidationError =
    Boolean(normalizedSlug) && slugCheck.status === "invalid";
  const slugIsTaken = Boolean(normalizedSlug) && slugCheck.status === "taken";
  const slugMissingForEnabledSurface =
    !normalizedSlug && (draft.publicPageEnabled || draft.publicWidgetsEnabled);
  return {
    slugCheckIsPending,
    slugHasValidationError,
    slugIsTaken,
    slugMissingForEnabledSurface,
  };
}
type SlugReadiness = ReturnType<typeof getSlugReadiness>;
function blocksSave(state: SlugReadiness) {
  return (
    state.slugCheckIsPending ||
    state.slugHasValidationError ||
    state.slugIsTaken ||
    state.slugMissingForEnabledSurface
  );
}
function usableSlug(normalizedSlug: string, state: SlugReadiness) {
  return (
    Boolean(normalizedSlug) &&
    !state.slugCheckIsPending &&
    !state.slugHasValidationError &&
    !state.slugIsTaken
  );
}
function slugStatusColor(slugCheck: SlugCheckState, pending: boolean) {
  if (pending) return "gray";
  if (slugCheck.status === "available" || slugCheck.status === "current")
    return "green";
  if (slugCheck.status === "taken" || slugCheck.status === "invalid")
    return "red";
  return "yellow";
}
function slugStatusLabel(
  normalizedSlug: string,
  pending: boolean,
  draft: PublicPageDraft,
  slugCheck: SlugCheckState,
) {
  if (!normalizedSlug)
    return draft.publicPageEnabled || draft.publicWidgetsEnabled
      ? "Required"
      : "Not set";
  if (pending) return "Checking";
  const labels = {
    available: "Available",
    current: "Current",
    taken: "In use",
    invalid: "Invalid",
    idle: "Check failed",
    checking: "Check failed",
    error: "Check failed",
  };
  return labels[slugCheck.status];
}
function slugValidationHelp(
  normalizedSlug: string,
  state: SlugReadiness,
  slugCheck: SlugCheckState,
) {
  if (!normalizedSlug)
    return "Set a slug before opening previews or copying snippets.";
  if (state.slugCheckIsPending)
    return "Checking slug availability before previews can be opened.";
  if (state.slugHasValidationError || state.slugIsTaken)
    return (
      slugCheck.message || "Choose an available slug before opening previews."
    );
  return "";
}
function previewHelp(
  organization: Organization,
  draft: PublicPageDraft,
  matchesSaved: boolean,
  publicPageReady: boolean,
  widgetsReady: boolean,
) {
  if (!matchesSaved)
    return "Save this slug before opening previews or copying snippets.";
  if (
    draft.publicPageEnabled !== organization.publicPageEnabled ||
    draft.publicWidgetsEnabled !== organization.publicWidgetsEnabled
  )
    return "Save the enable changes before opening previews.";
  if (!publicPageReady && !widgetsReady)
    return "Enable and save the public page or widgets before opening previews.";
  if (!publicPageReady)
    return "Enable and save the public page before opening it.";
  if (!widgetsReady)
    return "Enable and save widgets before opening or copying widget embeds.";
  return "";
}
function publicationReadiness(
  organization: Organization,
  draft: PublicPageDraft,
  slugUsable: boolean,
  matchesSaved: boolean,
) {
  return {
    publicPageReady:
      slugUsable &&
      matchesSaved &&
      draft.publicPageEnabled &&
      organization.publicPageEnabled === true,
    widgetsReady:
      slugUsable &&
      matchesSaved &&
      draft.publicWidgetsEnabled &&
      organization.publicWidgetsEnabled === true,
  };
}
export function publicPageStatus(
  organization: Organization,
  draft: PublicPageDraft,
  slugCheck: SlugCheckState,
  origin: string,
) {
  const normalizedSlug = slugify(draft.publicSlug);
  const organizationNameSlug = slugify(organization.name);
  const savedPublicSlug = organization.publicSlug
    ? slugify(organization.publicSlug)
    : "";
  const readiness = getSlugReadiness(normalizedSlug, slugCheck, draft);
  const slugMatchesSaved =
    Boolean(savedPublicSlug) && normalizedSlug === savedPublicSlug;
  const published = publicationReadiness(
    organization,
    draft,
    usableSlug(normalizedSlug, readiness),
    slugMatchesSaved,
  );
  return {
    ...readiness,
    ...published,
    normalizedSlug,
    organizationNameSlug,
    savedPublicSlug,
    draftPublicPageUrl: normalizedSlug ? `${origin}/o/${normalizedSlug}` : "",
    savedPublicPageUrl: savedPublicSlug ? `${origin}/o/${savedPublicSlug}` : "",
    slugBlocksSave: blocksSave(readiness),
    showSlugStatusMessage: ["taken", "invalid", "error"].includes(
      slugCheck.status,
    ),
    slugStatusColor: slugStatusColor(slugCheck, readiness.slugCheckIsPending),
    slugStatusLabel: slugStatusLabel(
      normalizedSlug,
      readiness.slugCheckIsPending,
      draft,
      slugCheck,
    ),
    previewHelpMessage:
      slugValidationHelp(normalizedSlug, readiness, slugCheck) ||
      previewHelp(
        organization,
        draft,
        slugMatchesSaved,
        published.publicPageReady,
        published.widgetsReady,
      ),
  };
}
