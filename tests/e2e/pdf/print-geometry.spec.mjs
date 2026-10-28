import { beat, expect, test } from "../fixtures/editor.mjs";

async function setMeter(page, value) {
   await page.locator("#previewMeter").click();
   await page.locator("#previewMeter select").selectOption(value);
}

async function usePrintLayout(page) {
   await page.emulateMedia({ media: "print" });
   await page.evaluate(() => document.documentElement.classList.add("is-print-layout"));
}

async function useScreenLayout(page) {
   await page.evaluate(() => document.documentElement.classList.remove("is-print-layout"));
   await page.emulateMedia({ media: "screen" });
}

test("1/4 meter keeps one beat per bar in print layout", async ({ editor: page }) => {
   await setMeter(page, "1/4");
   await expect(page.locator("#previewMeter")).toHaveText("1/4");
   await expect(page.locator(".drop-target")).toHaveCount(4);
   await expect(page.locator(".bar-caption").first()).toHaveText("1 bar · 4 beats");

   await usePrintLayout(page);
   const layout = await page.evaluate(() => {
      const bars = [...document.querySelectorAll("#previewCard .bar")];
      return {
         count: bars.length,
         beats: bars.map((bar) => bar.querySelectorAll(".beat-column").length),
         meter: document.querySelector("#previewMeter").textContent.trim(),
         widths: bars.map((bar) => Math.round(bar.getBoundingClientRect().width)),
      };
   });
   expect(layout.count).toBe(4);
   expect(layout.beats).toEqual([1, 1, 1, 1]);
   expect(layout.meter).toBe("1/4");
   expect(layout.widths.every((width) => width > 0)).toBe(true);
   await useScreenLayout(page);
});

test("rhythm markers follow their subdivision content width in print", async ({ editor: page }) => {
   await page.locator('[data-slot="1-0"]').click({ button: "right" });
   await page.getByRole("menuitem", { name: /half beat/i }).click();
   await page.locator('.sub-beat[data-slot="1-0:0"]').click({ button: "right" });
   await page.getByRole("menuitem", { name: /half beat/i }).click();

   await page.locator('[data-slot="1-2"]').click({ button: "right" });
   await page.getByRole("menuitem", { name: /triplet/i }).click();

   await page.locator('[data-slot="2-1"]').click({ button: "right" });
   await page.getByRole("menuitem", { name: /quarter beat/i }).click();

   await page.emulateMedia({ media: "print" });
   const geometry = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;visibility:hidden;width:var(--print-duration-inset)";
      document.body.appendChild(probe);
      const inset = probe.getBoundingClientRect().width;
      probe.remove();

      const regular = [...document.querySelectorAll(".beat-group:not(.has-nested-duration)")].map(
         (group) => ({
            duration: ["half", "triplet", "quarter"].find((value) =>
               group.classList.contains(`duration-${value}`),
            ),
            notes: group.querySelector(":scope > .sub-beats").getBoundingClientRect().width,
            line: group.querySelector(":scope > .duration-line").getBoundingClientRect().width,
            quarterLine:
               group.querySelector(":scope > .quarter-print-line")?.getBoundingClientRect().width ??
               null,
         }),
      );
      const nestedParents = [...document.querySelectorAll(".beat-group.has-nested-duration")].map(
         (group) => ({
            notes: group.querySelector(":scope > .sub-beats").getBoundingClientRect().width,
            line: group.querySelector(":scope > .duration-line").getBoundingClientRect().width,
         }),
      );
      const nestedChildren = [...document.querySelectorAll(".nested-beat-group")].map((group) => ({
         notes: group.querySelector(":scope > .nested-sub-beats").getBoundingClientRect().width,
         line: group.querySelector(":scope > .nested-duration-line").getBoundingClientRect().width,
      }));
      return { inset, regular, nestedParents, nestedChildren };
   });

   const insetTotal = geometry.inset * 2;
   expect(geometry.regular.length).toBeGreaterThan(0);
   for (const row of geometry.regular) {
      expect(Math.abs(row.line - (row.notes - insetTotal))).toBeLessThan(0.6);
      if (row.quarterLine !== null) {
         expect(Math.abs(row.quarterLine - (row.notes - insetTotal))).toBeLessThan(0.6);
      }
   }
   expect(geometry.regular.some((row) => row.duration === "triplet")).toBe(true);
   expect(geometry.nestedParents.length).toBe(1);
   expect(geometry.nestedChildren.length).toBe(1);
   for (const row of [...geometry.nestedParents, ...geometry.nestedChildren]) {
      expect(Math.abs(row.line - (row.notes - insetTotal))).toBeLessThan(0.6);
   }
   await page.emulateMedia({ media: "screen" });
});

test("export layout uses an outlined section title, enlarged footer, and no card frame", async ({
   editor: page,
}) => {
   await page.evaluate(() => document.documentElement.classList.add("is-print-layout"));
   const styles = await page.evaluate(() => {
      const title = document.querySelector(".section-title");
      const titleStyle = getComputedStyle(title);
      const signature = document.querySelector(".pdf-signature");
      const signatureStyle = getComputedStyle(signature);
      const cardStyle = getComputedStyle(document.querySelector("#previewCard"));
      return {
         titleDisplay: titleStyle.display,
         titleFontStyle: titleStyle.fontStyle,
         titleColor: titleStyle.color,
         titleBorderRadius: titleStyle.borderTopLeftRadius,
         titleBorderWidth: titleStyle.borderTopWidth,
         titleBackground: titleStyle.backgroundColor,
         titleFontSize: Number.parseFloat(titleStyle.fontSize),
         signatureFontSize: Number.parseFloat(signatureStyle.fontSize),
         cardShadow: cardStyle.boxShadow,
      };
   });

   expect(styles.titleDisplay).toBe("inline-block");
   expect(styles.titleFontStyle).toBe("italic");
   expect(Number.parseFloat(styles.titleBorderRadius)).toBe(6);
   expect(Number.parseFloat(styles.titleBorderWidth)).toBeGreaterThan(0.9);
   expect(Number.parseFloat(styles.titleBorderWidth)).toBeLessThan(1.2);
   expect(styles.titleColor).toBe("rgb(0, 0, 0)");
   expect(styles.titleBackground).toBe("rgba(0, 0, 0, 0)");
   expect(styles.titleFontSize).toBeGreaterThanOrEqual(14);
   expect(styles.signatureFontSize).toBeGreaterThanOrEqual(9);
   expect(styles.cardShadow).toBe("none");
   await page.evaluate(() => document.documentElement.classList.remove("is-print-layout"));
});
