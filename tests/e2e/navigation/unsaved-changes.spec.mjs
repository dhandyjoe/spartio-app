import { expect, openChordEditor, pickChord, test } from "../fixtures/editor.mjs";

async function dirtyEditor(page) {
   await page.evaluate(() => {
      location.hash = "#/song/new";
   });
   await expect(page).toHaveURL(/#\/song\/new$/);
   await expect(page.locator("html")).toHaveAttribute("data-screen", "editor");
   await openChordEditor(page, 0);
   await pickChord(page, "c", "C");
   await expect(page.locator(".placed-chord")).toHaveCount(1);
}

test("cancel keeps the editor open and leave discards the changes", async ({ editor: page }) => {
   await dirtyEditor(page);
   await page.locator("#backToSongsBtn").click();
   const dialog = page.locator("#unsavedDialog");
   await expect(dialog).toBeVisible();
   await expect(page.locator("#unsavedSaveBtn")).toContainText(/save & leave/i);
   await expect(page.locator("#unsavedDiscardBtn")).toContainText(/leave without saving/i);
   await expect(page.locator("#unsavedCancelBtn")).toContainText(/cancel/i);

   await page.locator("#unsavedCancelBtn").click();
   await expect(dialog).toBeHidden();
   await expect(page).toHaveURL(/#\/song\/new$/);
   await expect(page.locator(".placed-chord")).toHaveCount(1);

   await page.locator("#backToSongsBtn").click();
   await expect(dialog).toBeVisible();
   await page.locator("#unsavedDiscardBtn").click();
   await expect(dialog).toBeHidden();
   await expect(page).toHaveURL(/#\/songs$/);
   await expect(page.locator("html")).toHaveAttribute("data-screen", "home");
   await expect(page.locator("#mySongsModal")).toBeVisible();
});

test("browser Back with unsaved edits re-pins the editor and opens the guard", async ({
   editor: page,
}) => {
   await page.evaluate(() => {
      location.hash = "#/songs";
   });
   await expect(page.locator("html")).toHaveAttribute("data-screen", "home");
   await page.evaluate(() => {
      location.hash = "#/song/new";
   });
   await expect(page.locator("html")).toHaveAttribute("data-screen", "editor");

   await openChordEditor(page, 0);
   await pickChord(page, "c", "C");
   await page.goBack();

   const dialog = page.locator("#unsavedDialog");
   await expect(dialog).toBeVisible();
   await expect(page).toHaveURL(/#\/song\/new$/);
   await page.locator("#unsavedDiscardBtn").click();
   await expect(page.locator("html")).toHaveAttribute("data-screen", "home");
});

test("Save to Cloud reflects unsaved edits", async ({ editor: page }) => {
   const save = page.locator("#saveCloudBtn");
   await expect(save).not.toHaveClass(/is-unsaved/);
   await openChordEditor(page, 0);
   await pickChord(page, "c", "C");
   await expect(save).toHaveClass(/is-unsaved/);
   await expect(save).toHaveAttribute("aria-label", /unsaved changes/i);
});

test("a clean editor leaves without a prompt", async ({ editor: page }) => {
   await page.evaluate(() => {
      location.hash = "#/song/new";
   });
   await expect(page).toHaveURL(/#\/song\/new$/);
   await expect(page.locator("html")).toHaveAttribute("data-screen", "editor");
   await page.locator("#backToSongsBtn").click();
   await expect(page).toHaveURL(/#\/songs$/);
   await expect(page.locator("html")).toHaveAttribute("data-screen", "home");
   await expect(page.locator("#unsavedDialog")).toBeHidden();
   await expect(page.locator("#mySongsModal")).toBeVisible();
});
