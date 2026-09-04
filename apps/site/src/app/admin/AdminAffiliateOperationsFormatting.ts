import type { ProjectionHistoryRow } from "@/types/affiliateOperations";

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
};

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat().format(value);

type StatusColorRule = Readonly<{
  color: string;
  tokens: readonly string[];
  exact: string | null;
}>;

const statusColorRules: readonly StatusColorRule[] = [
  { color: "red", tokens: ["FAIL", "BLOCK", "EXCLUD"], exact: null },
  { color: "yellow", tokens: ["WAIT", "REVIEW", "HOLD"], exact: null },
  {
    color: "green",
    tokens: ["PUBLISH", "ACTIVE", "HEALTHY"],
    exact: "MET",
  },
];

const matchesStatusColorRule = (
  normalized: string,
  rule: StatusColorRule,
): boolean =>
  rule.tokens.some((token) => normalized.includes(token)) ||
  rule.exact === normalized;

export const statusColor = (status: string | null | undefined): string => {
  const normalized = String(status ?? "").toUpperCase();
  const match = statusColorRules.find((rule) =>
    matchesStatusColorRule(normalized, rule),
  );
  return match ? match.color : "gray";
};

export const severityColor = (severity: string): string =>
  severity === "critical" ? "red" : severity === "warning" ? "yellow" : "blue";
export const formatTimeLabel = (value: string | null | undefined): string => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const anchorElementId = (anchor: string): string =>
  `affiliate-operations-anchor-${encodeURIComponent(anchor)}`;
export const historyActor = (row: ProjectionHistoryRow): string =>
  [row.actor, row.workerId, row.executorId].filter(Boolean).join(" / ") ||
  "Not recorded";

const optionalEvidence = (
  present: boolean,
  value: string,
): string | null => (present ? value : null);

const stateEvidence = (row: ProjectionHistoryRow): string | null =>
  row.previousState || row.nextState
    ? `State: ${row.previousState ?? "Not recorded"} → ${row.nextState ?? "Not recorded"}`
    : null;

const generationEvidence = (
  label: string,
  value: number | null | undefined,
): string | null =>
  value === null || value === undefined ? null : `${label}: ${value}`;

export const historyEvidence = (row: ProjectionHistoryRow): string => {
  const evidence = [
    optionalEvidence(
      Boolean(row.evidenceRefs?.length),
      `Refs: ${row.evidenceRefs?.join(", ")}`,
    ),
    optionalEvidence(Boolean(row.inputHash), `Input hash: ${row.inputHash}`),
    optionalEvidence(Boolean(row.outputHash), `Output hash: ${row.outputHash}`),
    stateEvidence(row),
    generationEvidence("Lifecycle generation", row.lifecycleGeneration),
    generationEvidence("Claim generation", row.claimGeneration),
    generationEvidence("Contract version", row.contractVersion),
  ].filter((value): value is string => Boolean(value));
  return evidence.join(" · ") || "Not recorded";
};
