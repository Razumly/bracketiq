import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import userEvent from "@testing-library/user-event";
import { MantineProvider, MultiSelect } from "@mantine/core";
import { render, screen } from "@testing-library/react";

import { DEFAULT_SPORTS } from "@/server/defaultSports";
import {
  getSportIconKey,
  renderSportOption,
  SPORT_ICON_KEYS,
  SportIcon,
} from "../SportIcon";

const SHARED_SPORT_ICON_DIRECTORY = path.resolve(
  process.cwd(),
  "../../shared/icons/sports",
);
const GENERATED_SPORT_ICON_DIRECTORY = path.resolve(
  process.cwd(),
  "public/icons/sports",
);

const sportIconAssetPath = (directory: string, fileName: string): string =>
  path.join(directory, fileName);

describe("sport icon set", () => {
  it("provides a standalone asset for every seeded sport", () => {
    const sportNames = DEFAULT_SPORTS.map((sport) => String(sport.name));

    expect(sportNames).toHaveLength(24);
    expect(SPORT_ICON_KEYS).toHaveLength(24);
    SPORT_ICON_KEYS.forEach((iconKey) => {
      const fileName = `${iconKey}.svg`;
      const sharedPath = sportIconAssetPath(
        SHARED_SPORT_ICON_DIRECTORY,
        fileName,
      );
      const generatedPath = sportIconAssetPath(
        GENERATED_SPORT_ICON_DIRECTORY,
        fileName,
      );

      expect(existsSync(sharedPath)).toBe(true);
      expect(existsSync(generatedPath)).toBe(true);
      expect(readFileSync(generatedPath, "utf8")).toBe(
        readFileSync(sharedPath, "utf8"),
      );
    });
    expect(
      readFileSync(
        sportIconAssetPath(SHARED_SPORT_ICON_DIRECTORY, "LICENSE"),
        "utf8",
      ),
    ).toBe(
      readFileSync(
        sportIconAssetPath(GENERATED_SPORT_ICON_DIRECTORY, "LICENSE"),
        "utf8",
      ),
    );
    sportNames
      .filter((sportName) => sportName !== "Other")
      .forEach((sportName) => {
        expect(getSportIconKey(sportName)).not.toBe("other");
      });
    expect(getSportIconKey("Other")).toBe("other");
  });

  it("normalizes common legacy labels and keeps icon-only use accessible", () => {
    expect(getSportIconKey("  soccer  ")).toBe("indoor-soccer");
    expect(getSportIconKey("Volleyball")).toBe("indoor-volleyball");

    const { container } = render(
      <SportIcon sport="Ultimate Frisbee" label="Ultimate Frisbee" />,
    );
    const icon = container.querySelector("svg");
    const use = container.querySelector("use");

    expect(use).toHaveAttribute(
      "href",
      "/icons/sports/ultimate-frisbee.svg#sport-icon",
    );

    expect(icon).toHaveAttribute("role", "img");
    expect(icon).toHaveAttribute("aria-label", "Ultimate Frisbee");
    expect(icon).toHaveAttribute("data-sport-icon", "ultimate-frisbee");
  });

  it("keeps checkmarks visible for multiple selected sports", async () => {
    const user = userEvent.setup();

    render(
      <MantineProvider env="test">
        <MultiSelect
          label="Sports"
          data={["Basketball", "Tennis"]}
          hidePickedOptions={false}
          renderOption={renderSportOption}
        />
      </MantineProvider>,
    );

    await user.click(screen.getByRole("textbox", { name: "Sports" }));
    await user.click(screen.getByRole("option", { name: "Basketball" }));
    await user.click(screen.getByRole("option", { name: "Tennis" }));

    expect(screen.getByRole("option", { name: "Basketball" })).toHaveAttribute(
      "data-checked",
      "true",
    );
    expect(screen.getByRole("option", { name: "Tennis" })).toHaveAttribute(
      "data-checked",
      "true",
    );
    expect(
      document.querySelectorAll('[data-sport-option-check="true"]'),
    ).toHaveLength(2);
  });
});
