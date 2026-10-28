import { expect, openChordEditor, pickChord, test } from "./fixtures/editor.mjs";

test("opens the default arrangement on desktop", async ({ editor: page, consoleErrors }) => {
   await expect(page).toHaveTitle(/Spartio/);
   await expect(page.locator("html")).toHaveAttribute("data-test-mode", "1");
   await expect(page.locator("html")).toHaveAttribute("data-auth-gate", "app");
   await expect(page.locator("body")).toHaveAttribute("data-view-only", "0");
   await expect(page.locator("#previewTitle")).toHaveText("Song Title");
   await expect(page.locator(".section-title")).toHaveText("INTRO");
   await expect(page.locator(".bar")).toHaveCount(4);
   await expect(page.locator(".drop-target")).toHaveCount(16);
   await expect(page.locator("#previewKey")).toHaveText("C");
   await expect(page.locator("#previewMeter")).toHaveText("4/4");
   await expect(page.locator("#backToSongsBtn")).toBeVisible();
   await expect(page.locator("#saveCloudBtn")).toBeVisible();
   await expect(page.locator("#exportBtn")).toBeVisible();
   await expect(page.locator(".editor-card")).toBeHidden();
   expect(consoleErrors, "console errors during boot").toEqual([]);
});

test("keeps the page within the desktop viewport", async ({ editor: page }) => {
   const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
   );
   expect(overflow).toBeLessThanOrEqual(1);
});

test("opens and closes PDF options without leaving the editor", async ({ editor: page }) => {
   await page.getByRole("button", { name: /export \.pdf/i }).click();
   const dialog = page.getByRole("dialog", { name: "PDF options" });
   await expect(dialog).toBeVisible();
   await expect(page.locator(".pdf-preview-page #previewCard")).toBeVisible();
   await page.getByRole("button", { name: "Close PDF options" }).click();
   await expect(dialog).toBeHidden();
   await expect(page.locator("#previewViewport #previewCard")).toBeVisible();
});

test("reload restores the default arrangement", async ({ editor: page }) => {
   await openChordEditor(page, 0);
   await pickChord(page, "cma", "Cmaj7");
   await expect(page.locator(".placed-chord")).toHaveCount(1);

   await page.reload();
   await expect(page.locator("#sectionsPreview .bar").first()).toBeVisible();
   await expect(page.locator("#previewTitle")).toHaveText("Song Title");
   await expect(page.locator(".preview-section")).toHaveCount(1);
   await expect(page.locator(".bar")).toHaveCount(4);
   await expect(page.locator(".placed-chord")).toHaveCount(0);
});
