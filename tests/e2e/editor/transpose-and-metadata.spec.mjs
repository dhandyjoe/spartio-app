import { chordText, expect, openChordEditor, pickChord, test } from "../fixtures/editor.mjs";

test("transposes an absolute chord and the key together", async ({ editor: page }) => {
   await openChordEditor(page, 0);
   await pickChord(page, "cma", "Cmaj7");
   const chord = page.locator(".placed-chord").first();
   expect(await chordText(chord)).toBe("Cmaj7");
   await page.locator("#transposeUp").click();
   await expect(page.locator("#previewKey")).toHaveText("D♭");
   expect(await chordText(chord)).toBe("D♭maj7");
});

test("changes the meter through the inline editor", async ({ editor: page }) => {
   await expect(page.locator(".drop-target")).toHaveCount(16);
   await page.locator("#previewMeter").click();
   await page.locator("#previewMeter select").selectOption("3/4");
   await expect(page.locator("#previewMeter")).toHaveText("3/4");
   await expect(page.locator(".drop-target")).toHaveCount(12);
});

test("changes the key through the inline editor", async ({ editor: page }) => {
   await page.locator("#previewKey").click();
   await page.locator("#previewKey select").selectOption("E");
   await expect(page.locator("#previewKey")).toHaveText("E");
   await expect(page.locator("#keySelect")).toHaveValue("E");
});

test("edits the title inline and keeps the source input in sync", async ({ editor: page }) => {
   await page.locator("#previewTitle").click();
   const input = page.locator("#previewTitle input");
   await expect(input).toBeVisible();
   await input.fill("Mobile Grace");
   await input.press("Enter");
   await expect(page.locator("#previewTitle")).toHaveText("Mobile Grace");
   await expect(page.locator("#songTitle")).toHaveValue("Mobile Grace");
});
