import { test, expect } from "@playwright/test";
import {
  AUTH_STORAGE,
  acceptTermsIfNeeded,
  seedLocationStorage,
} from "./utils/event";
import {
  SEED_IMAGE,
  SEED_ORG,
  SEED_SPORT,
  SEED_USERS,
} from "./fixtures/seed-data";
import { E2E_EVENT_IDS } from "./fixtures/test-ids";

test.use({ storageState: AUTH_STORAGE.host });

test("creates an event from the schedule create flow", async ({ page }) => {
  const eventId = E2E_EVENT_IDS.createFlow;

  page.on("pageerror", (err) => console.log("[pageerror]", err.message));
  page.on("console", (msg) => {
    console.log(`[console:${msg.type()}]`, msg.text());
  });
  page.on("request", (req) => {
    if (req.url().includes("/api/auth/me")) {
      console.log("[e2e] auth request", req.url());
    }
    if (req.resourceType() === "script" && req.url().includes("/_next/")) {
      console.log("[e2e] script request", req.url());
    }
  });
  page.on("response", async (res) => {
    if (res.request().resourceType() === "script" && !res.ok()) {
      console.log("[e2e] script response error", res.status(), res.url());
    }
    if (res.url().includes("/api/events/editor") && res.request().method() === "GET") {
      const body = await res.json().catch(() => null);
      const snapshot = body?.snapshot;
      console.log(
        "[e2e] editor bootstrap",
        res.url(),
        JSON.stringify({
          editorRevision: snapshot?.editorRevision,
          scheduleRevision: snapshot?.scheduleState?.revision,
          basics: snapshot?.draft?.basics,
          schedule: snapshot?.draft?.schedule,
          resources: snapshot?.draft?.resources,
        }),
      );
    }
    if (res.url().includes("/api/")) {
      console.log(
        "[e2e] api response",
        res.status(),
        res.request().method(),
        res.url(),
      );
    }
  });
  page.on("requestfailed", (req) => {
    console.log("[e2e] request failed", req.url(), req.failure()?.errorText);
  });
  page.on("crash", () => {
    console.log("[e2e] page crashed");
  });
  page.on("close", () => {
    console.log("[e2e] page closed");
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      console.log("[e2e] navigated", frame.url());
    }
  });

  await seedLocationStorage(page);
  await page.goto(
    `/events/${eventId}/schedule?create=1&orgId=${SEED_ORG.id}&skipTemplatePrompt=1`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  console.log("[e2e] url after goto", page.url());
  await page.waitForTimeout(5000);
  console.log("[e2e] url after 5s", page.url());

  await page
    .getByText("Loading...")
    .waitFor({ state: "detached", timeout: 10000 })
    .catch(() => null);

  await expect(page.getByText("Event setup", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await acceptTermsIfNeeded(page);

  const eventNameInput = page.getByPlaceholder("Enter event name");
  if (!(await eventNameInput.isVisible().catch(() => false))) {
    await page.getByText("Advanced Setup", { exact: true }).click();
  }
  await expect(eventNameInput).toBeVisible({ timeout: 30000 });
  await eventNameInput.fill("E2E Create Event");

  const selectImageButton = page
    .getByRole("button", { name: /select image/i })
    .first();
  await selectImageButton.click();
  const uploadedImage = page.getByAltText("Uploaded").first();
  await expect(uploadedImage).toBeVisible({ timeout: 10000 });
  await uploadedImage.click();
  await expect(page.getByAltText("Selected image")).toBeVisible();

  const sportInput = page.getByRole("textbox", { name: "Sport" });
  await expect(sportInput).toBeEnabled();
  await sportInput.click();
  await page.getByRole("option", { name: "Indoor Volleyball" }).click();
  await page.waitForTimeout(1000);

  const sidebar = page.getByRole("complementary");
  await sidebar.getByRole("button", { name: "Divisions" }).click();

  const genderInput = page.getByRole("textbox", { name: "Gender" });
  await expect(genderInput).toBeVisible({ timeout: 10000 });
  await genderInput.click();
  await page.getByRole("option", { name: "Mens", exact: true }).click();

  const skillInput = page.getByRole("textbox", { name: "Skill Division" });
  await skillInput.click();
  await page.getByRole("option", { name: "Open" }).click();

  const ageInput = page.getByRole("textbox", { name: "Age Division" });
  await ageInput.click();
  await page.getByRole("option", { name: "18+" }).click();

  const maxParticipantsInput = page.getByRole("textbox", {
    name: "Max Participants",
  });
  await maxParticipantsInput.fill("16");

  await page.getByRole("button", { name: "Add Division" }).click();

  const editorRequestPromise = page.waitForRequest(
    (req) =>
      new URL(req.url()).pathname === "/api/events/editor" &&
      req.method() === "POST",
  );
  const editorResponsePromise = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname === "/api/events/editor" &&
      res.request().method() === "POST",
  );

  const createEventButton = page
    .getByRole("button", { name: /create event/i })
    .first();
  await createEventButton.waitFor({ state: "attached" });
  await createEventButton.click({ force: true });

  const editorRequest = await editorRequestPromise;
  const editorResponse = await editorResponsePromise;
  const payload = editorRequest.postDataJSON() as {
    createOperationId?: unknown;
    expectedRevisions?: {
      editorRevision?: unknown;
      staffRevision?: unknown;
      scheduleRevision?: unknown;
    };
    draft?: {
      basics?: {
        eventType?: unknown;
        hostId?: unknown;
        imageId?: unknown;
        organizationId?: unknown;
        sportIds?: unknown;
        start?: unknown;
      };
      resources?: {
        fieldIds?: unknown;
        timeSlotIds?: unknown;
        requiredTemplateIds?: unknown;
        rentalBookingId?: unknown;
        rentalBookingItemId?: unknown;
      };
      schedule?: {
        mode?: unknown;
        endConstraint?: unknown;
        generatedScheduleEnd?: unknown;
      };
    };
  };
  const draft = payload.draft ?? {};
  const basics = draft.basics ?? {};
  const expectedRevisions = payload.expectedRevisions ?? {};

  expect(
    editorResponse.ok(),
    `editor response ${editorResponse.status()}: ${await editorResponse.text()} submitted=${JSON.stringify({
      expectedRevisions: payload.expectedRevisions,
      basics: draft.basics,
      schedule: draft.schedule,
      resources: draft.resources,
    })}`,
  ).toBeTruthy();

  expect(payload.createOperationId).toEqual(expect.any(String));
  expect(expectedRevisions.editorRevision).toEqual(expect.any(String));
  expect(expectedRevisions.scheduleRevision).toEqual(expect.any(String));
  expect(basics.hostId).toBe(SEED_USERS.host.id);
  expect(basics.sportIds).toContain(SEED_SPORT.id);
  expect(basics.eventType).toBe("EVENT");
  expect(basics.imageId).toBe(SEED_IMAGE.id);
  expect(basics.organizationId).toBe(SEED_ORG.id);
  expect(draft.participation?.teamSizeLimit).toBe(2);

  const divisionDetails = Array.isArray(draft.competition?.divisionDetails)
    ? draft.competition.divisionDetails
    : [];
  expect(
    divisionDetails.some(
      (division) =>
        typeof division === "object" &&
        JSON.stringify(division).toLowerCase().includes("open"),
    ),
  ).toBeTruthy();

  const normalizedFieldIds = Array.isArray(draft.resources?.fieldIds)
    ? draft.resources.fieldIds
    : [];
  const normalizedTimeSlotIds = Array.isArray(draft.resources?.timeSlotIds)
    ? draft.resources.timeSlotIds
    : [];
  expect(
    normalizedFieldIds.every((fieldId) => typeof fieldId === "string"),
  ).toBeTruthy();
  expect(
    normalizedTimeSlotIds.every((timeSlotId) => typeof timeSlotId === "string"),
  ).toBeTruthy();

  await expect(
    page.getByRole("heading", { name: "E2E Create Event" }),
  ).toBeVisible();
});
