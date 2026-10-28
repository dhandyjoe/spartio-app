import { test as base, expect } from "@playwright/test";

export const test = base.extend({
   pageErrors: async ({ page }, use) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors, "uncaught page errors").toEqual([]);
   },
   consoleErrors: async ({ page }, use) => {
      const errors = [];
      page.on("console", (message) => {
         if (message.type() === "error") errors.push(message.text());
      });
      await use(errors);
   },
   editor: async ({ page, pageErrors }, use) => {
      await page.goto(`/?test=${Date.now()}`);
      await expect(page.locator("#sectionsPreview .bar").first()).toBeVisible();
      await expect(page.locator("body")).toHaveAttribute("data-view-only");
      await page.waitForFunction(() => typeof window.__cloudSetSongs === "function");
      await use(page);
   },
});

export { expect };

export function beat(page, index = 0) {
   return page.locator(".drop-target").nth(index);
}

export async function openChordEditor(page, index = 0) {
   await beat(page, index).click();
   const dialog = page.getByRole("dialog", { name: "Enter chord" });
   await expect(dialog).toBeVisible();
   return dialog;
}

export async function pickChord(page, query, match) {
   const input = page.getByRole("textbox", { name: "Chord" });
   await input.fill(query);
   const option = page.getByRole("option").filter({ hasText: match }).first();
   await expect(option).toBeVisible();
   await option.click();
   await expect(page.locator(".chord-popover")).toBeHidden();
}

export async function chordText(locator) {
   return locator.evaluate((element) => {
      const clone = element.cloneNode(true);
      clone.querySelector(".chord-remove")?.remove();
      return clone.textContent.replaceAll("●", "").trim();
   });
}
