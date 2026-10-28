import { expect, test } from "../fixtures/editor.mjs";
import { openLibrary } from "../fixtures/library.mjs";

test.use({
   viewport: { width: 393, height: 870 },
   isMobile: true,
   hasTouch: true,
   deviceScaleFactor: 2.75,
});

test.beforeEach(async ({ editor: page }) => {
   await page.getByRole("button", { name: "Got it" }).click();
   await expect(page.locator("#deviceHint")).toBeHidden({ timeout: 2_000 });
});

test("keeps the 393px phone layout within the viewport", async ({ editor: page }) => {
   await expect(page.locator("body")).toHaveAttribute("data-view-only", "1");
   const layout = await page.evaluate(() => {
      const viewport = document.querySelector(".preview-viewport").getBoundingClientRect();
      const card = document.querySelector("#previewCard").getBoundingClientRect();
      const bars = [...document.querySelectorAll(".bar")].map((bar) => bar.getBoundingClientRect());
      return {
         pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
         cardWidth: card.width,
         viewportWidth: viewport.width,
         barsFit: bars.every((bar) => bar.left >= card.left - 1 && bar.right <= card.right + 1),
         barsStack: bars.every((bar, index) => index === 0 || bar.top >= bars[index - 1].bottom - 1),
         topbar: ["#backToSongsBtn", "#saveCloudBtn", "#exportBtn"].every((selector) => {
            const element = document.querySelector(selector);
            const rect = element.getBoundingClientRect();
            return getComputedStyle(element).display !== "none" && rect.width > 0 && rect.height > 0;
         }),
      };
   });
   expect(layout.pageOverflow).toBe(false);
   expect(layout.cardWidth).toBeGreaterThan(0);
   expect(layout.cardWidth).toBeLessThanOrEqual(layout.viewportWidth);
   expect(layout.barsFit).toBe(true);
   expect(layout.barsStack).toBe(true);
   expect(layout.topbar).toBe(true);
});

test("the song row fits the 393px viewport", async ({ editor: page }) => {
   await openLibrary(page, [
      {
         cloudId: "mobile-1",
         title: "Mobile Song",
         artist: "Artist",
         latestKey: "G",
         latestMeter: "4/4",
         latestEditorMode: "chords",
         versionCount: 1,
         updatedAt: Date.now(),
      },
   ]);
   const row = page.locator(".song-card").first();
   await expect(row).toBeVisible();
   const box = await row.boundingBox();
   expect(box.width).toBeGreaterThan(0);
   expect(box.width).toBeLessThanOrEqual(393 - 8);
   await expect(page.locator("#newSongBtn")).toBeVisible();
});

test("library dialogs keep both actions inside the phone viewport", async ({ editor: page }) => {
   await openLibrary(page);
   const within = async (dialog) => {
      const master = dialog.locator(".confirm-dialog-card");
      await expect(master).toBeVisible();
      const box = await master.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(393 + 1);
   };

   await page.locator("#newSongBtn").click();
   await within(page.locator("#newSongDialog"));
   await expect(page.locator("#newSongDialog .confirm-dialog-actions .button-ghost")).toBeVisible();
   await page.locator("#newSongClose").click();

   await page.locator("#attachLinkBtn").click();
   await within(page.locator("#attachLinkDialog"));
   await expect(page.locator("#attachLinkCancel")).toBeVisible();
   await expect(page.locator("#attachLinkConfirm")).toBeDisabled();
   await page.locator("#attachLinkCancel").click();

   await page.locator("#tabAlbums").click();
   await page.locator("#joinAlbumBtn").click();
   await within(page.locator("#joinAlbumDialog"));
   await expect(page.locator("#joinAlbumCancel")).toBeVisible();
   await page.locator("#joinAlbumCancel").click();

   await page.locator("#newAlbumBtn").click();
   await within(page.locator("#newAlbumDialog"));
   await expect(page.locator("#newAlbumCancel")).toBeVisible();
});

test("the login page fits the phone viewport", async ({ editor: page }) => {
   await openLibrary(page);
   await page.locator("#accountBtn").click();
   await expect(page.locator("#loginPage")).toBeVisible();
   const card = page.locator("#loginPage .login-card");
   await expect(card).toBeVisible();
   const box = await card.boundingBox();
   expect(box.width).toBeGreaterThan(0);
   expect(box.width).toBeLessThanOrEqual(393 + 1);
   await expect(page.locator("#loginPage .login-aside")).toBeHidden();
});
