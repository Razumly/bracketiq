import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithMantine } from "../../../../../../../../../test/utils/renderWithMantine";
import { FacilityResourceSelector } from "../FacilityResourceSelector";

const makeField = (
  id: string,
  facilityId: string,
  organization: string,
  facilityName: string,
) => ({
  $id: id,
  name: id,
  organization,
  facilityId,
  facility: {
    $id: facilityId,
    name: facilityName,
    location: `${facilityName} location`,
  },
});

describe("FacilityResourceSelector", () => {
  it("derives defaults during render while preserving explicit expansion choices", async () => {
    const user = userEvent.setup();
    const homeFields = [
      makeField("home-field", "home", "org_1", "Home Facility"),
    ];
    const { rerender } = render(
      <MantineProvider>
        <FacilityResourceSelector
          label="Resources"
          description="Choose resources"
          placeholder="No resources"
          resourceSingular="Court"
          fields={homeFields as never}
          value={[]}
          onChange={jest.fn()}
          eventOrganizationId="org_1"
        />
      </MantineProvider>,
    );

    expect(
      screen.getByRole("checkbox", { name: "home-field" }),
    ).toBeInTheDocument();

    rerender(
      <MantineProvider>
        <FacilityResourceSelector
          label="Resources"
          description="Choose resources"
          placeholder="No resources"
          resourceSingular="Court"
          fields={
            [
              ...homeFields,
              makeField(
                "rental-field",
                "rental",
                "rental_org",
                "Rented Facility",
              ),
            ] as never
          }
          value={[]}
          onChange={jest.fn()}
          eventOrganizationId="org_1"
        />
      </MantineProvider>,
    );

    expect(
      screen.getByRole("button", { name: /Home Facility/i }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: /Rented Facility/i }),
    ).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: /Home Facility/i }));
    rerender(
      <MantineProvider>
        <FacilityResourceSelector
          label="Resources"
          description="Choose resources"
          placeholder="No resources"
          resourceSingular="Court"
          fields={
            [
              ...homeFields,
              makeField(
                "rental-field",
                "rental",
                "rental_org",
                "Rented Facility",
              ),
              makeField("second-home-field", "home", "org_1", "Home Facility"),
            ] as never
          }
          value={[]}
          onChange={jest.fn()}
          eventOrganizationId="org_1"
        />
      </MantineProvider>,
    );
    expect(
      screen.getByRole("button", { name: /Home Facility/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("renders flat resources for a single facility group", () => {
    renderWithMantine(
      <FacilityResourceSelector
        label="Resources"
        description="Choose resources"
        placeholder="No resources"
        resourceSingular="Court"
        fields={
          [makeField("home-field", "home", "org_1", "Home Facility")] as never
        }
        value={[]}
        onChange={jest.fn()}
        eventOrganizationId="org_1"
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Home Facility/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "home-field" }),
    ).toBeInTheDocument();
  });
});
