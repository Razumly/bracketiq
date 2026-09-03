import { fireEvent, render, screen } from "@testing-library/react";

import type { Division, Organization } from "@/types";

import OrganizationDivisionsTabContent from "../OrganizationDivisionsTabContent";

jest.mock("../OrganizationDivisionsPanel", () => ({
  __esModule: true,
  default: ({
    organization,
    canManage,
    onChanged,
  }: {
    organization: Organization;
    canManage?: boolean;
    onChanged?: (divisions: Division[]) => void;
  }) => (
    <button type="button" onClick={() => onChanged?.([])}>
      {organization.name}:{String(canManage)}
    </button>
  ),
}));

describe("OrganizationDivisionsTabContent", () => {
  it("forwards management access and division updates to the divisions surface", () => {
    const onChanged = jest.fn();

    render(
      <OrganizationDivisionsTabContent
        organization={
          { $id: "org-1", name: "Test Organization" } as Organization
        }
        canManage
        onChanged={onChanged}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Test Organization:true" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Test Organization:true" }),
    );

    expect(onChanged).toHaveBeenCalledWith([]);
  });
});
