import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DiscountManager from "../DiscountManager";
import { discountService, type Discount } from "@/lib/discountService";
import { apiRequest } from "@/lib/apiClient";
import { notifications } from "@/lib/organizationNotifications";

jest.mock("@/lib/apiClient", () => ({ apiRequest: jest.fn() }));
jest.mock("@/lib/discountService", () => ({
  discountService: {
    listDiscounts: jest.fn(),
    createDiscount: jest.fn(),
    generateCode: jest.fn(),
    updateCode: jest.fn(),
    deleteCode: jest.fn(),
  },
}));
jest.mock("@/lib/organizationNotifications", () => ({
  notifications: { show: jest.fn() },
}));

const service = jest.mocked(discountService);
const discount: Discount = {
  id: "discount-1",
  ownerType: "ORGANIZATION",
  ownerId: "org-1",
  createdBy: "manager",
  name: "Early bird",
  status: "ACTIVE",
  targetType: "EVENT",
  targetId: "event-1",
  targetName: "Summer League",
  originalPriceCentsSnapshot: 10000,
  discountedPriceCents: 8000,
  codes: [],
};

async function openDraft() {
  const user = userEvent.setup();
  render(<DiscountManager ownerType="ORGANIZATION" ownerId="org-1" />);
  await user.click(screen.getByRole("button", { name: "Add discount" }));
  await user.type(
    screen.getByRole("textbox", { name: "Discount name" }),
    "Early bird",
  );
  await user.click(screen.getByRole("combobox", { name: "Item" }));
  await user.click(
    await screen.findByRole("option", { name: /Summer League/ }),
  );
  return user;
}

beforeEach(() => {
  jest.resetAllMocks();
  service.listDiscounts.mockResolvedValue([discount]);
  service.createDiscount.mockResolvedValue(discount);
  jest.mocked(apiRequest).mockResolvedValue({
    targets: [
      {
        id: "event-1",
        label: "Summer League",
        priceCents: 10000,
        itemType: "EVENT",
        targetType: "EVENT",
      },
    ],
  });
});

it("keeps a search entered during loading and filters the loaded list locally", async () => {
  let finish!: (rows: Discount[]) => void;
  service.listDiscounts.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const user = userEvent.setup();
  render(<DiscountManager ownerType="ORGANIZATION" ownerId="org-1" />);
  await user.type(
    screen.getByRole("textbox", { name: "Search discounts" }),
    "Missing",
  );
  expect(screen.getByText("Loading discounts")).toBeInTheDocument();
  await act(async () => {
    finish([discount]);
  });
  expect(
    screen.getByText("No discounts match this search."),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Clear all" }));
  expect(screen.getByText("Early bird")).toBeInTheDocument();
  expect(service.listDiscounts).toHaveBeenCalledTimes(1);
});

it("keeps percent, flat amount, and final price synchronized before saving", async () => {
  const user = await openDraft();
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Discount percent" }),
    { target: { value: "25" } },
  );
  expect(screen.getByRole("textbox", { name: "New price" })).toHaveValue(
    "75.00",
  );
  await user.click(screen.getByRole("button", { name: "Flat amount" }));
  expect(screen.getByRole("textbox", { name: "Discount amount" })).toHaveValue(
    "25.00",
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Discount amount" }), {
    target: { value: "30.00" },
  });
  expect(screen.getByRole("textbox", { name: "New price" })).toHaveValue(
    "70.00",
  );
  fireEvent.change(screen.getByRole("textbox", { name: "New price" }), {
    target: { value: "65.00" },
  });
  await user.click(screen.getByRole("button", { name: "Percent" }));
  expect(
    screen.getByRole("spinbutton", { name: "Discount percent" }),
  ).toHaveValue(35);
  await user.click(screen.getByRole("button", { name: "Create discount" }));
  expect(service.createDiscount).toHaveBeenCalledWith({
    ownerType: "ORGANIZATION",
    ownerId: "org-1",
    name: "Early bird",
    description: undefined,
    targetType: "EVENT",
    targetId: "event-1",
    discountedPriceCents: 6500,
  });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});

it("keeps the draft after a failed save and retries the same price", async () => {
  service.createDiscount.mockRejectedValueOnce(new Error("Save unavailable"));
  const user = await openDraft();
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Discount percent" }),
    { target: { value: "20" } },
  );
  await user.click(screen.getByRole("button", { name: "Create discount" }));
  expect(notifications.show).toHaveBeenCalledWith({
    color: "red",
    message: "Save unavailable",
  });
  expect(screen.getByRole("textbox", { name: "Discount name" })).toHaveValue(
    "Early bird",
  );
  expect(screen.getByRole("textbox", { name: "New price" })).toHaveValue(
    "80.00",
  );
  await user.click(screen.getByRole("button", { name: "Create discount" }));
  expect(service.createDiscount).toHaveBeenLastCalledWith(
    expect.objectContaining({ discountedPriceCents: 8000 }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});

it("generates a code with a usage limit and refreshes its status after deactivation", async () => {
  const code = {
    id: "code-1",
    discountId: discount.id,
    code: "EARLY",
    status: "ACTIVE" as const,
    usageLimit: 12,
    usedCount: 0,
    createdBy: "manager",
  };
  service.generateCode.mockResolvedValue(code);
  const user = userEvent.setup();
  render(<DiscountManager ownerType="ORGANIZATION" ownerId="org-1" />);
  await user.type(
    await screen.findByRole("textbox", { name: "Code" }),
    "EARLY",
  );
  fireEvent.change(screen.getByRole("spinbutton", { name: "Usage limit" }), {
    target: { value: "12" },
  });
  service.listDiscounts.mockResolvedValue([{ ...discount, codes: [code] }]);
  await user.click(screen.getByRole("button", { name: "Generate code" }));
  expect(service.generateCode).toHaveBeenCalledWith(discount.id, {
    code: "EARLY",
    usageLimit: 12,
  });
  const deactivate = await screen.findByRole("button", { name: "Deactivate" });
  expect(screen.getByRole("textbox", { name: "Code" })).toHaveValue("");
  expect(
    screen.queryByRole("button", { name: "Delete" }),
  ).not.toBeInTheDocument();
  service.listDiscounts.mockResolvedValue([
    { ...discount, codes: [{ ...code, status: "INACTIVE" }] },
  ]);
  await user.click(deactivate);
  expect(service.updateCode).toHaveBeenCalledWith(discount.id, code.id, {
    status: "INACTIVE",
  });
  expect(
    await screen.findByRole("button", { name: "Activate" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
});
