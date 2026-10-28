import { beat, expect, test } from "../fixtures/editor.mjs";

test("opens the rhythm menu and subdivides a beat", async ({ editor: page }) => {
   await beat(page, 4).click({ button: "right" });
   const menu = page.locator(".beat-menu");
   await expect(menu).toBeVisible();
   await expect(menu.getByRole("menuitem")).toHaveCount(5);
   await expect(menu.getByRole("menuitem", { name: /remove subdivision/i })).toHaveAttribute(
      "aria-disabled",
      "true",
   );
   await menu.getByRole("menuitem", { name: /half beat/i }).click();
   await expect(menu).toBeHidden();
   const group = page.locator(".beat-group.duration-half").first();
   await expect(group).toBeVisible();
   await expect(group.locator(".sub-beats > *")).toHaveCount(2);
});

test("nested beats only offer nested-safe rhythm actions", async ({ editor: page }) => {
   await beat(page, 4).click({ button: "right" });
   await page.getByRole("menuitem", { name: /half beat/i }).click();
   await page.locator(".sub-beat").first().click({ button: "right" });
   const menu = page.locator(".beat-menu");
   await expect(menu).toBeVisible();
   await expect(menu.getByRole("menuitem", { name: /triplet/i })).toHaveAttribute(
      "aria-disabled",
      "true",
   );
   await expect(menu.getByRole("menuitem", { name: /quarter beat/i })).toHaveAttribute(
      "aria-disabled",
      "true",
   );
   await expect(menu.getByRole("menuitem", { name: /remove subdivision/i })).toHaveAttribute(
      "aria-disabled",
      "true",
   );
   await page.keyboard.press("Escape");
   await expect(menu).toBeHidden();
});

test("removes a subdivision through its marker line", async ({ editor: page }) => {
   await beat(page, 4).click({ button: "right" });
   await page.getByRole("menuitem", { name: /half beat/i }).click();
   await expect(page.locator(".beat-group.duration-half")).toHaveCount(1);
   await page.locator(".beat-group.duration-half .duration-line").first().click();
   await expect(page.locator(".beat-group.duration-half")).toHaveCount(0);
});

test("triplet and quarter subdivisions render three and four notes", async ({ editor: page }) => {
   await beat(page, 6).click({ button: "right" });
   await page.getByRole("menuitem", { name: /triplet/i }).click();
   await expect(
      page.locator(".beat-group.duration-triplet .sub-beats").first().locator(":scope > *"),
   ).toHaveCount(3);

   await beat(page, 9).click({ button: "right" });
   await page.getByRole("menuitem", { name: /quarter beat/i }).click();
   await expect(
      page.locator(".beat-group.duration-quarter .sub-beats").first().locator(":scope > *"),
   ).toHaveCount(4);
});
