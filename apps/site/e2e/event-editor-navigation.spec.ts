import { expect, test, type Page } from "@playwright/test";
import {
  AUTH_STORAGE,
  acceptTermsIfNeeded,
  seedLocationStorage,
} from "./utils/event";
import { SEED_ORG } from "./fixtures/seed-data";
import { E2E_EVENT_IDS } from "./fixtures/test-ids";

const openAdvancedEditor = async (page: Page) => {
  await seedLocationStorage(page);
  await page.goto(
    `/events/${E2E_EVENT_IDS.createFlow}/schedule?create=1&orgId=${SEED_ORG.id}&skipTemplatePrompt=1`,
    { waitUntil: "domcontentloaded" },
  );

  await expect(page.getByText("Event setup", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await acceptTermsIfNeeded(page);

  const eventNameInput = page.getByPlaceholder("Enter event name");
  if (!(await eventNameInput.isVisible().catch(() => false))) {
    await page.getByText("Advanced Setup", { exact: true }).click();
  }

  await expect(eventNameInput).toBeVisible({
    timeout: 30000,
  });
};

const waitForSectionAtScrollOffset = async (page: Page, sectionId: string) => {
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const section = document.getElementById(id);
          return section
            ? Math.abs(section.getBoundingClientRect().top - 80)
            : 9999;
        }, sectionId),
      { timeout: 10000 },
    )
    .toBeLessThan(36);
};

test.describe("event editor section navigation", () => {
  test.use({ storageState: AUTH_STORAGE.host });

  test("keeps the desktop section card sticky, clickable, and active while scrolling", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAdvancedEditor(page);

    const sectionNavigation = page
      .locator("aside")
      .filter({ hasText: "Sections" });
    const navigationStyle = await sectionNavigation.evaluate((element) => {
      const style = getComputedStyle(element);
      return { position: style.position, top: style.top };
    });
    expect(navigationStyle).toEqual({ position: "sticky", top: "80px" });

    await sectionNavigation
      .getByRole("button", { name: "Event Details" })
      .click();
    await waitForSectionAtScrollOffset(page, "section-event-details");
    await expect
      .poll(() =>
        sectionNavigation
          .getByRole("button", { name: "Event Details" })
          .getAttribute("class"),
      )
      .toMatch(/bg-slate-900/);

    await page.locator("#section-division-settings").evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" });
    });
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);

    const stickyBox = await sectionNavigation.boundingBox();
    expect(stickyBox?.y).toBeGreaterThanOrEqual(75);
    expect(stickyBox?.y).toBeLessThan(100);
    await expect(
      sectionNavigation.getByRole("button", { name: "Divisions" }),
    ).toBeVisible();

    await expect
      .poll(() =>
        sectionNavigation
          .getByRole("button", { name: "Divisions" })
          .getAttribute("class"),
      )
      .toMatch(/bg-slate-900/);

    const clickableStickyBox = await sectionNavigation.boundingBox();
    expect(clickableStickyBox?.y).toBeGreaterThanOrEqual(75);
    expect(clickableStickyBox?.y).toBeLessThan(100);
  });

  test("keeps mobile section navigation horizontally scrollable without desktop sticky behavior", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAdvancedEditor(page);

    const desktopNavigation = page
      .locator("aside")
      .filter({ hasText: "Sections" });
    await expect(desktopNavigation).toBeHidden();

    const mobileNavigation = page.locator(
      'div[class*="overflow-x-auto"][class*="xl:hidden"]',
    );
    const mobileEventDetailsButton = mobileNavigation.getByRole("button", {
      name: "Event Details",
    });
    await expect(mobileEventDetailsButton).toBeVisible();
    const overflowMetrics = await mobileNavigation.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(overflowMetrics.scrollWidth).toBeGreaterThan(
      overflowMetrics.clientWidth,
    );

    await mobileEventDetailsButton.click();
    await waitForSectionAtScrollOffset(page, "section-event-details");
    await expect
      .poll(() => mobileEventDetailsButton.getAttribute("class"))
      .toMatch(/bg-slate-900/);

    const mobileDivisionsButton = mobileNavigation.getByRole("button", {
      name: "Divisions",
    });
    await page.locator("#section-division-settings").evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" });
    });
    await expect
      .poll(() => mobileDivisionsButton.getAttribute("class"))
      .toMatch(/bg-slate-900/);
  });
});
