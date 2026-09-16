import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PublicRentalSelectionClient from "../PublicRentalSelectionClient";
import { buildEvent, buildUser } from "../../../../../../test/factories";
import type { Field, Organization } from "@/types";

const getFieldEventsMatchesMock = jest.fn();
const getOrganizationsByOwnerMock = jest.fn();
const pushMock = jest.fn();
const currentUser = buildUser();

jest.mock("@/app/providers", () => ({ useApp: () => ({ user: currentUser, loading: false }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
jest.mock("@/lib/fieldService", () => ({ fieldService: { getFieldEventsMatches: (...args: unknown[]) => getFieldEventsMatchesMock(...args) } }));
jest.mock("@/lib/organizationService", () => ({ organizationService: { getOrganizationsByOwner: (...args: unknown[]) => getOrganizationsByOwnerMock(...args) } }));
jest.mock("@/components/ui/PaymentModal", () => () => null);
jest.mock("@/components/ui/BillingAddressModal", () => () => null);
jest.mock("@/lib/organizationNotifications", () => ({ notifications: { show: jest.fn() } }));

const field: Field = {
  $id: "court_1", name: "Court 1", location: "Austin, TX", lat: 30.2, long: -97.7,
  rentalSlots: [{ $id: "slot_1", startDate: "2030-06-22T09:00", endDate: "2030-06-22T12:00", startTimeMinutes: 540, endTimeMinutes: 720, repeating: false, scheduledFieldIds: ["court_1"], price: 4800 }],
};
const organization: Organization = { $id: "org_1", name: "Austin Sports Center", location: "Austin, TX", fields: [field] };

function setup() {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<PublicRentalSelectionClient slug="austin" organization={organization} />);
  return user;
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
  jest.setSystemTime(new Date("2030-06-20T12:00"));
  getOrganizationsByOwnerMock.mockResolvedValue([]);
  getFieldEventsMatchesMock.mockImplementation(async (source: Field) => ({ ...source, events: [], matches: [] }));
});
afterEach(() => { jest.useRealTimers(); });

it("carries the selected time, duration, and calculated total into reservation checkout", async () => {
  const user = setup();
  await user.click(await screen.findByRole("button", { name: /09:30 AM – 10:30 AM Court 1/ }));
  const duration = screen.getByRole("textbox", { name: "Duration in minutes" });
  await user.clear(duration);
  await user.type(duration, "90");
  await user.click(await screen.findByRole("button", { name: /10:00 AM – 11:30 AM Court 1/ }));
  const summary = screen.getByRole("complementary", { name: "Selected rental times" });
  expect(within(summary).getByText("10:00 AM – 11:30 AM")).toBeInTheDocument();
  expect(within(summary).getByText("90 minutes")).toBeInTheDocument();
  expect(summary).toHaveTextContent("$72.00");
  await waitFor(() => expect(screen.getByRole("button", { name: "Continue to reservation" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Continue to reservation" }));
  const review = within(screen.getByRole("dialog", { name: "Review your reservation" }));
  expect(review.getByText("06/22/2030")).toBeInTheDocument();
  expect(review.getByText("10:00 AM – 11:30 AM")).toBeInTheDocument();
  expect(review.getByText("$72.00")).toBeInTheDocument();
  expect(review.getByRole("button", { name: "Continue to Stripe" })).toBeEnabled();
  await user.click(review.getByRole("button", { name: "Change selection" }));
  expect(within(summary).getByText("10:00 AM – 11:30 AM")).toBeInTheDocument();
});

it("keeps booked times unavailable and retains the selected slot during a failed date refresh", async () => {
  const booking = buildEvent({ start: "2030-06-22T09:00", end: "2030-06-22T10:00", eventType: "EVENT" });
  getFieldEventsMatchesMock.mockImplementation(async (source: Field, range: { start: string }) => {
    if (new Date(range.start).getDate() === 23) throw new Error("Connection lost");
    return { ...source, events: [booking], matches: [] };
  });
  const user = setup();
  expect(await screen.findByRole("button", { name: /09:00 AM – 10:00 AM Court 1.*Unavailable/ })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: /10:00 AM – 11:00 AM Court 1/ }));
  const dates = within(screen.getByRole("group", { name: "Rental dates" }));
  await user.click(dates.getByRole("button", { name: "Sun, Jun 23" }));
  expect(dates.getByRole("button", { name: "Sun, Jun 23", pressed: true })).toBeVisible();
  expect(dates.getByRole("button", { name: "Sat, Jun 22", pressed: false })).toBeVisible();
  await screen.findByText(/Unable to check availability for this date/);
  const summary = screen.getByRole("complementary", { name: "Selected rental times" });
  expect(within(summary).getByText("06/22/2030")).toBeInTheDocument();
  expect(within(summary).getByText("10:00 AM – 11:00 AM")).toBeInTheDocument();
  expect(summary).toHaveTextContent("$48.00");
  getFieldEventsMatchesMock.mockImplementation(async (source: Field) => ({ ...source, events: [], matches: [] }));
  await user.click(screen.getByRole("button", { name: "Retry availability" }));
  await waitFor(() => expect(screen.queryByText(/Unable to check availability for this date/)).not.toBeInTheDocument());
  expect(within(summary).getByText("10:00 AM – 11:00 AM")).toBeInTheDocument();
  await user.click(dates.getByRole("button", { name: "Sat, Jun 22" }));
  expect(dates.getByRole("button", { name: "Sat, Jun 22", pressed: true })).toBeVisible();
  expect(dates.getByRole("button", { name: "Sun, Jun 23", pressed: false })).toBeVisible();
  expect(await screen.findByRole("button", { name: /10:00 AM – 11:00 AM Court 1.*Selected/ })).toBeEnabled();
});

it("blocks checkout during conflict checks and rechecks the same selected time after a conflict", async () => {
  const { promise, resolve } = Promise.withResolvers<Field>();
  let holdSelection = false;
  getFieldEventsMatchesMock.mockImplementation(async (source: Field, range: { start: string; end: string }) => {
    const duration = new Date(range.end).getTime() - new Date(range.start).getTime();
    if (holdSelection && duration === 60 * 60_000) return promise;
    return { ...source, events: [], matches: [] };
  });
  const user = setup();
  await screen.findByRole("button", { name: /10:00 AM – 11:00 AM Court 1/ });
  holdSelection = true;
  await user.click(screen.getByRole("button", { name: /10:00 AM – 11:00 AM Court 1/ }));
  expect(screen.getByRole("button", { name: "Continue to reservation" })).toBeDisabled();
  await act(async () => { resolve({ ...field, events: [buildEvent({ start: "2030-06-22T10:00", end: "2030-06-22T11:00", eventType: "EVENT" })] }); });
  await screen.findByText(/Selection overlaps an existing event/);
  expect(screen.getByRole("button", { name: "Continue to reservation" })).toBeDisabled();
  const summary = screen.getByRole("complementary", { name: "Selected rental times" });
  expect(within(summary).getByText("10:00 AM – 11:00 AM")).toBeInTheDocument();
  holdSelection = false;
  await user.click(screen.getByRole("button", { name: "Recheck selected times" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Continue to reservation" })).toBeEnabled());
  expect(within(summary).getByText("10:00 AM – 11:00 AM")).toBeInTheDocument();
});
