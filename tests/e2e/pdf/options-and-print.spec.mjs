import { expect, test } from "../fixtures/editor.mjs";

async function openPdfOptions(page) {
   await page.getByRole("button", { name: /export \.pdf/i }).click();
   const dialog = page.getByRole("dialog", { name: "PDF options" });
   await expect(dialog).toBeVisible();
   return dialog;
}

test("adopts the real score card and restores it on close", async ({ editor: page }) => {
   const dialog = await openPdfOptions(page);
   await expect(page.locator(".pdf-preview-page #previewCard")).toBeVisible();
   await expect(page.locator(".pdf-preview-page #previewCard")).toHaveCSS("pointer-events", "none");
   await expect(page.locator(".pdf-preview-page #previewCard .pdf-signature")).toBeHidden();
   await expect(page.locator(".pdf-page-label")).toHaveCount(0);
   const active = page.locator(".pdf-preview-page #previewCard .preview-section.is-active");
   if (await active.count()) {
      const background = await active.evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(background);
   }
   await expect(page.locator(".pdf-preview-page #previewCard .bar.pdf-mid-bar").first()).toBeVisible();
   await expect(page.locator('[data-paper="letter"]')).toHaveCount(0);
   const guide = await page.evaluate(
      () => getComputedStyle(document.querySelector(".pdf-preview-page"), "::after").backgroundImage,
   );
   expect(guide).toBe("none");
   await page.locator("#pdfOptionsReset").click();
   const resetWidth = await page.evaluate(() => document.querySelector(".pdf-preview-page").offsetWidth);
   const a4Width = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;visibility:hidden;width:210mm";
      document.body.appendChild(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
   });
   expect(Math.abs(resetWidth - a4Width)).toBeLessThanOrEqual(2);

   await dialog.getByRole("button", { name: "Close PDF options" }).click();
   await expect(dialog).toBeHidden();
   await expect(page.locator("#previewViewport #previewCard")).toBeVisible();
   await expect(page.locator("#previewCard .bar.pdf-mid-bar")).toHaveCount(0);
});

test("uses A4 paper and the A4 printable content width", async ({ editor: page }) => {
   await openPdfOptions(page);
   const sizes = await page.evaluate(() => {
      const probe = (width) => {
         const element = document.createElement("div");
         element.style.cssText = `position:absolute;visibility:hidden;width:${width}`;
         document.body.appendChild(element);
         const value = element.getBoundingClientRect().width;
         element.remove();
         return value;
      };
      return {
         paper: document.querySelector(".pdf-preview-page").offsetWidth,
         content: document.querySelector(".pdf-preview-page #previewCard").clientWidth,
         a4: probe("210mm"),
         printable: probe("196mm"),
      };
   });
   expect(Math.abs(sizes.paper - sizes.a4)).toBeLessThanOrEqual(2);
   expect(Math.abs(sizes.content - sizes.printable)).toBeLessThanOrEqual(2);
});

test("renders print bar boundaries and a real PDF", async ({ editor: page }) => {
   await page.emulateMedia({ media: "print" });
   const print = await page.evaluate(() => {
      const bar = document.querySelector(".bar");
      const before = getComputedStyle(bar, "::before");
      const after = getComputedStyle(bar, "::after");
      const signature = document.querySelector(".pdf-signature");
      return {
         before: before.content,
         after: after.content,
         beforeHeight: before.height,
         afterHeight: after.height,
         signature: signature ? getComputedStyle(signature).display : "missing",
      };
   });
   expect(print.before).not.toBe("none");
   expect(print.after).not.toBe("none");
   expect(Math.abs(Number.parseFloat(print.beforeHeight) - 42)).toBeLessThan(0.1);
   expect(Math.abs(Number.parseFloat(print.afterHeight) - 42)).toBeLessThan(0.1);
   expect(print.signature).not.toBe("none");

   const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
   expect(pdf.byteLength).toBeGreaterThan(1000);
   await page.emulateMedia({ media: "screen" });
});
