// fermataEditor.js — a tiny floating "how many extra beats?" popover for a fermata.
//
// UI-only module: it owns ONE popover element and its interaction, and delegates the
// committed value to the caller via onCommit — so it stays free of app state and the
// dependency graph stays acyclic (events.js drives state + rendering), exactly like
// chordEditor.js / beatMenu.js.
//
// Behaviour (agreed 2026-10):
//  • A number input (1..MAX_FERMATA) with − / + steppers and a live hint sentence.
//  • Enter or "Apply" commits; Esc / outside-click / scroll / resize cancels.
//  • The value is the number of EXTRA beats the note is held — a PLAYBACK-ONLY mark;
//    the score (and the PDF) simply draws the fermata glyph.
import { MAX_FERMATA } from "./notation.js?v=__BUILD__";

const MIN = 1;

let popover = null;
let inputEl = null;
let hintEl = null;
let ctx = null; // { anchor, onCommit }
let outsideBound = false;

export function isFermataEditorOpen() {
   return !!popover && !popover.hidden;
}

function clamp(value) {
   const n = Math.trunc(Number(value));
   if (!Number.isFinite(n)) return MIN;
   return Math.min(MAX_FERMATA, Math.max(MIN, n));
}

function ensurePopover() {
   if (popover) return;
   popover = document.createElement("div");
   popover.className = "fermata-popover";
   popover.hidden = true;
   popover.setAttribute("role", "dialog");
   popover.setAttribute("aria-label", "Fermata hold");
   popover.innerHTML = `
      <div class="fermata-popover-head">
         <span class="fermata-popover-badge" aria-hidden="true">
            <svg viewBox="0 0 20 18" focusable="false"><path d="M2.5 7 A 8 6 0 0 1 17.5 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="10" cy="12.4" r="2.2" fill="currentColor"/></svg>
         </span>
         <div class="fermata-popover-titles">
            <p class="fermata-popover-title">Fermata</p>
            <p class="fermata-popover-sub">Hold before the next beat</p>
         </div>
      </div>
      <div class="fermata-popover-row">
         <button type="button" class="fermata-step" data-step="-1" aria-label="Fewer beats">−</button>
         <input class="fermata-popover-input" type="number" inputmode="numeric" min="${MIN}" max="${MAX_FERMATA}" step="1" value="1" autocomplete="off" spellcheck="false" aria-label="Extra beats" />
         <button type="button" class="fermata-step" data-step="1" aria-label="More beats">+</button>
         <span class="fermata-popover-unit">beats</span>
      </div>
      <p class="fermata-popover-hint"></p>
      <div class="fermata-popover-actions">
         <button type="button" class="fermata-popover-cancel">Cancel</button>
         <button type="button" class="fermata-popover-apply">Apply</button>
      </div>`;
   document.body.appendChild(popover);
   inputEl = popover.querySelector(".fermata-popover-input");
   hintEl = popover.querySelector(".fermata-popover-hint");
   popover.querySelectorAll(".fermata-step").forEach((btn) =>
      btn.addEventListener("click", () => {
         inputEl.value = String(clamp(Number(inputEl.value) + Number(btn.dataset.step)));
         refreshHint();
         inputEl.focus();
      }),
   );
   inputEl.addEventListener("input", refreshHint);
   inputEl.addEventListener("keydown", onKeydown);
   popover.querySelector(".fermata-popover-apply").addEventListener("click", commit);
   popover.querySelector(".fermata-popover-cancel").addEventListener("click", closeFermataEditor);
   // Clicks inside the popover must not reach the outside-close handler (which runs
   // in the capture phase, before this).
   popover.addEventListener("pointerdown", (event) => event.stopPropagation());
}

function refreshHint() {
   const n = clamp(inputEl.value);
   hintEl.textContent = `The note is held ${n} extra beat${n === 1 ? "" : "s"}.`;
}

function commit() {
   const value = clamp(inputEl.value);
   const onCommit = ctx?.onCommit;
   closeFermataEditor();
   onCommit?.(value);
}

function onKeydown(event) {
   switch (event.key) {
      case "Enter":
         event.preventDefault();
         commit();
         break;
      case "Escape":
         event.preventDefault();
         closeFermataEditor();
         break;
      case "ArrowUp":
         event.preventDefault();
         inputEl.value = String(clamp(Number(inputEl.value) + 1));
         refreshHint();
         break;
      case "ArrowDown":
         event.preventDefault();
         inputEl.value = String(clamp(Number(inputEl.value) - 1));
         refreshHint();
         break;
   }
}

function bindOutside() {
   if (outsideBound) return;
   outsideBound = true;
   document.addEventListener("pointerdown", onOutside, true);
   window.addEventListener("scroll", closeFermataEditor, true);
   window.addEventListener("resize", closeFermataEditor, true);
}
function unbindOutside() {
   if (!outsideBound) return;
   outsideBound = false;
   document.removeEventListener("pointerdown", onOutside, true);
   window.removeEventListener("scroll", closeFermataEditor, true);
   window.removeEventListener("resize", closeFermataEditor, true);
}
function onOutside(event) {
   if (popover && !popover.hidden && !popover.contains(event.target)) closeFermataEditor();
}

function position() {
   const rect = ctx.anchor.getBoundingClientRect();
   // Measure after making it visible.
   popover.style.visibility = "hidden";
   popover.hidden = false;
   const pw = popover.offsetWidth;
   const ph = popover.offsetHeight;
   const gap = 10;
   const vw = window.innerWidth;
   const vh = window.innerHeight;
   // Horizontally centre on the beat, clamped to the viewport with an 8px inset.
   let left = rect.left + rect.width / 2 - pw / 2;
   left = Math.max(8, Math.min(left, vw - pw - 8));
   // Prefer above the beat; fall back to below if there is not enough room.
   let top = rect.top - ph - gap;
   popover.classList.remove("is-below");
   if (top < 8) {
      top = rect.bottom + gap;
      popover.classList.add("is-below");
      if (top + ph > vh - 8) top = Math.max(8, vh - ph - 8);
   }
   popover.style.left = `${Math.round(left)}px`;
   popover.style.top = `${Math.round(top)}px`;
   // Arrow points at the beat centre, clamped within the popover width.
   const arrowX = Math.max(14, Math.min(rect.left + rect.width / 2 - left, pw - 14));
   popover.style.setProperty("--arrow-x", `${Math.round(arrowX)}px`);
   popover.style.visibility = "";
}

/**
 * Open the fermata popover anchored to a beat element.
 * @param {object} opts
 * @param {HTMLElement} opts.anchor - the beat/sub-beat element to anchor to.
 * @param {number} [opts.initialValue] - current extra-beat count (defaults to 1).
 * @param {(value:number)=>void} opts.onCommit - called with the chosen extra beats.
 */
export function openFermataEditor({ anchor, initialValue, onCommit }) {
   ensurePopover();
   ctx = { anchor, onCommit };
   inputEl.value = String(clamp(initialValue ?? MIN));
   refreshHint();
   position();
   bindOutside();
   inputEl.focus();
   inputEl.select();
}

export function closeFermataEditor() {
   if (!popover || popover.hidden) return;
   popover.hidden = true;
   unbindOutside();
   ctx = null;
}
