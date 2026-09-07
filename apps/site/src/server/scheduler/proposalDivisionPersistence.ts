import type { EventEditorCreateProposalGraph } from "@/contracts/eventEditor";
import type { MatchPersistenceInput } from "@/server/repositories/events";

type Division =
  EventEditorCreateProposalGraph["event"]["divisionDetails"][number];
type Match = Pick<
  EventEditorCreateProposalGraph["matches"][number],
  "id" | "division" | "phaseDivisionId" | "sourceDivisionId" | "phase"
>;

const phaseIdentity = (
  match: Match,
  division: Partial<Division>,
  source: Division,
) => ({
  role: division.role ?? (match.phaseDivisionId ? "PHASE" : null),
  phase: division.phase ?? match.phase ?? source.phase,
  sourceDivisionId: division.sourceDivisionId ?? match.sourceDivisionId ?? null,
});

export const proposalDivisionPersistence = (
  match: Match,
  divisions: ReadonlyMap<string, Division>,
  fail: (message: string) => never,
): MatchPersistenceInput["division"] => {
  const id = match.phaseDivisionId ?? match.division ?? match.sourceDivisionId;
  if (!id)
    return fail(
      `Match ${match.id} has no Competition Phase or Division identity.`,
    );
  const division = divisions.get(id);
  const source =
    division ??
    (match.sourceDivisionId
      ? divisions.get(match.sourceDivisionId)
      : undefined);
  if (!source)
    return fail(`Match ${match.id} references unknown Division ${id}.`);
  return {
    id,
    kind: source.kind,
    ...phaseIdentity(match, division ?? {}, source),
    phaseSettings: Object.fromEntries(
      Object.entries(source.phaseSettings).map(([phase, settings]) => [
        phase,
        { officialPositions: settings.officialPositions },
      ]),
    ),
  };
};
