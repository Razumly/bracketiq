import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DiscoverResultsShell from "../DiscoverResultsShell";

function ResultsHarness({
  resultCount = 2,
  mobileToggle = false,
}: {
  resultCount?: number;
  mobileToggle?: boolean;
}) {
  const [showMobileMap, setShowMobileMap] = useState(false);

  return (
    <DiscoverResultsShell
      toolbar={<output aria-label="Result count">{resultCount}</output>}
      results={
        <label>
          Result note
          <input defaultValue="" />
        </label>
      }
      map={
        <label>
          Map note
          <input defaultValue="" />
        </label>
      }
      showMobileMap={showMobileMap}
      onToggleMobileMap={
        mobileToggle
          ? () => setShowMobileMap((current) => !current)
          : undefined
      }
    />
  );
}

it("preserves interactive result and map regions when the toolbar changes", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<ResultsHarness />);
  const results = within(
    screen.getByRole("region", { name: "Discover results" }),
  );
  const map = within(screen.getByRole("region", { name: "Discover map" }));

  await user.type(results.getByRole("textbox"), "Compare this event");
  await user.type(map.getByRole("textbox"), "Near the sports center");
  rerender(<ResultsHarness resultCount={1} />);

  expect(screen.getByRole("status", { name: "Result count" })).toHaveTextContent(
    "1",
  );
  expect(results.getByRole("textbox")).toHaveValue("Compare this event");
  expect(map.getByRole("textbox")).toHaveValue("Near the sports center");
  expect(map.getByRole("textbox")).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Show map" })).not.toBeInTheDocument();
});

it("toggles the controlled mobile map without resetting either region", async () => {
  const user = userEvent.setup();
  render(<ResultsHarness mobileToggle />);
  const results = within(
    screen.getByRole("region", { name: "Discover results" }),
  );
  const showMap = screen.getByRole("button", { name: "Show map" });

  await user.type(results.getByRole("textbox"), "Keep this event");
  expect(showMap).toHaveAttribute("aria-expanded", "false");
  await user.click(showMap);

  const mapRegion = screen.getByRole("region", { name: "Discover map" });
  const map = within(mapRegion);
  const showResults = screen.getByRole("button", { name: "Show results" });
  expect(showResults).toHaveAttribute("aria-expanded", "true");
  expect(showResults).toHaveAttribute("aria-controls", mapRegion.id);
  await user.type(map.getByRole("textbox"), "Keep this map view");
  await user.click(showResults);

  expect(screen.getByRole("button", { name: "Show map" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(results.getByRole("textbox")).toHaveValue("Keep this event");
  await user.click(screen.getByRole("button", { name: "Show map" }));
  expect(map.getByRole("textbox")).toHaveValue("Keep this map view");
});
