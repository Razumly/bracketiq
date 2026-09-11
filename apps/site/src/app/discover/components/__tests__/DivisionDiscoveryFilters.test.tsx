import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DiscoverFilterBar from "../DiscoverFilterBar";
import DivisionDiscoveryFilters, {
  DivisionDiscoveryFilterValue,
  type DivisionDiscoveryFilterOptions,
  useDivisionDiscoveryOptions,
} from "../DivisionDiscoveryFilters";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const response = (body: unknown, ok = true): Response =>
  ({
    ok,
    json: async () => body,
  }) as Response;

const filterValue = (
  overrides: Partial<DivisionDiscoveryFilterValue> = {},
) => ({
  genders: [],
  skillDivisionTypeIds: [],
  ageDivisionTypeIds: [],
  priceMinDollars: null,
  priceMaxDollars: null,
  ...overrides,
});

function DiscoverFiltersHarness({
  onChange,
}: {
  onChange: (value: DivisionDiscoveryFilterValue) => void;
}) {
  const [selectedSports, setSelectedSports] = useState(["Soccer"]);
  const [divisionFilters, setDivisionFilters] = useState(
    filterValue({ skillDivisionTypeIds: ["open"] }),
  );
  const divisionOptions = useDivisionDiscoveryOptions(selectedSports);

  return (
    <DiscoverFilterBar
      location={null}
      selectedSports={selectedSports}
      setSelectedSports={setSelectedSports}
      sports={["Soccer"]}
      sportsLoading={false}
      sportsError={null}
      selectedEventTypes={["EVENT"]}
      setSelectedEventTypes={jest.fn()}
      eventTypeOptions={["EVENT"]}
      selectedTags={[]}
      setSelectedTags={jest.fn()}
      eventTags={[]}
      eventTagsLoading={false}
      eventTagsError={null}
      maxDistance={null}
      setMaxDistance={jest.fn()}
      defaultMaxDistance={50}
      selectedStartDate={null}
      setSelectedStartDate={jest.fn()}
      selectedEndDate={null}
      setSelectedEndDate={jest.fn()}
      divisionFilters={divisionFilters}
      setDivisionFilters={(next) => {
        setDivisionFilters(next);
        onChange(next);
      }}
      divisionOptions={divisionOptions}
      activeFilterCount={1}
      resetFilters={jest.fn()}
    />
  );
}

