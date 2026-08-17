import { fireEvent, screen, within } from "@testing-library/react";

import type { LeagueConfig, Sport, TournamentConfig } from "@/types";
import { renderWithMantine } from "../../../../../../../../../test/utils/renderWithMantine";

import { SingleDivisionScheduleControls } from "../SingleDivisionScheduleControls";

jest.mock("@/app/discover/components/LeagueFields", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/app/discover/components/TournamentFields", () => ({
  __esModule: true,
  default: () => null,
}));

const sport = {
  $id: "sport_soccer",
  name: "Soccer",
  matchRulesTemplate: {
    scoringModel: "PERIODS",
    segmentCount: 2,
    segmentLabel: "Half",
    timekeeping: { timerMode: "COUNT_UP", segmentDurationMinutes: 45 },
  },
} as Sport;

const leagueData = {
  gamesPerOpponent: 1,
  includePlayoffs: false,
  usesSets: false,
  matchDurationMinutes: 90,
  restTimeMinutes: 10,
} as LeagueConfig;

const tournamentData = {
  doubleElimination: false,
  winnerSetCount: 1,
  loserSetCount: 1,
  winnerBracketPointsToVictory: [1],
  loserBracketPointsToVictory: [1],
  prize: "",
  fieldCount: 1,
  restTimeMinutes: 10,
  usesSets: false,
  matchDurationMinutes: 90,
} as TournamentConfig;

const controls = (
  <SingleDivisionScheduleControls
    singleDivision
    eventType="TOURNAMENT"
    includePlayoffs={false}
    leagueData={leagueData}
    playoffData={tournamentData}
    tournamentData={tournamentData}
    sport={sport}
    phaseSettings={{}}
    participantCount={8}
    poolDefaults={{ poolCount: null, poolTeamCount: undefined }}
    maxStandardNumber={100}
    disabled={false}
    onLeagueDataChange={jest.fn()}
    onPlayoffDataChange={jest.fn()}
    onTournamentDataChange={jest.fn()}
    onPoolDefaultsChange={jest.fn()}
    onPhaseSettingsChange={jest.fn()}
  />
);

describe("SingleDivisionScheduleControls", () => {
  it("shows total bracket cycle time including rest between matches", () => {
    renderWithMantine(controls);

    expect(
      screen.getByText(
        "Calculated match duration: 90 minutes. Total time with rest: 100 minutes.",
      ),
    ).toBeInTheDocument();
  });

  it("allows single-division bracket rules to be edited", async () => {
    renderWithMantine(controls);

    fireEvent.click(screen.getByRole("button", { name: "Bracket rules" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByLabelText("Half count")).toBeEnabled();
  });
});
