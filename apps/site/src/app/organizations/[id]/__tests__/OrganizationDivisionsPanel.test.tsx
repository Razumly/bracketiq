import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Division, Organization } from "@/types";
import { organizationService } from "@/lib/organizationService";
import OrganizationDivisionsPanel from "../OrganizationDivisionsPanel";

jest.mock("@/lib/organizationService", () => ({
  organizationService: {
    listOrganizationDivisions: jest.fn(),
    createOrganizationDivision: jest.fn(),
    updateOrganizationDivision: jest.fn(),
    archiveOrganizationDivision: jest.fn(),
  },
}));
jest.mock("@/lib/organizationNotifications", () => ({
  notifications: { show: jest.fn() },
}));
jest.mock("@/app/hooks/useSports", () => ({
  useSports: () => ({
    sports: [
      { $id: "sport-1", name: "Volleyball" },
      { $id: "sport-2", name: "Basketball" },
    ],
    loading: false,
    error: null,
  }),
}));

const service = jest.mocked(organizationService);
const originalFetch = global.fetch;
const organization = {
  $id: "org-1",
  name: "River City",
  divisions: [],
} as Organization;
const division: Division = {
  id: "division-1",
  name: "Adult league",
  sportId: "sport-1",
  gender: "C",
  ageDivisionTypeId: "age-1",
  skillDivisionTypeId: "skill-1",
  status: "ACTIVE",
  price: 12550,
  maxParticipants: 20,
  registrationUrl: "https://example.com/register",
};
const catalogs = {
  genders: [{ id: "C", name: "Coed" }],
  ages: [{ id: "age-1", name: "Adult" }],
  sportSkills: [
    { sportId: "sport-1", skills: [{ id: "skill-1", name: "Intermediate" }] },
    { sportId: "sport-2", skills: [{ id: "skill-2", name: "Recreational" }] },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.resetAllMocks();
  service.listOrganizationDivisions.mockResolvedValue([division]);
  service.createOrganizationDivision.mockResolvedValue(division);
  service.updateOrganizationDivision.mockResolvedValue(division);
  global.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => catalogs });
});
afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = originalFetch;
});

