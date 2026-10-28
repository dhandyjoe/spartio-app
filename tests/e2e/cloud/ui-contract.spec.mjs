import { expect, test } from "../fixtures/editor.mjs";
import { openLibrary } from "../fixtures/library.mjs";

test("home exposes the brand, tabs, and primary actions", async ({ editor: page }) => {
   await openLibrary(page);
   await expect(page.locator("#mySongsModal .home-brand")).toBeVisible();
   await expect(page.locator("#mySongsTitle")).toHaveText("My Songs");
   await expect(page.locator("#tabMySongs")).toHaveAttribute("aria-selected", "true");
   await expect(page.locator("#tabAlbums")).toBeVisible();
   await expect(page.locator("#themeToggle")).toBeVisible();
   await expect(page.locator("#accountBtn")).toBeVisible();
   await expect(page.locator("#newSongBtn")).toBeVisible();
   await expect(page.locator("#attachLinkBtn")).toBeVisible();
   await expect(page.locator("#songSearch")).toBeVisible();
   await expect(page.locator("#songFilterBtn")).toBeVisible();
   await expect(page.locator("#songSort")).toBeVisible();
   await expect(page.locator("#mySongsModal .library-table-head")).toBeVisible();
});

test("Albums switches the home actions without leaving the page", async ({ editor: page }) => {
   await openLibrary(page);
   await page.locator("#tabAlbums").click();
   await expect(page.locator("#tabAlbums")).toHaveAttribute("aria-selected", "true");
   await expect(page.locator("#albumsPanel")).toBeVisible();
   await expect(page.locator("#newAlbumBtn")).toBeVisible();
   await expect(page.locator("#joinAlbumBtn")).toBeVisible();
   await expect(page.locator("#newSongBtn")).toBeHidden();
   await expect(page.locator("#attachLinkBtn")).toBeHidden();

   await page.locator("#tabMySongs").click();
   await expect(page.locator("#tabMySongs")).toHaveAttribute("aria-selected", "true");
   await expect(page.locator("#newSongBtn")).toBeVisible();
   await expect(page.locator("#attachLinkBtn")).toBeVisible();
});

test("song rows expose the index actions", async ({ editor: page }) => {
   await openLibrary(page);
   const row = page.locator(".song-card").first();
   await expect(row).toBeVisible();
   await expect(row.locator(".song-card-open")).toHaveText("Open");
   await expect(row.locator(".song-row-menu-trigger")).toHaveAttribute("aria-label", /Actions for/);

   await row.locator(".song-row-menu-trigger").click();
   const menu = row.locator(".song-row-menu-items");
   await expect(menu).toBeVisible();
   await expect(menu.locator("[data-act]")).toHaveCount(5);
   await expect(menu.locator("[data-act]")).toHaveText([
      "Open song",
      "Export PDF",
      "Copy Link",
      "Duplicate",
      "Delete",
   ]);
});

test("New Song opens with three writing modes and requires a mode", async ({ editor: page }) => {
   await openLibrary(page);
   await page.locator("#newSongBtn").click();
   const dialog = page.locator("#newSongDialog");
   await expect(dialog).toBeVisible();
   await expect(page.locator("#newSongVersionName")).toHaveValue("Version 1");
   await expect(page.locator(".mode-card")).toHaveCount(3);
   await expect(page.locator("#newSongCreateBtn")).toBeDisabled();

   await page.locator("#modeCardChords").click();
   await expect(page.locator("#modeCardChords")).toHaveAttribute("aria-pressed", "true");
   await expect(page.locator("#newSongCreateBtn")).toBeEnabled();

   await page.locator("#newSongClose").click();
   await expect(dialog).toBeHidden();
});

test("Attach Link opens a dialog and enables Preview after input", async ({ editor: page }) => {
   await openLibrary(page);
   await page.locator("#attachLinkBtn").click();
   const dialog = page.locator("#attachLinkDialog");
   await expect(dialog).toBeVisible();
   await expect(page.locator("#attachLinkConfirm")).toBeDisabled();

   await page.locator("#attachLinkInput").fill("https://example.test/share");
   await expect(page.locator("#attachLinkConfirm")).toBeEnabled();
   await page.locator("#attachLinkCancel").click();
   await expect(dialog).toBeHidden();
});

test("the theme toggle flips the document theme", async ({ editor: page }) => {
   await openLibrary(page);
   const initial = await page.locator("html").getAttribute("data-theme");
   await page.locator("#themeToggle").click();
   await expect(page.locator("html")).not.toHaveAttribute("data-theme", initial);
   await page.locator("#themeToggle").click();
   await expect(page.locator("html")).toHaveAttribute("data-theme", initial);
});

