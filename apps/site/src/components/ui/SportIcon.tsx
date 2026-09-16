import type { ReactNode, SVGProps } from "react";
import { Check } from "lucide-react";

import {
  SPORT_ICON_ASSET_HREFS,
  SPORT_ICON_KEYS,
  type SportIconKey,
} from "./sharedIconManifest.generated";

export { SPORT_ICON_KEYS };
export type { SportIconKey };

const normalizeSportName = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const SPORT_ICON_KEY_BY_NAME: Readonly<Record<string, SportIconKey>> = {
  "indoor volleyball": "indoor-volleyball",
  "beach volleyball": "beach-volleyball",
  "grass volleyball": "grass-volleyball",
  volleyball: "indoor-volleyball",
  basketball: "basketball",
  "indoor soccer": "indoor-soccer",
  "grass soccer": "grass-soccer",
  "beach soccer": "beach-soccer",
  soccer: "indoor-soccer",
  tennis: "tennis",
  pickleball: "pickleball",
  badminton: "badminton",
  racquetball: "racquetball",
  football: "football",
  "american football": "football",
  "flag football": "flag-football",
  hockey: "hockey",
  "field hockey": "field-hockey",
  lacrosse: "lacrosse",
  "australian football": "australian-football",
  "ball hockey": "ball-hockey",
  futsal: "futsal",
  baseball: "baseball",
  softball: "softball",
  "table tennis": "table-tennis",
  "ultimate frisbee": "ultimate-frisbee",
  other: "other",
};

export const getSportIconKey = (sport: unknown): SportIconKey => {
  const normalized = normalizeSportName(sport);
  const exactMatch = SPORT_ICON_KEY_BY_NAME[normalized];
  if (exactMatch) return exactMatch;
  if (normalized.includes("volleyball")) return "indoor-volleyball";
  if (normalized.includes("soccer")) return "indoor-soccer";
  if (normalized.includes("pickleball")) return "pickleball";
  if (normalized.includes("badminton")) return "badminton";
  if (normalized.includes("racquetball")) return "racquetball";
  if (normalized.includes("field hockey")) return "field-hockey";
  if (normalized.includes("ball hockey")) return "ball-hockey";
  if (normalized.includes("hockey")) return "hockey";
  if (normalized.includes("lacrosse")) return "lacrosse";
  if (normalized.includes("australian football")) return "australian-football";
  if (normalized.includes("flag football")) return "flag-football";
  if (normalized.includes("football")) return "football";
  if (normalized.includes("futsal")) return "futsal";
  if (normalized.includes("table tennis")) return "table-tennis";
  if (normalized.includes("softball")) return "softball";
  if (normalized.includes("baseball")) return "baseball";
  if (normalized.includes("ultimate frisbee")) return "ultimate-frisbee";
  if (normalized.includes("tennis")) return "tennis";
  if (normalized.includes("basketball")) return "basketball";
  return "other";
};

const getSportIconAssetHref = (iconKey: SportIconKey): string =>
  SPORT_ICON_ASSET_HREFS[iconKey];

export type SportIconProps = Omit<
  SVGProps<SVGSVGElement>,
  "children" | "height" | "width" | "aria-label"
> & {
  sport: string | null | undefined;
  size?: number | string;
  label?: string;
};

export function SportIcon({
  sport,
  size = 20,
  label,
  ...props
}: SportIconProps) {
  const iconKey = getSportIconKey(sport);
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      data-sport-icon={iconKey}
    >
      {label ? <title>{label}</title> : null}
      <use href={getSportIconAssetHref(iconKey)} />
    </svg>
  );
}

export type SportLabelProps = {
  sport: string | null | undefined;
  iconSize?: number | string;
  className?: string;
};

export function SportLabel({
  sport,
  iconSize = 16,
  className = "",
}: SportLabelProps) {
  const displayName =
    typeof sport === "string" && sport.trim() ? sport.trim() : "Sport";
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
      <SportIcon sport={displayName} size={iconSize} />
      <span>{displayName}</span>
    </span>
  );
}

export type SportOptionRenderProps = {
  option: { value: string; label: string };
  checked?: boolean;
};
export function renderSportOption({
  option,
  checked,
}: SportOptionRenderProps): ReactNode {
  return (
    <span className="flex w-full items-center justify-between gap-2">
      <SportLabel sport={option.label} iconSize={16} />
      <span
        aria-hidden="true"
        className="flex h-4 w-4 shrink-0 items-center justify-center text-emerald-700"
      >
        {checked ? (
          <Check size={15} strokeWidth={2.5} data-sport-option-check="true" />
        ) : null}
      </span>
    </span>
  );
}

export default SportIcon;
