import { expect, test } from "../fixtures/editor.mjs";

test("adds and removes a bar", async ({ editor: page }) => {
   await expect(page.locator(".bar")).toHaveCount(4);
   await page.getByRole("button", { name: /add 1 bar/i }).click();
   await expect(page.locator(".bar")).toHaveCount(5);
   const lastBar = page.locator(".bar").last();
   await lastBar.hover();
   await lastBar.getByRole("button", { name: /delete bar/i }).click();
   await expect(page.locator(".bar")).toHaveCount(4);
});

test("adds and removes a section", async ({ editor: page }) => {
   await expect(page.locator(".preview-section")).toHaveCount(1);
   await page.locator("#addSectionBtn").click();
   await expect(page.locator(".preview-section")).toHaveCount(2);
   const second = page.locator(".preview-section").nth(1);
   await second.locator(".section-menu summary").click();
   await second.locator(".delete-section").click();
   await expect(page.locator(".preview-section")).toHaveCount(1);
});

test("selects a range of bars, copies it, and enables paste", async ({ editor: page }) => {
   await page.locator(".section-menu summary").first().click();
   await page.getByRole("button", { name: /copy bars/i }).click();
   const toolbar = page.locator(".bar-selection-bar");
   await expect(toolbar).toBeVisible();
   await expect(page.locator(".bar-selection-count")).toHaveText("No bars selected yet");
   await expect(page.locator(".bar-selection-copy")).toBeDisabled();

   await page.locator('.bar[data-bar="0"]').click();
   await expect(page.locator(".bar-selection-count")).toHaveText("1 bar selected");
   await expect(page.locator(".bar-selection-copy")).toBeEnabled();

   await page.locator('.bar[data-bar="1"]').click();
   await expect(page.locator(".bar-selection-count")).toHaveText("2 bars selected");
   await page.locator(".bar-selection-copy").click();
   await expect(toolbar).toBeHidden();
   await expect(page.locator(".paste-bar").first()).toBeEnabled();
});

test("cancels bar selection without copying", async ({ editor: page }) => {
   await page.locator(".section-menu summary").first().click();
   await page.getByRole("button", { name: /copy bars/i }).click();
   await expect(page.locator(".bar-selection-bar")).toBeVisible();
   await page.locator(".bar-selection-cancel").click();
   await expect(page.locator(".bar-selection-bar")).toBeHidden();
});
