import { act, renderHook } from "@testing-library/react";

import { useEventFormSectionNavigation } from "../useEventFormSectionNavigation";

describe("useEventFormSectionNavigation", () => {
  it("keeps a visible selection and immediately falls back when it disappears", () => {
    const { result, rerender } = renderHook(
      ({ visibleItems }) =>
        useEventFormSectionNavigation({
          open: false,
          visibleItems,
          collapseDefaults: {},
          defaultSectionId: "section-basic-information",
          scrollOffset: 0,
        }),
      {
        initialProps: {
          visibleItems: [
            { id: "section-basic-information" },
            { id: "section-advanced" },
          ],
        },
      },
    );

    act(() => {
      result.current.scrollToSection = result.current.scrollToSection;
    });
    expect(result.current.activeSectionId).toBe("section-basic-information");

    rerender({
      visibleItems: [
        { id: "section-basic-information" },
        { id: "section-advanced" },
        { id: "section-payments" },
      ],
    });
    expect(result.current.activeSectionId).toBe("section-basic-information");
    rerender({
      visibleItems: [{ id: "section-advanced" }, { id: "section-payments" }],
    });
    expect(result.current.activeSectionId).toBe("section-advanced");
  });
});
