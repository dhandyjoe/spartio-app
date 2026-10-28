import { expect, test } from "../fixtures/editor.mjs";
import { openLibrary } from "../fixtures/library.mjs";

test("renders the song index and searches by artist and key", async ({ editor: page }) => {
   await openLibrary(page);
   await expect(page.locator("#songSearch")).toBeVisible();
   await expect(page.locator("#newSongBtn")).toBeVisible();
   await expect(page.locator("#attachLinkBtn")).toBeVisible();
   await expect(page.locator("#mySongsModal .library-table-head")).toContainText("Song / artist");
   await expect(page.locator("#mySongsModal .library-table-head")).toContainText("Key");
   const counts = await page.locator("#mySongsModal [data-filter-count]").allTextContents();
   expect(counts.join(",")).toBe("6,2,2,2,3");
   const grid = await page.evaluate(() => {
      const head = document.querySelector("#mySongsModal .library-table-head");
      const row = document.querySelector("#mySongsModal .song-card.is-index-row");
      return {
         head: getComputedStyle(head).gridTemplateColumns,
         row: getComputedStyle(row).gridTemplateColumns,
      };
   });
   expect(grid.head).toBe(grid.row);

   const first = page.locator(".song-card").first();
   await expect(first.locator(".song-card-title")).toBeVisible();
   await expect(first.locator(".song-card-creator")).toBeVisible();
   await expect(first.locator(".song-card-chip.is-key")).toBeVisible();
   await expect(first.locator(".song-card-chip.is-meter")).toBeVisible();
   await expect(first.locator(".song-card-arrangement")).toBeVisible();
   await expect(first.locator(".song-card-updated")).toBeVisible();

   await page.locator("#songSearch").fill("Sinach");
   await expect(page.locator(".song-card")).toHaveCount(1);
   await expect(page.locator(".song-card-title")).toHaveText("Way Maker");

   await page.locator("#songSearch").fill("F#m");
   await expect(page.locator(".song-card")).toHaveCount(1);
   await expect(page.locator(".song-card-title")).toHaveText("Reckless Love");
});

test("filters by notation and restores the library", async ({ editor: page }) => {
   await openLibrary(page);
   await page.locator("#songFilterBtn").click();
   await page.locator('[data-filter-mode="chords"]').click();
   await expect(page.locator(".song-card")).toHaveCount(2);
   await expect(page.locator("#libraryResultCount")).toContainText("Showing 2 of 6 songs");

   await page.locator("#songFilterBtn").click();
   await page.locator('[data-filter-mode="all"]').click();
   await expect(page.locator(".song-card")).toHaveCount(6);
});

test("clears a no-results search and sorts by title", async ({ editor: page }) => {
   await openLibrary(page);
   await page.locator("#songSearch").fill("zzzz");
   await expect(page.locator("#galleryNoResults")).toBeVisible();
   await page.locator("#galleryClearFilters").focus();
   await page.keyboard.press("Enter");
   await expect(page.locator(".song-card")).toHaveCount(6);
   await expect(page.locator("#songSearch")).toHaveValue("");

   await page.locator("#songSort").selectOption("title");
   await expect(page.locator(".song-card-title").first()).toHaveText("10,000 Reasons");
});

test("focuses search with / and clears it with Escape", async ({ editor: page }) => {
   await openLibrary(page);
   await page.locator("body").click();
   await page.keyboard.press("/");
   await expect(page.locator("#songSearch")).toBeFocused();
   await page.locator("#songSearch").fill("probe");
   await page.keyboard.press("Escape");
   await expect(page.locator("#songSearch")).toHaveValue("");
});
