import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DiscoverResultsShell from "../DiscoverResultsShell";

function ResultsHarness({ resultCount = 2 }: { resultCount?: number }) {
  return (
    <DiscoverResultsShell
      search={<output aria-label="Search section">Search</output>}
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

it("keeps map and list keyboard-accessible together without a view toggle", async () => {
  const user = userEvent.setup();
  render(<ResultsHarness />);
  const map = screen.getByRole("region", { name: "Discover map" });
  const results = screen.getByRole("region", { name: "Discover results" });

  expect(map).toBeVisible();
  expect(results).toBeVisible();
  expect(screen.queryByRole("button", { name: "Show map" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Show results" })).not.toBeInTheDocument();

  await user.tab();
  expect(within(map).getByRole("textbox")).toHaveFocus();
  await user.keyboard("Compare this area");
  await user.tab();
  expect(within(results).getByRole("textbox")).toHaveFocus();
  await user.keyboard("Compare this event");

  expect(within(map).getByRole("textbox")).toHaveValue("Compare this area");
  expect(within(results).getByRole("textbox")).toHaveValue("Compare this event");
});