test("home locks page scroll and the editor restores it", async ({ editor: page }) => {
   await openLibrary(page);
   const home = await page.evaluate(() => ({
      screen: document.documentElement.dataset.screen,
      html: getComputedStyle(document.documentElement).overflowY,
      body: getComputedStyle(document.body).overflowY,
   }));
   expect(home.screen).toBe("home");
   expect(home.html).toBe("hidden");
   expect(home.body).toBe("hidden");

   await page.evaluate(() => {
      location.hash = "#/song/new";
   });
   await expect(page.locator("html")).toHaveAttribute("data-screen", "editor");
   const editor = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overflowY,
      body: getComputedStyle(document.body).overflowY,
   }));
   expect(editor.html).not.toBe("hidden");
   expect(editor.body).not.toBe("hidden");
});

test("the signed-out account button opens the login page", async ({ editor: page }) => {
   await openLibrary(page);
   await page.locator("#accountBtn").click();
   const login = page.locator("#loginPage");
   await expect(login).toBeVisible();
   await expect(page.locator("html")).toHaveAttribute("data-auth-gate", "login");
   await expect(page.locator("#googleSignInBtn")).toBeVisible();
   await expect(page.locator("#authEmail")).toBeVisible();
   await expect(page.locator("#authPassword")).toBeVisible();
   await expect(page.locator("#emailSignUpBtn")).toBeVisible();
   await expect(page.locator("#loginPage .login-aside")).toBeVisible();
});

test("album detail header keeps Back, tabs and profile in one bar", async ({ editor: page }) => {
   await page.evaluate(() => {
      const library = document.querySelector("#mySongsModal");
      library.setAttribute("hidden", "");
      library.classList.remove("is-open");
      const modal = document.querySelector("#albumModal");
      modal.removeAttribute("hidden");
      modal.classList.add("is-open");
      document.documentElement.dataset.screen = "album-detail";
   });

   await expect(page.locator("#albumBackBtn")).toBeVisible();
   await expect(page.locator("#albumTabMySongs")).toBeVisible();
   await expect(page.locator("#albumTabAlbums")).toHaveAttribute("aria-current", "page");
   await expect(page.locator("#albumAccountBtn")).toBeVisible();
   await expect(page.locator("#albumThemeToggle")).toHaveCount(0);

   const positions = await page.evaluate(() => {
      const box = (selector) => {
         const rect = document.querySelector(selector).getBoundingClientRect();
         return { left: rect.left, right: rect.right, top: rect.top };
      };
      return {
         back: box("#albumBackBtn"),
         tabs: box(".album-detail-tabs"),
         profile: box("#albumAccountBtn"),
         inner: box(".album-detail-topbar-inner"),
      };
   });
   expect(positions.back.left).toBeLessThan(positions.tabs.left);
   expect(positions.profile.right).toBeGreaterThan(positions.tabs.right);
   expect(positions.profile.right).toBeLessThanOrEqual(positions.inner.right);
   expect(positions.back.top).toBeLessThan(positions.tabs.top + 20);
   expect(positions.profile.top).toBeLessThan(positions.tabs.top + 20);

   const layout = await page.evaluate(() => {
      const measure = (selector) => {
         const element = document.querySelector(selector);
         const box = element.getBoundingClientRect();
         const style = getComputedStyle(element);
         return {
            display: style.display,
            minHeight: style.minHeight,
            width: box.width,
            gridTemplateColumns: style.gridTemplateColumns,
         };
      };
      return {
         head: measure(".cloud-album-head"),
         body: measure(".cloud-album-body"),
         actions: measure(".album-detail-actions"),
      };
   });
   expect(layout.head.display).toBe("block");
   expect(layout.head.minHeight).toBe("56px");
   expect(layout.body.width).toBeGreaterThan(1240);
   expect(layout.actions.display).toBe("grid");
   expect(layout.actions.gridTemplateColumns.split(" ")).toHaveLength(2);
});

test("the invite code copies from the whole pill without opening the album", async ({ editor: page }) => {
   await openLibrary(page);
   await page.locator("#tabAlbums").click();
   await page.evaluate(() => {
      window.__copiedInviteCode = "";
      Object.defineProperty(navigator, "clipboard", {
         configurable: true,
         value: {
            writeText: async (value) => {
               window.__copiedInviteCode = value;
            },
         },
      });
      document.querySelector("#albumsGalleryCards").innerHTML = `
         <article class="album-index-card" role="listitem" tabindex="0" data-album-id="test-album" aria-label="Open album Test">
            <div class="album-index-head">
               <span class="album-index-role is-md"><span class="album-index-role-dot"></span>MD</span>
               <button class="album-index-code" type="button" data-act="copy-code" data-code="ABCD-1234"
                  aria-label="Copy invite code ABCD-1234" title="Copy invite code ABCD-1234">
                  <span class="album-index-code-label">Code</span>
                  <span class="album-index-code-value">ABCD-1234</span>
                  <span class="album-index-code-copy" aria-hidden="true">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </span>
               </button>
            </div>
         </article>`;
   });

   const code = page.locator("#albumsGalleryCards .album-index-code");
   await expect(code).toBeVisible();
   const hashBefore = await page.evaluate(() => location.hash);
   await code.click();
   await expect(code).toHaveClass(/is-copied/);
   expect(await page.evaluate(() => window.__copiedInviteCode)).toBe("ABCD-1234");
   expect(await page.evaluate(() => location.hash)).toBe(hashBefore);
});

