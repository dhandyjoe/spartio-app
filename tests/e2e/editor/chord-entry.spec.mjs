import { chordText, expect, openChordEditor, test } from "../fixtures/editor.mjs";

test("types a chord and commits the highlighted suggestion", async ({ editor: page }) => {
   const dialog = await openChordEditor(page, 0);
   const input = dialog.getByRole("textbox", { name: "Chord" });
   await expect(input).toBeFocused();
   await input.fill("cma");
   const suggestions = page.getByRole("option");
   await expect(suggestions.first()).toContainText("Cmaj");
   await suggestions.filter({ hasText: "Cmaj7" }).first().click();
   await expect(dialog).toBeHidden();
   const chord = page.locator(".placed-chord").first();
   await expect(chord).toContainText("Cmaj7");
   expect(await chordText(chord)).toBe("Cmaj7");
});

test("commits a slash chord from the suggestion list", async ({ editor: page }) => {
   const dialog = await openChordEditor(page, 1);
   await dialog.getByRole("textbox", { name: "Chord" }).fill("g/b");
   const slash = page.getByRole("option").filter({ hasText: "/" }).first();
   await expect(slash).toBeVisible();
   await slash.click();
   await expect(dialog).toBeHidden();
   expect(await chordText(page.locator(".placed-chord").first())).toContain("/");
});

test("explains an unknown chord and never commits it", async ({ editor: page }) => {
   const dialog = await openChordEditor(page, 3);
   await dialog.getByRole("textbox", { name: "Chord" }).fill("zzz");
   await expect(page.locator(".chord-popover-msg")).toHaveText(/unknown chord/i);
   await expect(page.getByRole("option")).toHaveCount(0);
   await page.keyboard.press("Escape");
   await expect(dialog).toBeHidden();
   await expect(page.locator(".placed-chord")).toHaveCount(0);
});

test("escape closes the editor without changing the beat", async ({ editor: page }) => {
   const dialog = await openChordEditor(page, 2);
   await dialog.getByRole("textbox", { name: "Chord" }).fill("c");
   await expect(page.getByRole("option").first()).toBeVisible();
   await page.keyboard.press("Escape");
   await expect(dialog).toBeHidden();
   await expect(page.locator(".placed-chord")).toHaveCount(0);
});

test("clicking a placed chord reopens it with the current value", async ({ editor: page }) => {
   const first = await openChordEditor(page, 0);
   await first.getByRole("textbox", { name: "Chord" }).fill("Cmaj");
   await page.getByRole("option").filter({ hasText: "Cmaj7" }).first().click();
   const chord = page.locator(".placed-chord").first();
   await chord.click();
   const dialog = page.getByRole("dialog", { name: "Enter chord" });
   await expect(dialog).toBeVisible();
   await expect(dialog.getByRole("textbox", { name: "Chord" })).toHaveValue(/Cmaj7/);
   await page.keyboard.press("Escape");
});
