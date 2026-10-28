import { expect } from "./editor.mjs";

export const librarySongs = [
   { cloudId: "g1", title: "Goodness of God", artist: "Bethel Music", latestKey: "A♭", latestMeter: "4/4", latestBPM: 68, latestEditorMode: "chords", latestVersionLabel: "Sunday Lead", latestYoutubeId: "dQw4w9WgXcQ", versionCount: 2, updatedAt: Date.now() - 2 * 3600e3 },
   { cloudId: "g2", title: "Way Maker", artist: "Sinach / Leeland", latestKey: "E", latestMeter: "4/4", latestBPM: 68, latestEditorMode: "numbers", latestVersionLabel: "Nashville Standard", latestYoutubeId: "", versionCount: 1, updatedAt: Date.now() - 26 * 3600e3 },
   { cloudId: "g3", title: "Reckless Love", artist: "Cory Asbury", latestKey: "F♯m", latestMeter: "6/8", latestEditorMode: "chordpro", latestVersionLabel: "Acoustic with Bridge Tag", latestYoutubeId: "dQw4w9WgXcQ", versionCount: 3, updatedAt: Date.now() - 3 * 86400e3 },
   { cloudId: "g4", title: "King of Kings", artist: "Hillsong Worship", latestKey: "D", latestMeter: "4/4", latestBPM: 68, latestEditorMode: "chords", latestVersionLabel: "Full Arrangement", latestYoutubeId: "", versionCount: 1, updatedAt: Date.now() - 5 * 86400e3 },
   { cloudId: "g5", title: "10,000 Reasons", artist: "Matt Redman", latestKey: "G", latestMeter: "4/4", latestBPM: 68, latestEditorMode: "numbers", latestVersionLabel: "Youth Arrangement", latestYoutubeId: "dQw4w9WgXcQ", versionCount: 1, updatedAt: Date.now() - 7 * 86400e3 },
   { cloudId: "g6", title: "Living Hope", artist: "Phil Wickham", latestKey: "E♭", latestMeter: "4/4", latestBPM: 68, latestEditorMode: "chordpro", latestVersionLabel: "Band Cut", latestYoutubeId: "", versionCount: 2, updatedAt: Date.now() - 14 * 86400e3 },
];

export async function openLibrary(page, songs = librarySongs) {
   await page.evaluate(() => {
      location.hash = "#/songs";
   });
   await expect(page.locator("#mySongsModal")).toBeVisible();
   await page.waitForFunction(() => {
      const track = document.querySelector("#songCards");
      return !!track && track.dataset.skeleton !== "1";
   });
   await page.evaluate((rows) => window.__cloudSetSongs(rows), songs);
   await expect(page.locator(".song-card")).toHaveCount(songs.length);
}