describe("DivisionDiscoveryFilters async lifecycle", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it("keeps the initial loading state until the active request resolves", async () => {
    const divisionTypes = createDeferred<Response>();
    const onChange = jest.fn();
    globalThis.fetch = jest.fn(() => divisionTypes.promise) as typeof fetch;

    render(
      <DivisionDiscoveryFilters value={filterValue()} onChange={onChange} />,
    );

    expect(
      screen.getByLabelText("Loading division filters"),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    divisionTypes.resolve(
      response({
        genders: [{ id: "F", name: "Women" }],
        ages: [{ id: "adult", name: "Adult" }],
        sportSkills: [],
      }),
    );

    expect(
      await screen.findByPlaceholderText("Any gender"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Loading division filters"),
    ).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders a failed request without reconciling selected skills", async () => {
    const onChange = jest.fn();
    globalThis.fetch = jest.fn(() =>
      Promise.resolve(response({}, false)),
    ) as typeof fetch;

    render(
      <DivisionDiscoveryFilters
        value={filterValue({ skillDivisionTypeIds: ["stale-skill"] })}
        onChange={onChange}
        selectedSports={["Soccer"]}
      />,
    );

    expect(
      await screen.findByText("Unable to load division filters."),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("recovers failed Discover division choices without clearing selected filters", async () => {
    const firstRequest = createDeferred<Response>();
    const retryRequest = createDeferred<Response>();
    const onChange = jest.fn();
    const user = userEvent.setup();
    globalThis.fetch = jest.fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(retryRequest.promise);

    render(<DiscoverFiltersHarness onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "More filters (1)" }));
    await user.click(screen.getByRole("button", { name: "Gender", exact: true }));

    const genderDialog = screen.getByRole("dialog", { name: "Gender filter" });
    firstRequest.resolve(response({}, false));

    const error = await within(genderDialog).findByRole("alert");
    expect(error).toHaveTextContent(/unable to load division filters/i);
    expect(
      within(genderDialog).queryByRole("button", { name: /Any gender/ }),
    ).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await user.click(
      within(error).getByRole("button", { name: "Retry division filters" }),
    );
    expect(
      within(genderDialog).getByLabelText("Loading division filters"),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    retryRequest.resolve(response({
      genders: [{ id: "F", name: "Women" }],
      ages: [{ id: "adult", name: "Adult" }],
      sportSkills: [{
        sportId: "Soccer",
        sportName: "Soccer",
        skills: [{ id: "open", name: "Open" }],
      }],
    }));

    await user.click(
      await within(genderDialog).findByRole("button", { name: "Women", exact: true }),
    );
    expect(within(genderDialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(
      filterValue({ genders: ["F"], skillDivisionTypeIds: ["open"] }),
    );
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("button", { name: "Gender: Women", exact: true }),
    ).toHaveFocus();
  });

  it("ignores an obsolete response after the component starts a new request", async () => {
    const firstRequest = createDeferred<Response>();
    const secondRequest = createDeferred<Response>();
    const signals: AbortSignal[] = [];
    const onChange = jest.fn();
    let requestIndex = 0;
    globalThis.fetch = jest.fn((_input, init) => {
      signals.push(init?.signal as AbortSignal);
      requestIndex += 1;
      return requestIndex === 1 ? firstRequest.promise : secondRequest.promise;
    }) as typeof fetch;

    const view = render(
      <DivisionDiscoveryFilters
        key="first-request"
        value={filterValue({ skillDivisionTypeIds: ["open"] })}
        onChange={onChange}
        selectedSports={["Soccer"]}
      />,
    );

    view.rerender(
      <DivisionDiscoveryFilters
        key="second-request"
        value={filterValue({ skillDivisionTypeIds: ["open"] })}
        onChange={onChange}
        selectedSports={["Soccer"]}
      />,
    );

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    expect(signals[0]?.aborted).toBe(true);
    expect(
      screen.getByLabelText("Loading division filters"),
    ).toBeInTheDocument();

    firstRequest.resolve(
      response({
        sportSkills: [
          {
            sportId: "soccer",
            sportName: "Soccer",
            skills: [{ id: "open", name: "Open" }],
          },
        ],
      }),
    );
    await Promise.resolve();
    expect(
      screen.getByLabelText("Loading division filters"),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    secondRequest.resolve(
      response({
        sportSkills: [
          {
            sportId: "soccer",
            sportName: "Soccer",
            skills: [{ id: "premier", name: "Premier" }],
          },
        ],
      }),
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ skillDivisionTypeIds: [] }),
      ),
    );
  });
});

describe("DivisionDiscoveryFilters sport eligibility", () => {
  const options: DivisionDiscoveryFilterOptions = {
    loading: false,
    error: null,
    genders: [{ id: "F", name: "Women" }],
    ages: [{ id: "adult", name: "Adult" }],
    skillOptions: [{ value: "open", label: "Open" }],
  };

  it.each([
    { state: "no sports", selectedSports: [] },
    { state: "multiple sports", selectedSports: ["Soccer", "Volleyball"] },
  ])(
    "hides skill choices and clears only skills after selecting $state",
    ({ selectedSports }) => {
      const onChange = jest.fn();
      const value = filterValue({
        genders: ["F"],
        ageDivisionTypeIds: ["adult"],
        skillDivisionTypeIds: ["open"],
        priceMinDollars: 10,
        priceMaxDollars: 50,
      });
      const view = render(
        <DivisionDiscoveryFilters
          value={value}
          onChange={onChange}
          selectedSports={["Soccer"]}
          options={options}
        />,
      );
      expect(
        screen.getByPlaceholderText("Any skill level"),
      ).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();

      view.rerender(
        <DivisionDiscoveryFilters
          value={value}
          onChange={onChange}
          selectedSports={selectedSports}
          options={options}
        />,
      );

      expect(
        screen.queryByPlaceholderText("Any skill level"),
      ).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText("Any gender")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Any age group")).toBeInTheDocument();
      expect(screen.getByLabelText("Minimum price")).toBeInTheDocument();
      expect(screen.getByLabelText("Maximum price")).toBeInTheDocument();
      expect(onChange).toHaveBeenCalledWith({
        ...value,
        skillDivisionTypeIds: [],
      });
    },
  );

  it("reconciles stale skills against normalized options for one normalized sport", () => {
    const onChange = jest.fn();
    const value = filterValue({
      skillDivisionTypeIds: [" OPEN ", "stale-skill"],
    });
    render(
      <DivisionDiscoveryFilters
        value={value}
        onChange={onChange}
        selectedSports={["", " SOCCER ", "soccer"]}
        options={options}
      />,
    );

    expect(screen.getByPlaceholderText("Any skill level")).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith({
      ...value,
      skillDivisionTypeIds: [" OPEN "],
    });
  });

  it("clears ineligible skills even when division options are still loading", () => {
    const onChange = jest.fn();
    const value = filterValue({ skillDivisionTypeIds: ["open"] });
    render(
      <DivisionDiscoveryFilters
        value={value}
        onChange={onChange}
        selectedSports={["Soccer", "Volleyball"]}
        options={{ ...options, loading: true }}
      />,
    );

    expect(onChange).toHaveBeenCalledWith({
      ...value,
      skillDivisionTypeIds: [],
    });
  });
});
