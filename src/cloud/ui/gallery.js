import { $ } from "../../core/dom.js?v=__BUILD__";
import { cardMarkup, libraryModeIcon } from "./markup.js?v=__BUILD__";

let renderedCount = 0; // how many cards are currently in the DOM

export function setGalleryState(state) {
   // state: "loading" | "skeleton" | "empty" | "no-results" | "error" | "ready"
   $("#galleryLoading").hidden = state !== "loading";
   $("#galleryEmpty").hidden = state !== "empty";
   $("#galleryNoResults").hidden = state !== "no-results";
   $("#galleryError").hidden = state !== "error";
}

// Skeleton rows are aria-hidden; a small polite status carries the same news
// to assistive tech without putting list-item roles on placeholders.
export function setLoadStatus(id, text) {
   const el = document.getElementById(id);
   if (el) el.textContent = text;
}

// Keep the middle columns sharp and blur cards the further they sit from the
// horizontal center of the viewport. Cards within the clear middle band stay
// crisp; by roughly the 4th column out they are fully blurred. Called on
// render, on scroll, and on resize, so it tracks the cards as they move.
const CLEAR_BAND = 240; // px each side of center that stays fully sharp
const BLUR_SPAN = 320; // px beyond the clear band over which blur ramps to max
export function updateEdgeBlur() {
   const track = $("#songCards");
   if (!track) return;
   const cards = track.querySelectorAll(".song-card");
   renderedCount = cards.length;
   cards.forEach((card) => {
      card.style.removeProperty("--blur");
      card.style.removeProperty("--scale");
      card.style.removeProperty("opacity");
      card.classList.remove("is-dim", "is-selected");
      card.setAttribute("aria-hidden", "false");
      card.tabIndex = 0;
   });
}

// Scroll the grid by roughly one column-pair in the given direction. Uses a
// timer-based tween (native "smooth" behavior and rAF are unreliable in
// headless test browsers) and refreshes edge blur + nudge visibility as it
// moves.
let scrollTimer = 0;
export function nudgeCarousel(dir) {
   const track = $("#songCards");
   if (!track) return;
   const card = track.querySelector(".song-card");
   const cardW = card ? card.offsetWidth : 210;
   const step = (cardW + 28) * 1.4; // ~one column plus gap
   const max = track.scrollWidth - track.clientWidth;
   const from = track.scrollLeft;
   const to = Math.max(0, Math.min(max, from + dir * step));
   if (scrollTimer) clearInterval(scrollTimer);
   const start = Date.now();
   const dur = 300;
   const easeOut = (t) => 1 - Math.pow(1 - t, 3);
   scrollTimer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / dur);
      track.scrollLeft = from + (to - from) * easeOut(t);
      updateEdgeBlur();
      updateNudgeVisibility();
      if (t >= 1) {
         clearInterval(scrollTimer);
         scrollTimer = 0;
      }
   }, 16);
}

export function renderCards(songs) {
   const track = $("#songCards");
   if (!track) return;
   track.innerHTML = songs.map((song) => cardMarkup(song)).join("");
   track.removeAttribute("aria-busy");
   delete track.dataset.skeleton;
   track.scrollLeft = 0;
   renderedCount = track.querySelectorAll(".song-card").length;
   updateEdgeBlur();
   updateNudgeVisibility();
}

export function updateNudgeVisibility() {
   const prev = $("#galleryPrev");
   const next = $("#galleryNext");
   const track = $("#songCards");
   if (!prev || !next || !track) return;
   const overflow = track.scrollWidth - track.clientWidth;
   const many = overflow > 4;
   const atStart = track.scrollLeft <= 2;
   const atEnd = track.scrollLeft >= overflow - 2;
   prev.hidden = !many || atStart;
   next.hidden = !many || atEnd;
}

// Delegated thumbnail lifecycle: fade a loaded cover in, and repaint a failed
// one as its motif fallback (covers the offline case — i.ytimg.com is
// cross-origin, so the service worker never caches it). Capture-phase document
// listeners so no per-image handler markup is needed.
document.addEventListener(
   "load",
   (event) => {
      const img = event.target;
      if (img?.classList?.contains("song-card-cover-img")) img.classList.add("is-loaded");
   },
   true,
);
document.addEventListener(
   "error",
   (event) => {
      const img = event.target;
      if (!img?.classList?.contains("song-card-cover-img")) return;
      img.hidden = true; // no broken-image glyph
      img.closest(".song-card-cover")?.classList.add("is-fallback");
      // Reuse the motif glyph inside a failed photo cover so the fallback
      // carries the same notation identity as a native motif cover.
      const card = img.closest(".song-card");
      const mode = ["chords", "numbers", "chordpro"].find((m) => card?.classList.contains(`is-${m}`));
      if (card && mode && !img.previousElementSibling) {
         img.insertAdjacentHTML(
            "beforebegin",
            libraryModeIcon(mode, "song-card-mode-mark song-card-mode-icon"),
         );
      }
   },
   true,
);
