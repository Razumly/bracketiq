import { PDFDocument } from "pdf-lib";
import { test, expect } from "./fixtures/api";
import { storageStatePath } from "./fixtures/auth";
import { SEED_EVENTS } from "./fixtures/seed-data";

test.use({ storageState: storageStatePath("host") });

test("imports, previews, and locally views a signed customer PDF", async ({
  page,
  hostApi,
  participantApi,
}) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  const registrationResponse = await participantApi.post(
    `/api/events/${SEED_EVENTS.free.id}/registrations/self`,
    { data: { eventId: SEED_EVENTS.free.id } },
  );
  expect([200, 201, 409]).toContain(registrationResponse.status());

  const templateResponse = await hostApi.post("/api/organizations/org_1/templates", {
    data: {
      template: {
        title: "E2E Imported Waiver",
        description: "A text-backed sign-once version for the import smoke.",
        signOnce: true,
        type: "TEXT",
        content: "I agree to the E2E imported waiver.",
        requiredSignerType: "PARTICIPANT",
      },
    },
  });
  const templateResponseBody = await templateResponse.text();
  expect(templateResponse.status(), templateResponseBody).toBe(201);

  const pdfDocument = await PDFDocument.create();
  pdfDocument.addPage([612, 792]);
  const pdfBytes = await pdfDocument.save();

  await page.goto("/organizations/org_1?tab=users", { waitUntil: "domcontentloaded" });
  const customerRow = page.getByRole("row").filter({ hasText: "Player User" });
  await expect(customerRow).toBeVisible({ timeout: 120_000 });
  await customerRow.click();

  const openImportButton = page.getByRole("button", { name: "Import signed document" }).first();
  await expect(openImportButton).toBeVisible();
  await openImportButton.focus();
  await page.keyboard.press("Enter");

  const importDialog = page.getByRole("dialog", { name: /Import signed document for Player User/i });
  await expect(importDialog).toBeVisible();
  await importDialog.locator('input[type="file"]').setInputFiles({
    name: "historical-waiver.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(pdfBytes),
  });
  await importDialog.getByLabel("Historical signing date (optional)").fill("2026-08-01");

  const attestation = importDialog.getByRole("checkbox", { name: "Document Import Attestation" });
  await expect(attestation).toBeEnabled();
  await attestation.focus();
  await page.keyboard.press("Space");

  const submitButton = importDialog.getByRole("button", { name: "Import signed document" });
  await expect(submitButton).toBeEnabled();
  await submitButton.focus();
  const importResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/organizations/org_1/documents/import")
      && response.request().method() === "POST",
  );
  await page.keyboard.press("Enter");
  expect((await importResponsePromise).status()).toBe(201);

  await expect(importDialog).toBeHidden();
  await expect(page.getByText("Imported", { exact: true })).toBeVisible();
  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
  await expect(page.getByText("SIGNED", { exact: true })).toBeVisible();
  await expect(page.getByText(/Signing date 08\/01\/2026/)).toBeVisible();

  const viewPdfButton = page.getByRole("button", { name: "View PDF", exact: true });
  await expect(viewPdfButton).toBeVisible();
  const fileResponsePromise = new Promise<{
    status: number;
    contentType: string | undefined;
    url: string;
  }>((resolve) => {
    const context = page.context();
    const responseListener = (response: Parameters<typeof context.on>[1]) => {
      if (
        response.url().includes("/api/documents/signed/")
        && response.url().endsWith("/file")
        && response.request().method() === "GET"
      ) {
        context.off("response", responseListener);
        resolve({
          status: response.status(),
          contentType: response.headers()["content-type"],
          url: response.url(),
        });
      }
    };
    context.on("response", responseListener);
  });
  const popupPromise = page.waitForEvent("popup");
  await viewPdfButton.focus();
  await page.keyboard.press("Enter");
  const previewPage = await popupPromise;
  const previewConsoleErrors: string[] = [];
  previewPage.on("console", (message) => {
    if (message.type() === "error") {
      previewConsoleErrors.push(message.text());
    }
  });
  const fileResponse = await fileResponsePromise;
  const downloadedFile = await page.request.get(fileResponse.url);
  expect(previewPage).toBeTruthy();
  expect(fileResponse.status).toBe(200);
  expect(fileResponse.contentType).toContain("application/pdf");
  expect(downloadedFile.status()).toBe(200);
  expect(downloadedFile.headers()["content-type"]).toContain("application/pdf");
  expect((await downloadedFile.body()).subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect([...consoleErrors, ...previewConsoleErrors]).toEqual([]);
});
