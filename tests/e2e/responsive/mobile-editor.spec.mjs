import { beat, expect, test } from "../fixtures/editor.mjs";

test.use({
   viewport: { width: 390, height: 844 },
   isMobile: true,
   hasTouch: true,
   deviceScaleFactor: 2,
});

async function dismissDeviceHint(page) {
   const close = page.getByRole("button", { name: "Got it" });
   await close.click();
   await expect(page.locator("#deviceHint")).toBeHidden({ timeout: 2_000 });
}

test.beforeEach(async ({ editor: page }) => {
   await dismissDeviceHint(page);
});

test("keeps the phone canvas view-only and within the viewport", async ({ editor: page }) => {
   await expect(page.locator("body")).toHaveAttribute("data-view-only", "1");
   const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
   );
   expect(overflow).toBeLessThanOrEqual(1);

   await beat(page, 0).click();
   await expect(page.getByRole("dialog", { name: "Enter chord" })).toBeHidden();
   await expect(page.locator(".add-bar").first()).toBeDisabled();

   const controls = await page.evaluate(() => {
      const pointer = (selector) => getComputedStyle(document.querySelector(selector)).pointerEvents;
      return {
         meter: document.querySelector("#timeSignature").disabled,
         meterPreview: pointer("#previewMeter"),
         undo: pointer("#undoBtn"),
         key: document.querySelector("#keySelect").disabled,
         transpose: pointer("#transposeUp"),
         bpm: document.querySelector("#bpmInput").disabled,
         play: pointer("#playBtn"),
         export: pointer("#exportBtn"),
      };
   });
   expect(controls.meter).toBe(true);
   expect(controls.meterPreview).toBe("none");
   expect(controls.undo).toBe("none");
   expect(controls.key).toBe(false);
   expect(controls.transpose).not.toBe("none");
   expect(controls.bpm).toBe(false);
   expect(controls.play).not.toBe("none");
   expect(controls.export).not.toBe("none");
});

test("hides desktop editing chrome on a phone", async ({ editor: page }) => {
   const state = await page.evaluate(() => ({
      ribbon: getComputedStyle(document.querySelector(".editor-card")).display,
      toolbar: document.querySelectorAll(".canvas-toolbar").length,
      zoom: getComputedStyle(document.querySelector("#previewCard")).zoom,
      deleteBar: getComputedStyle(document.querySelector(".delete-bar")).display,
      barTools: getComputedStyle(document.querySelector(".bar-tools")).display,
   }));
   expect(state.ribbon).toBe("none");
   expect(state.toolbar).toBe(0);
   expect(Number.parseFloat(state.zoom)).toBe(1);
   expect(state.deleteBar).toBe("none");
   expect(state.barTools).toBe("none");
});

test("allows the key to change through the inline editor", async ({ editor: page }) => {
   await page.locator("#previewKey").click();
   await page.locator("#previewKey select").selectOption("E");
   await expect(page.locator("#previewKey")).toHaveText("E");
});

test("opens PDF options without the desktop preview pane", async ({ editor: page }) => {
   await page.getByRole("button", { name: /export \.pdf/i }).click();
   const dialog = page.getByRole("dialog", { name: "PDF options" });
   await expect(dialog).toBeVisible();
   await expect(page.locator(".pdf-options-preview")).toBeHidden();
   await expect(page.locator(".pdf-options-panel")).toBeVisible();
   const overflow = await page.evaluate(
      () => document.querySelector(".pdf-options-dialog").scrollWidth - document.querySelector(".pdf-options-dialog").clientWidth,
   );
   expect(overflow).toBeLessThanOrEqual(1);
   await dialog.getByRole("button", { name: "Close PDF options" }).click();
   await expect(dialog).toBeHidden();
   await expect(page.locator("#previewViewport #previewCard")).toBeVisible();
});

test("stays within a 320px viewport", async ({ editor: page }) => {
   await page.setViewportSize({ width: 320, height: 800 });
   await page.reload();
   await expect(page.locator("#sectionsPreview .bar").first()).toBeVisible();
   await dismissDeviceHint(page);
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
