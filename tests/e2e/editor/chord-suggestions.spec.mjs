import { expect, openChordEditor, test } from "../fixtures/editor.mjs";

test("offers canonical symbols alongside the typed spelling", async ({ editor: page }) => {
   const dialog = await openChordEditor(page, 0);
   const input = dialog.getByRole("textbox", { name: "Chord" });

   await input.fill("Gaug");
   await expect(page.getByRole("option").filter({ hasText: "G+" })).toHaveCount(1);

   await input.fill("Gdim");
   await expect(page.getByRole("option").filter({ hasText: "G°" })).toHaveCount(1);

   await input.fill("Gm7b5");
   await expect(page.getByRole("option").filter({ hasText: "Gø7" })).toHaveCount(1);

   await page.keyboard.press("Escape");
   await expect(dialog).toBeHidden();
});

test("offers Nashville octave variants and commits the selected one", async ({ editor: page }) => {
   const dialog = await openChordEditor(page, 2);
   const input = dialog.getByRole("textbox", { name: "Chord" });
   await input.fill("1");
   const options = page.getByRole("option");
   await expect(options.first()).toBeVisible();
   expect(await options.count()).toBeGreaterThanOrEqual(3);

   await options.first().click();
   await expect(dialog).toBeHidden();
   await expect(page.locator(".placed-chord").first()).toContainText("1");
});

test("scrolling inside the suggestion list keeps the editor open", async ({ editor: page }) => {
   const dialog = await openChordEditor(page, 3);
   await dialog.getByRole("textbox", { name: "Chord" }).fill("c");
   const list = page.locator(".chord-popover-list");
   await expect(list).toBeVisible();

   await list.hover();
   await page.mouse.wheel(0, 80);
   await expect(dialog).toBeVisible();

   await page.keyboard.press("Escape");
   await expect(dialog).toBeHidden();
});
