import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import { renderWithMantine } from "../../../../../test/utils/renderWithMantine";
import DivisionDiscoveryFilters, {
  DivisionDiscoveryFilterValue,
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

    renderWithMantine(
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

    renderWithMantine(
      <DivisionDiscoveryFilters
        value={filterValue({ skillDivisionTypeIds: ["stale-skill"] })}
        onChange={onChange}
      />,
    );

    expect(
      await screen.findByText("Unable to load division filters."),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
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
      <MantineProvider>
        <DivisionDiscoveryFilters
          key="first-request"
          value={filterValue({ skillDivisionTypeIds: ["open"] })}
          onChange={onChange}
        />
      </MantineProvider>,
    );

    view.rerender(
      <MantineProvider>
        <DivisionDiscoveryFilters
          key="second-request"
          value={filterValue({ skillDivisionTypeIds: ["open"] })}
          onChange={onChange}
        />
      </MantineProvider>,
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