it("does not reload catalogs and uses the latest callback when its identity changes", async () => {
  const request = deferred<Division[]>();
  service.listOrganizationDivisions.mockReturnValueOnce(request.promise);
  const firstOnChanged = jest.fn();
  const latestOnChanged = jest.fn();
  const { rerender } = render(
    <OrganizationDivisionsPanel
      organization={organization}
      onChanged={firstOnChanged}
    />,
  );
  rerender(
    <OrganizationDivisionsPanel
      organization={organization}
      onChanged={latestOnChanged}
    />,
  );
  await act(async () => {
    request.resolve([division]);
  });
  await waitFor(() => expect(latestOnChanged).toHaveBeenCalledWith([division]));
  expect(firstOnChanged).not.toHaveBeenCalled();
  expect(service.listOrganizationDivisions).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it("keeps controls and table headings visible while data loads", async () => {
  const request = deferred<Division[]>();
  service.listOrganizationDivisions.mockReturnValueOnce(request.promise);
  render(<OrganizationDivisionsPanel organization={organization} canManage />);
  expect(screen.getByRole("button", { name: "Add division" })).toBeDisabled();
  expect(
    screen.getByRole("columnheader", { name: "Season price" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Loading divisions")).toBeInTheDocument();
  await act(async () => {
    request.resolve([division]);
  });
  expect(screen.getByRole("button", { name: "Add division" })).toBeEnabled();
  expect(screen.getByText("Volleyball")).toBeInTheDocument();
  expect(screen.getByText("$125.50")).toBeInTheDocument();
});

it("creates a division with sport-specific defaults and a price in cents", async () => {
  const user = userEvent.setup();
  const onChanged = jest.fn();
  render(
    <OrganizationDivisionsPanel
      organization={organization}
      canManage
      onChanged={onChanged}
    />,
  );
  await screen.findByText("Adult league");
  await user.click(screen.getByRole("button", { name: "Add division" }));
  await user.click(screen.getByRole("combobox", { name: "Sport" }));
  await user.click(screen.getByRole("option", { name: "Basketball" }));
  expect(
    screen.getByRole("combobox", { name: "Filter skill level" }),
  ).toHaveValue("Recreational");
  await user.type(
    screen.getByRole("textbox", { name: "Division name" }),
    "Summer group",
  );
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Division season price" }),
    { target: { value: "45.75" } },
  );
  fireEvent.change(screen.getByRole("spinbutton", { name: "Capacity" }), {
    target: { value: "12" },
  });
  await user.type(
    screen.getByRole("textbox", { name: "Description" }),
    "Weeknight play",
  );
  await user.click(screen.getByRole("button", { name: "Save", exact: true }));
  expect(service.createOrganizationDivision).toHaveBeenCalledWith("org-1", {
    name: "Summer group",
    sportId: "sport-2",
    gender: "C",
    skillDivisionTypeId: "skill-2",
    ageDivisionTypeId: "age-1",
    price: 4575,
    maxParticipants: 12,
    description: "Weeknight play",
    registrationUrl: "",
    status: "ACTIVE",
  });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(onChanged).toHaveBeenLastCalledWith([division]);
});

it("retains an edited draft after failure and retries the update", async () => {
  const user = userEvent.setup();
  service.updateOrganizationDivision.mockRejectedValueOnce(
    new Error("Save failed"),
  );
  render(<OrganizationDivisionsPanel organization={organization} canManage />);
  await user.click(
    await screen.findByRole("button", { name: "Edit Adult league" }),
  );
  expect(
    screen.getByRole("spinbutton", { name: "Division season price" }),
  ).toHaveValue(125.5);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Capacity" }), {
    target: { value: "" },
  });
  await user.type(
    screen.getByRole("textbox", { name: "Division name" }),
    " revised",
  );
  await user.click(screen.getByRole("button", { name: "Save", exact: true }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
  expect(screen.getByRole("textbox", { name: "Division name" })).toHaveValue(
    "Adult league revised",
  );
  await user.click(screen.getByRole("button", { name: "Save", exact: true }));
  expect(service.updateOrganizationDivision).toHaveBeenLastCalledWith(
    "org-1",
    division.id,
    expect.objectContaining({
      name: "Adult league revised",
      price: 12550,
      maxParticipants: null,
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});

it("blocks changes and dismissal while a save is pending", async () => {
  const request = deferred<Division>();
  service.updateOrganizationDivision.mockReturnValueOnce(request.promise);
  const user = userEvent.setup();
  render(<OrganizationDivisionsPanel organization={organization} canManage />);
  await user.click(
    await screen.findByRole("button", { name: "Edit Adult league" }),
  );
  await user.click(screen.getByRole("button", { name: "Save", exact: true }));
  expect(screen.getByRole("textbox", { name: "Division name" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(service.updateOrganizationDivision).toHaveBeenCalledTimes(1);
  await act(async () => {
    request.resolve(division);
  });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});

it("archives through the existing service and publishes the refreshed list", async () => {
  const user = userEvent.setup();
  const onChanged = jest.fn();
  render(
    <OrganizationDivisionsPanel
      organization={organization}
      canManage
      onChanged={onChanged}
    />,
  );
  const archive = await screen.findByRole("button", {
    name: "Archive Adult league",
  });
  service.listOrganizationDivisions.mockResolvedValueOnce([]);
  await user.click(archive);
  expect(service.archiveOrganizationDivision).toHaveBeenCalledWith(
    "org-1",
    "division-1",
  );
  expect(
    await screen.findByText("No club divisions have been added."),
  ).toBeInTheDocument();
  expect(onChanged).toHaveBeenLastCalledWith([]);
});

it("offers active registration links to visitors with keyboard support", async () => {
  service.listOrganizationDivisions.mockResolvedValueOnce([
    division,
    {
      ...division,
      id: "inactive",
      name: "Inactive league",
      status: "INACTIVE",
    },
  ]);
  const open = jest.spyOn(window, "open").mockImplementation(() => null);
  render(<OrganizationDivisionsPanel organization={organization} />);
  const link = await screen.findByRole("link", {
    name: "Register for Adult league",
  });
  fireEvent.keyDown(link, { key: "Enter" });
  fireEvent.keyDown(link, { key: " " });
  expect(open).toHaveBeenCalledTimes(2);
  expect(open).toHaveBeenCalledWith(
    division.registrationUrl,
    "_blank",
    "noopener,noreferrer",
  );
  expect(screen.queryByText("Inactive league")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Edit Adult/ }),
  ).not.toBeInTheDocument();
});

it("shows a missing label error without exposing the record ID or registration link", async () => {
  service.listOrganizationDivisions.mockResolvedValueOnce([
    { ...division, skillDivisionTypeId: "missing-skill" },
  ]);
  render(<OrganizationDivisionsPanel organization={organization} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The division skill name is unavailable.",
  );
  expect(screen.queryByText("missing-skill")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /Register for/ }),
  ).not.toBeInTheDocument();
});

it("expands and collapses the active division summary", async () => {
  service.listOrganizationDivisions.mockResolvedValueOnce([
    division,
    { ...division, id: "two", name: "Second league" },
    { ...division, id: "three", name: "Third league" },
  ]);
  const user = userEvent.setup();
  render(<OrganizationDivisionsPanel organization={organization} summary />);
  await user.click(await screen.findByRole("button", { name: "More (1)" }));
  expect(screen.getByText("Third league")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Show less" }));
  expect(screen.queryByText("Third league")).not.toBeInTheDocument();
});
