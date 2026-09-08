import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import OrganizationDiscountsTabContent from "../OrganizationDiscountsTabContent";
import { renderWithMantine } from "../../../../../test/utils/renderWithMantine";

jest.mock("@/lib/apiClient", () => ({
  __esModule: true,
  apiRequest: jest.fn(),
}));
jest.mock("@/lib/discountService", () => ({
  __esModule: true,
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

const { apiRequest } = jest.requireMock("@/lib/apiClient") as {
  apiRequest: jest.Mock;
};
const { discountService } = jest.requireMock("@/lib/discountService") as {
  discountService: { listDiscounts: jest.Mock; createDiscount: jest.Mock };
};

describe("OrganizationDiscountsTabContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    discountService.listDiscounts.mockResolvedValue([]);
    discountService.createDiscount.mockResolvedValue({
      id: "discount-1",
      ownerType: "ORGANIZATION",
      ownerId: "org-1",
      createdBy: "user-1",
      name: "Early bird",
      status: "ACTIVE",
      targetType: "EVENT",
      targetId: "event-1",
      originalPriceCentsSnapshot: 10000,
      discountedPriceCents: 8000,
    });
    apiRequest.mockResolvedValue({
      targets: [
        {
          id: "event-1",
          label: "Summer League",
          description: "Paid event",
          priceCents: 10000,
          itemType: "EVENT",
          targetType: "EVENT",
        },
      ],
    });
  });

  it("creates an organization discount through the organization tab", async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <OrganizationDiscountsTabContent
        ownerType="ORGANIZATION"
        ownerId="org-1"
        title="Test Organization discounts"
      />,
    );

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/api/discounts/targets?ownerType=ORGANIZATION&ownerId=org-1&itemType=EVENT",
      ),
    );

    await user.click(screen.getByRole("button", { name: "Add discount" }));
    await user.type(
      screen.getByRole("textbox", { name: "Discount name" }),
      "Early bird",
    );
    await user.click(screen.getByRole("combobox", { name: "Item" }));
    await user.click(screen.getByRole("option", { name: /Summer League/ }));
    await user.click(screen.getByRole("button", { name: "Create discount" }));

    await waitFor(() =>
      expect(discountService.createDiscount).toHaveBeenCalledWith({
        ownerType: "ORGANIZATION",
        ownerId: "org-1",
        name: "Early bird",
        description: undefined,
        targetType: "EVENT",
        targetId: "event-1",
        discountedPriceCents: 10000,
      }),
    );
  });
});
