import { Alert, Stack, Text } from "@mantine/core";
import type { EventEditorScheduleDiagnostics } from "@/contracts/eventEditor";
import type { EventEditorScheduleDiagnosticEvidence } from "@/contracts/eventEditor";

const optionalValue = <T,>(
  value: T | undefined,
  format: (value: T) => string,
): string[] => (value === undefined ? [] : [format(value)]);

const nonEmptyValues = (
  values: string[] | undefined,
  label: string,
): string[] => (values?.length ? [`${label} ${values.join(", ")}.`] : []);

const evidenceText = (evidence: EventEditorScheduleDiagnosticEvidence): string => {
  return [
    `Evidence: ${evidence.message}`,
    ...optionalValue(evidence.demand, (value) => `Demand ${value}.`),
    ...optionalValue(evidence.capacity, (value) => `Capacity ${value}.`),
    ...optionalValue(evidence.deficit, (value) => `Deficit ${value}.`),
    ...optionalValue(evidence.candidateCount, (value) => `Candidates ${value}.`),
    ...nonEmptyValues(evidence.resourceIds, "Resources"),
    ...nonEmptyValues(evidence.divisionIds, "Divisions"),
    ...nonEmptyValues(evidence.teamIds, "Teams"),
    ...nonEmptyValues(evidence.dependencyIds, "Dependencies"),
    ...nonEmptyValues(evidence.officialIds, "Officials"),
    ...nonEmptyValues(evidence.timeSlotIds, "Time Slots"),
    ...optionalValue(
      evidence.intervals,
      (intervals) => `Intervals ${intervals.map((interval) => `${interval.start} to ${interval.end}`).join("; ")}.`,
    ),
  ].join(" ");
};

const ScheduleDiagnosticEvidence = ({
  evidence,
}: {
  evidence: EventEditorScheduleDiagnosticEvidence;
}) => (
  <Text size="xs" c="dimmed">
    {evidenceText(evidence)}
  </Text>
);

const ScheduleDiagnosticFactors = ({
  diagnostics,
}: {
  diagnostics: EventEditorScheduleDiagnostics;
}) => {
  if (diagnostics.restrictingFactors.length === 0) {
    return <Text size="sm">Restricting Factors: none proven.</Text>;
  }
  return (
    <>
      <Text size="sm" fw={600}>Restricting Factors</Text>
      {diagnostics.restrictingFactors.map((factor) => (
        <Stack key={`${factor.factor}-${factor.confidence}`} gap={2}>
          <Text size="sm">{factor.factor} ({factor.confidence}): {factor.message}</Text>
          {factor.evidence.map((evidence, index) => (
            <ScheduleDiagnosticEvidence
              key={`${factor.factor}-evidence-${index}`}
              evidence={evidence}
            />
          ))}
        </Stack>
      ))}
    </>
  );
};

const ScheduleDiagnosticRemedies = ({
  diagnostics,
}: {
  diagnostics: EventEditorScheduleDiagnostics;
}) => {
  if (diagnostics.remedies.length === 0) {
    return <Text size="sm">Possible remedies: none supported by the evidence.</Text>;
  }
  return (
    <>
      <Text size="sm" fw={600}>Possible remedies</Text>
      {diagnostics.remedies.map((remedy) => (
        <Stack key={`${remedy.code}-${remedy.factor}`} gap={2}>
          <Text size="sm">{remedy.code} ({remedy.factor}): {remedy.message}</Text>
          {remedy.evidence.map((evidence, index) => (
            <ScheduleDiagnosticEvidence
              key={`${remedy.code}-evidence-${index}`}
              evidence={evidence}
            />
          ))}
        </Stack>
      ))}
    </>
  );
};

export const ScheduleDiagnosticsSummary = (params: {
  diagnostics?: EventEditorScheduleDiagnostics;
}) => {
  const diagnostics = params.diagnostics;
  if (!diagnostics) return null;
  return (
    <Alert title="Schedule diagnostics" color="blue">
      <Stack gap="xs">
        <Text size="sm">{diagnostics.message}</Text>
        <Text size="sm">
          Match Demand: {diagnostics.matchDemand.total} total, {diagnostics.matchDemand.placed} placed, {diagnostics.matchDemand.unplaced} unplaced.
        </Text>
        <Text size="sm">
          Estimated Capacity: {diagnostics.estimatedCapacity} matches (upper bound: {String(diagnostics.estimatedCapacityIsUpperBound)}). Minimum capacity deficit: {diagnostics.minimumDeficitMatches} matches.
        </Text>
        <Text size="sm">Placement search complete: {String(diagnostics.searchComplete)}.</Text>
        <ScheduleDiagnosticFactors diagnostics={diagnostics} />
        <ScheduleDiagnosticRemedies diagnostics={diagnostics} />
      </Stack>
    </Alert>
  );
};
