import { PDFDocument } from "pdf-lib";
import { expect, resolveBaseUrl, test } from "./fixtures/api";
import { storageStatePath } from "./fixtures/auth";
import { SEED_EVENTS } from "./fixtures/seed-data";

test.use({ storageState: storageStatePath("host") });

test("imports, previews, voids, and preserves a signed customer PDF", async ({
  page,
  browser,
  hostApi,
  participantApi,
}) => {
  test.setTimeout(180_000);
  const documentTitle = `E2E Imported Waiver ${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await participantApi.patch("/api/notifications", {
    data: { isMarkAllRead: true, type: "documents" },
  });
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
        title: documentTitle,
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
  const documentCard = page
    .getByRole("button", { name: new RegExp(`${documentTitle} Imported`) });
  await expect(documentCard).toBeVisible();
  await expect(documentCard.getByText("Imported", { exact: true })).toBeVisible();
  await expect(documentCard.getByText("Version 1", { exact: true })).toBeVisible();
  await expect(documentCard.getByText("SIGNED", { exact: true })).toBeVisible();
  await expect(documentCard.getByText("Signing date unknown", { exact: true })).toBeVisible();

  const viewPdfButton = documentCard.getByRole("button", { name: "View PDF", exact: true });
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

  const participantContext = await browser.newContext({
    storageState: storageStatePath("participant"),
  });
  const participantPage = await participantContext.newPage();
  try {
    await participantPage.goto(`${resolveBaseUrl()}/profile?tab=documents`, {
      waitUntil: "domcontentloaded",
    });
    await expect(participantPage.getByText(documentTitle, { exact: true })).toBeVisible();
    await expect(participantPage.getByText("Imported", { exact: true })).toBeVisible();
    await expect(
      participantPage.getByText("Signing date unknown", { exact: true }),
    ).toBeVisible();

    const participantDocumentCard = participantPage
      .getByText(documentTitle, { exact: true })
      .locator("xpath=ancestor::div[.//button[normalize-space()='View document']][1]");
    const subjectViewButton = participantDocumentCard.getByRole(
      "button",
      { name: "View document", exact: true },
    );
    const subjectPopupPromise = participantPage.waitForEvent("popup");
    await subjectViewButton.focus();
    await participantPage.keyboard.press("Enter");
    const subjectPopup = await subjectPopupPromise;
    await subjectPopup.waitForLoadState("domcontentloaded");
    expect(subjectPopup.url()).toContain("/api/documents/signed/");
    expect(subjectPopup.url()).toMatch(/\/file$/);
    const subjectFile = await participantPage.request.get(subjectPopup.url());
    expect(subjectFile.status()).toBe(200);
    expect(subjectFile.headers()["content-type"]).toContain("application/pdf");
    await subjectPopup.close();
    await participantPage.goto(`${resolveBaseUrl()}/profile?tab=notifications`, {
      waitUntil: "domcontentloaded",
    });
    await expect(participantPage.getByText("Document notifications", { exact: true })).toBeVisible();
    await expect(participantPage.getByText("Signed document added", { exact: true })).toBeVisible();
    await expect(participantPage.getByText("1 unread", { exact: true })).toBeVisible();
    await participantPage.getByRole("button", { name: "Mark read", exact: true }).click();
    await expect(participantPage.getByText("1 unread", { exact: true })).toBeHidden();
    await expect(
      participantPage.getByRole("button", { name: "Mark all read", exact: true }),
    ).toBeDisabled();
  } finally {
    await participantContext.close();
  }

  const voidButton = documentCard.getByRole("button", { name: "Void", exact: true });
  await voidButton.focus();
  await page.keyboard.press("Enter");
  const voidDialog = page.getByRole("dialog", { name: new RegExp(`Void ${documentTitle}`) });
  await expect(voidDialog).toBeVisible();
  await voidDialog.getByLabel("Confirm your password").fill("password123!");
  await voidDialog.getByLabel("Void reason").click();
  await page.getByRole("option", { name: "Duplicate evidence" }).click();
  const voidResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/organizations/org_1/documents/")
      && response.url().endsWith("/void")
      && response.request().method() === "POST",
  );
  const confirmVoidButton = voidDialog.getByRole("button", { name: "Void document", exact: true });
  await expect(confirmVoidButton).toBeEnabled();
  await confirmVoidButton.focus();
  await page.keyboard.press("Enter");
  expect((await voidResponsePromise).status()).toBe(200);
  await expect(voidDialog).toBeHidden();
  await expect(documentCard.getByText("VOID", { exact: true })).toBeVisible();
  await expect(documentCard.getByRole("button", { name: "View PDF", exact: true })).toBeVisible();
  const preservedFile = await page.request.get(fileResponse.url);
  expect(preservedFile.status()).toBe(200);
  expect(preservedFile.headers()["content-type"]).toContain("application/pdf");
  expect((await preservedFile.body()).subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect([...consoleErrors, ...previewConsoleErrors]).toEqual([]);
});
