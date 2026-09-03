import { fireEvent, render, screen } from "@testing-library/react";

import type { Organization } from "@/types";

import OrganizationPublicSettingsTabContent from "../OrganizationPublicSettingsTabContent";

jest.mock("../OrganizationPublicSettingsPanel", () => ({
  __esModule: true,
  default: ({
    organization,
    onUpdated,
  }: {
    organization: Organization;
    onUpdated: (next: Organization) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onUpdated({ ...organization, name: "Updated Organization" })
      }
    >
      Save public settings for {organization.name}
    </button>
  ),
}));

describe("OrganizationPublicSettingsTabContent", () => {
  it("forwards the organization and update callback to the public settings surface", () => {
    const organization = {
      $id: "org-1",
      name: "Test Organization",
    } as Organization;
    const onUpdated = jest.fn();

    render(
      <OrganizationPublicSettingsTabContent
        organization={organization}
        onUpdated={onUpdated}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Save public settings for Test Organization",
      }),
    );

    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        $id: "org-1",
        name: "Updated Organization",
      }),
    );
  });
});
