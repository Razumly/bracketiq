import { act, renderHook } from "@testing-library/react";

import { useEventFormSectionNavigation } from "../useEventFormSectionNavigation";

describe("useEventFormSectionNavigation", () => {
  it("preserves selected sections and falls back when selection disappears", () => {
    document.body.innerHTML = '<div id="section-advanced"></div>';
    window.scrollTo = jest.fn();
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
      result.current.scrollToSection("section-advanced");
    });
    expect(result.current.activeSectionId).toBe("section-advanced");

    rerender({
      visibleItems: [{ id: "section-advanced" }, { id: "section-payments" }],
    });
    expect(result.current.activeSectionId).toBe("section-advanced");

    rerender({
      visibleItems: [{ id: "section-payments" }],
    });
    expect(result.current.activeSectionId).toBe("section-payments");
  });
});