test("the members dialog closes with Escape", async ({ editor: page }) => {
   await page.evaluate(() => {
      const library = document.querySelector("#mySongsModal");
      library.setAttribute("hidden", "");
      library.classList.remove("is-open");
      const modal = document.querySelector("#albumModal");
      modal.removeAttribute("hidden");
      modal.classList.add("is-open");
      document.documentElement.dataset.screen = "album-detail";
      const members = document.querySelector("#albumMembersDialog");
      members.hidden = false;
      members.classList.add("is-open");
   });

   const members = page.locator("#albumMembersDialog");
   await expect(members).toBeVisible();
   await page.keyboard.press("Escape");
   await expect(members).toBeHidden();
});

test("album detail keeps the column names pinned while the list scrolls", async ({ editor: page }) => {
   await page.evaluate(() => {
      const library = document.querySelector("#mySongsModal");
      library.setAttribute("hidden", "");
      library.classList.remove("is-open");
      const modal = document.querySelector("#albumModal");
      modal.removeAttribute("hidden");
      modal.classList.add("is-open");
      document.documentElement.dataset.screen = "album-detail";
      document.querySelector("#albumSongCards").innerHTML = Array.from(
         { length: 32 },
         (_, index) => `<article class="song-card library-song-row is-index-row is-chords" role="listitem" tabindex="0">
            <span class="song-card-identity"><span class="song-card-title">Song ${index + 1}</span></span>
         </article>`,
      ).join("");
   });

   const metrics = await page.evaluate(() => {
      const body = document.querySelector(".cloud-album-body");
      const head = document.querySelector(".album-detail-tablehead");
      body.scrollTop = 0;
      const before = {
         bodyTop: body.getBoundingClientRect().top,
         headTop: head.getBoundingClientRect().top,
         scrollHeight: body.scrollHeight,
         clientHeight: body.clientHeight,
      };
      body.scrollTop = 640;
      const after = {
         bodyTop: body.getBoundingClientRect().top,
         headTop: head.getBoundingClientRect().top,
         scrollTop: body.scrollTop,
      };
      return { before, after };
   });

   expect(metrics.before.scrollHeight).toBeGreaterThan(metrics.before.clientHeight);
   expect(metrics.after.scrollTop).toBeGreaterThan(0);
   expect(Math.abs(metrics.after.headTop - metrics.after.bodyTop)).toBeLessThan(1);
});

test("album search matches My Songs and focuses with /", async ({ editor: page }) => {
   await page.evaluate(() => {
      const library = document.querySelector("#mySongsModal");
      library.setAttribute("hidden", "");
      library.classList.remove("is-open");
      const modal = document.querySelector("#albumModal");
      modal.removeAttribute("hidden");
      modal.classList.add("is-open");
      document.documentElement.dataset.screen = "album-detail";
      for (const id of ["albumNewSongBtn", "albumAddFromBtn", "albumLeaveBtn"]) {
         document.querySelector(`#${id}`).hidden = false;
      }
   });

   const theme = await page.evaluate(() => {
      const read = (selector) => {
         const style = getComputedStyle(document.querySelector(selector));
         return {
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            borderRadius: style.borderRadius,
            fontSize: style.fontSize,
            padding: style.padding,
         };
      };
      return { album: read("#albumSongSearch"), songs: read("#songSearch") };
   });
   expect(theme.album).toEqual(theme.songs);
   await expect(page.locator(".album-song-search .library-search-kbd")).toBeVisible();

   await page.evaluate(() => document.activeElement?.blur());
   await page.keyboard.press("/");
   await expect(page.locator("#albumSongSearch")).toBeFocused();
   await page.keyboard.type("way");
   await expect(page.locator("#albumSongSearch")).toHaveValue("way");
   await expect(page.locator(".album-song-search .library-search-kbd")).toBeHidden();
   await page.keyboard.press("Escape");
   await expect(page.locator("#albumSongSearch")).toHaveValue("");

   const buttons = await page.evaluate(() =>
      [...document.querySelectorAll(".album-detail-actions .button")].map((button) => {
         const style = getComputedStyle(button);
         return {
            alignItems: style.alignItems,
            display: style.display,
            justifyContent: style.justifyContent,
         };
      }),
   );
   expect(buttons).toHaveLength(3);
   for (const button of buttons) {
      expect(button.display).toBe("flex");
      expect(button.alignItems).toBe("center");
      expect(button.justifyContent).toBe("center");
   }
});
