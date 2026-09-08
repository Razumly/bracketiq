import { formatDisplayDateTime } from "@/lib/dateUtils";
import type { OrganizationTeamStaffSummary } from "./organizationCustomerModel";

export const formatSummaryDateTime = (value?: string): string => {
  if (!value) {
    return "Unknown date";
  }
  const formatted = formatDisplayDateTime(value);
  return formatted || "Unknown date";
};

export const formatSummaryDate = (value?: string): string => {
  if (!value) {
    return "Unknown date";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const getProfilePreviewUrl = (
  profileImageId?: string | null,
  size = 48,
): string | undefined =>
  profileImageId
    ? `/api/files/${profileImageId}/preview?w=${size}&h=${size}&fit=cover`
    : undefined;

export const getCustomerInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "?";
  }
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
};

export const formatCustomerMetaToken = (
  value?: string | null,
): string | null => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return null;
  }
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

export const getStaffRoleLabel = (
  role: OrganizationTeamStaffSummary["role"],
): string => {
  if (role === "HEAD_COACH") {
    return "Head Coach";
  }
  if (role === "ASSISTANT_COACH") {
    return "Assistant Coach";
  }
  return "Manager";
};
