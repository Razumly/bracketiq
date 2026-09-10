import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { render } from "@testing-library/react";

import { SHARED_ICON_KEYS, SharedIcon } from "../SharedIcon";

const SHARED_ICON_DIRECTORY = path.resolve(process.cwd(), "../../shared/icons");
const GENERATED_ICON_DIRECTORY = path.resolve(process.cwd(), "public/icons");
const PRODUCT_ICON_KEYS = ["trophy", "tournament-bracket", "groups"] as const;

describe("shared product icons", () => {
  it("keeps canonical and site product assets identical", () => {
    expect(SHARED_ICON_KEYS).toHaveLength(27);

    PRODUCT_ICON_KEYS.forEach((iconKey) => {
      const relativePath = path.join("product", `${iconKey}.svg`);
      const sharedPath = path.join(SHARED_ICON_DIRECTORY, relativePath);
      const generatedPath = path.join(GENERATED_ICON_DIRECTORY, relativePath);

      expect(existsSync(sharedPath)).toBe(true);
      expect(existsSync(generatedPath)).toBe(true);
      expect(readFileSync(generatedPath, "utf8")).toBe(
        readFileSync(sharedPath, "utf8"),
      );
    });
  });

  it.each(PRODUCT_ICON_KEYS)(
    "renders the %s asset with its semantic href",
    (iconKey) => {
      const label = iconKey.replaceAll("-", " ");
      const { container } = render(
        <SharedIcon name={iconKey} label={label} size={24} />,
      );
      const icon = container.querySelector("svg");
      const use = container.querySelector("use");

      expect(use).toHaveAttribute(
        "href",
        `/icons/product/${iconKey}.svg#shared-icon`,
      );
      expect(icon).toHaveAttribute("role", "img");
      expect(icon).toHaveAttribute("aria-label", label);
      expect(icon).toHaveAttribute("data-shared-icon", iconKey);
    },
  );

  it("hides decorative shared icons from assistive technology", () => {
    const { container } = render(<SharedIcon name="groups" />);
    const icon = container.querySelector("svg");

    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).not.toHaveAttribute("role");
  });
});
