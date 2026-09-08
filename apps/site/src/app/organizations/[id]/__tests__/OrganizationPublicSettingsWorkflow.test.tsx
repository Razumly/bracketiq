import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Organization } from "@/types";
import { organizationService } from "@/lib/organizationService";
import { notifications } from "@/lib/organizationNotifications";
import OrganizationPublicSettingsPanel from "../OrganizationPublicSettingsPanel";

jest.mock("@/lib/organizationService", () => ({
  organizationService: {
    checkPublicSlug: jest.fn(),
    updateOrganization: jest.fn(),
  },
}));
jest.mock("@/lib/eventService", () => ({
  eventService: { getEventsPaginated: jest.fn() },
}));
jest.mock("@/lib/organizationNotifications", () => ({
  notifications: { show: jest.fn() },
}));
const service = jest.mocked(organizationService);
const organization = {
  $id: "org-1",
  name: "River City",
  publicSlug: "river-city",
  publicPageEnabled: true,
  publicWidgetsEnabled: true,
} as Organization;

beforeEach(() => {
  jest.resetAllMocks();
  service.checkPublicSlug.mockImplementation(async (slug) => ({
    slug,
    valid: true,
    current: slug === "river-city",
    available: true,
  }));
  service.updateOrganization.mockResolvedValue(organization);
});

it("blocks previews and saving until the current slug check completes", async () => {
  let finish!: (
    value: Awaited<ReturnType<typeof organizationService.checkPublicSlug>>,
  ) => void;
  service.checkPublicSlug.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(
    <OrganizationPublicSettingsPanel
      organization={organization}
      onUpdated={jest.fn()}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Copy iframe snippet" }),
  ).toBeDisabled();
  await waitFor(() => expect(service.checkPublicSlug).toHaveBeenCalled());
  await act(async () => {
    finish({ slug: "river-city", valid: true, available: true, current: true });
  });
  expect(
    screen.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Copy iframe snippet" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "View public page" }),
  ).toHaveAttribute("href", expect.stringContaining("/o/river-city"));
});

it("keeps snippets unavailable for an unsaved slug and saves the normalized draft", async () => {
  const onUpdated = jest.fn();
  const user = userEvent.setup();
  render(
    <OrganizationPublicSettingsPanel
      organization={organization}
      onUpdated={onUpdated}
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled(),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Public slug" }), {
    target: { value: "New Season" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "Allowed embed domains" }),
    { target: { value: " one.test, , two.test " } },
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Completion redirect URL" }),
    { target: { value: " https://one.test/done " } },
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled(),
  );
  expect(screen.getByRole("textbox", { name: "Iframe snippet" })).toHaveValue(
    "",
  );
  expect(
    screen.getByRole("button", { name: "Copy script snippet" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Save", exact: true }));
  expect(service.updateOrganization).toHaveBeenCalledWith("org-1", {
    publicSlug: "new-season",
    publicPageEnabled: true,
    publicWidgetsEnabled: true,
    brandPrimaryColor: "#0f766e",
    brandAccentColor: "#f59e0b",
    publicHeadline: "River City on BracketIQ",
    publicIntroText: "Find upcoming events, teams, rentals, and products.",
    embedAllowedDomains: ["one.test", "two.test"],
    publicCompletionRedirectUrl: "https://one.test/done",
  });
  expect(onUpdated).toHaveBeenCalledWith(organization);
});

it("rejects a taken slug without sending a save", async () => {
  service.checkPublicSlug.mockResolvedValue({
    slug: "river-city",
    valid: true,
    available: false,
    current: false,
    error: "Already used",
  });
  render(
    <OrganizationPublicSettingsPanel
      organization={organization}
      onUpdated={jest.fn()}
    />,
  );
  await screen.findAllByText("Already used");
  expect(
    screen.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Copy iframe snippet" }),
  ).toBeDisabled();
  expect(service.updateOrganization).not.toHaveBeenCalled();
});

it("retains the edited page after a failed save and retries the same draft", async () => {
  service.updateOrganization.mockRejectedValueOnce(
    new Error("Save unavailable"),
  );
  const user = userEvent.setup();
  render(
    <OrganizationPublicSettingsPanel
      organization={organization}
      onUpdated={jest.fn()}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Public headline" }), {
    target: { value: "New season" },
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Save", exact: true }));
  expect(notifications.show).toHaveBeenCalledWith({
    color: "red",
    message: "Save unavailable",
  });
  expect(screen.getByRole("textbox", { name: "Public headline" })).toHaveValue(
    "New season",
  );
  await user.click(screen.getByRole("button", { name: "Save", exact: true }));
  expect(service.updateOrganization).toHaveBeenLastCalledWith(
    "org-1",
    expect.objectContaining({ publicHeadline: "New season" }),
  );
});

it("updates both snippet formats when the user changes widget filters", async () => {
  const user = userEvent.setup();
  render(
    <OrganizationPublicSettingsPanel
      organization={organization}
      onUpdated={jest.fn()}
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Copy script snippet" }),
    ).toBeEnabled(),
  );
  await user.click(
    screen.getByRole("checkbox", { name: "Hide weekly events" }),
  );
  const iframeInput = screen.getByRole<HTMLTextAreaElement>("textbox", {
    name: "Iframe snippet",
  });
  const scriptInput = screen.getByRole<HTMLTextAreaElement>("textbox", {
    name: "Script snippet",
  });
  expect(iframeInput.value).toContain("includeChildWeeklyEvents=0");
  expect(scriptInput.value).toContain('data-include-child-weekly-events="0"');
  await user.click(screen.getByRole("combobox", { name: "Widget type" }));
  await user.click(
    screen.getByRole("option", { name: "Products", exact: true }),
  );
  await user.click(screen.getByRole("combobox", { name: "Show", exact: true }));
  await user.click(
    screen.getByRole("option", { name: "Subscription", exact: true }),
  );
  expect(iframeInput.value).toContain("productPurchaseMode=subscription");
  expect(scriptInput.value).toContain(
    'data-product-purchase-mode="subscription"',
  );
  expect(scriptInput.value).not.toContain("data-include-child-weekly-events");
});
