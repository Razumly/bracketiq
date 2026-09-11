import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DiscoverTabFilterBar from "../DiscoverTabFilterBar";
import type { DivisionDiscoveryFilterValue } from "../DivisionDiscoveryFilters";

const initialDivisionFilters: DivisionDiscoveryFilterValue = {
  genders: ["F"],
  skillDivisionTypeIds: ["open"],
  ageDivisionTypeIds: ["adult"],
  priceMinDollars: 10,
  priceMaxDollars: 50,
};

function Harness({
  onChange,
}: {
  onChange: (value: DivisionDiscoveryFilterValue) => void;
}) {
  const [selectedSports, setSelectedSports] = useState(["Soccer"]);
  const [divisionFilters, setDivisionFilters] = useState(
    initialDivisionFilters,
  );
  return (
    <DiscoverTabFilterBar
      target="organizations"
      location={null}
      defaultMaxDistance={50}
      sports={["Soccer", "Volleyball"]}
      selectedSports={selectedSports}
      setSelectedSports={setSelectedSports}
      sportsLoading={false}
      sportsError={null}
      filters={{
        selectedTags: [],
        setSelectedTags: jest.fn(),
        organizationTags: [],
        organizationTagsLoading: false,
        organizationTagsError: null,
        divisionFilters,
        setDivisionFilters: (value) => {
          setDivisionFilters(value);
          onChange(value);
        },
        maxDistance: null,
        setMaxDistance: jest.fn(),
      }}
    />
  );
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.clearAllMocks();
});

it.each(["Volleyball", "All sports"])(
  "clears organization skills through %s while Division is closed",
  async (sportButton) => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        genders: [{ id: "F", name: "Women" }],
        ages: [{ id: "adult", name: "Adult" }],
        sportSkills: [
          {
            sportId: "soccer",
            sportName: "Soccer",
            skills: [{ id: "open", name: "Open" }],
          },
        ],
      }),
    });
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    expect(
      screen.queryByRole("dialog", { name: "Division filter" }),
    ).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: sportButton, exact: true }),
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        ...initialDivisionFilters,
        skillDivisionTypeIds: [],
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Division: Applied", exact: true }),
    );
    expect(
      await screen.findByPlaceholderText("Any gender"),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Any age group")).toBeInTheDocument();
    expect(screen.getByLabelText("Minimum price")).toHaveValue("10");
    expect(screen.getByLabelText("Maximum price")).toHaveValue("50");
    expect(
      screen.queryByPlaceholderText("Any skill level"),
    ).not.toBeInTheDocument();
  },
);
