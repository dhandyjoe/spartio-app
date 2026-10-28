import { readFile } from "node:fs/promises";
import { expect, test } from "../fixtures/editor.mjs";

test("exports a project as a .chordsheet.json download", async ({ editor: page }) => {
   const downloadPromise = page.waitForEvent("download");
   await page.evaluate(() => {
      window.__cloudDownloadSong({
         title: "Mobile Grace",
         meter: "3/4",
         format: "chord-sheet",
         version: 2,
         sections: [{ name: "Verse", beats: { "0-0": { chord: "C", duration: null } } }],
      });
   });

   const download = await downloadPromise;
   expect(download.suggestedFilename()).toBe("mobile-grace.chordsheet.json");
   const path = await download.path();
   expect(path).not.toBeNull();
   const data = JSON.parse(await readFile(path, "utf8"));
   expect(data.title).toBe("Mobile Grace");
   expect(data.meter).toBe("3/4");
   expect(Array.isArray(data.sections)).toBe(true);
   expect(data.sections[0].beats).toBeTruthy();
});

test("imports a project and restores its notation", async ({ editor: page }) => {
   const project = {
      format: "chord-sheet",
      version: 2,
      title: "Imported Song",
      artist: "Regression Artist",
      key: "F",
      chordRoot: "F",
      customChord: "F6/9",
      meter: "4/4",
      lyricsEnabled: true,
      sections: [
         {
            id: "imported",
            name: "Verse",
            lyricsEnabled: true,
            lyricBeats: {
               "0-0": "Sing",
               "0-1:1": "grace",
               "0-2:0": "through",
               "0-2:3": "night",
               "0-3:0": "for",
               "0-3:1": "me",
               "1-0:0.0": "nested",
               "1-0:0.1": "half",
               "1-1": "slash",
            },
            bars: 4,
            beats: {
               "0-0": { chord: "F", duration: null },
               "0-1": { chord: null, duration: "half" },
               "0-1:1": { chord: "2̇m", duration: null },
               "0-2": { chord: null, duration: "quarter" },
               "0-2:0": { chord: "1̇", duration: null },
               "0-2:3": { chord: "3̣", duration: null },
               "0-3": { chord: null, duration: "half" },
               "0-3:0": { chord: "4̇", duration: null },
               "0-3:1": { chord: "1̇", duration: null },
               "1-0": { chord: null, duration: "half" },
               "1-0:0": { chord: null, duration: "half" },
               "1-0:0.0": { chord: "4", duration: null },
               "1-0:0.1": { chord: "Gmaj7", duration: null },
               "1-0:1": { chord: "7", duration: null },
               "1-1": { chord: "C/F", duration: null },
            },
         },
      ],
      slashChords: ["F/A"],
      nashvilleNumber: "2̇",
      nashvilleAccidental: "",
   };

   await page.evaluate((value) => window.__cloudImportForTest(value), project);
   await expect(page.locator("#previewTitle")).toHaveText("Imported Song");
   await expect(page.locator(".section-title").first()).toHaveText("VERSE");

   const chords = await page.locator(".placed-chord").evaluateAll((elements) =>
      elements.map((element) => {
         const clone = element.cloneNode(true);
         clone.querySelector(".chord-remove")?.remove();
         return clone.textContent.replaceAll("●", "").trim();
      }),
   );
   for (const value of ["F", "2m", "1", "3", "4", "C/F", "Gmaj7", "7"]) {
      expect(chords).toContain(value);
   }

   const lyricEditor = page.locator(".lyric-editor").first();
   const lyric = lyricEditor.locator(".lyric-input");
   await expect(lyric).toHaveValue("Sing");
   await lyric.fill("Grace");
   await page.locator("#exportBtn").click();
   await expect(page.locator("#pdfOptionsModal")).toBeVisible();
   await expect(page.locator(".pdf-preview-page .lyric-print").first()).toHaveText("Grace");
   await page.locator("#pdfOptionsClose").click();
});
