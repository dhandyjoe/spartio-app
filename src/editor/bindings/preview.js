import {
   barHasContent,
   beatValue,
   collapseChordAbove,
   fermataValue,
   lyricValue,
   removeBar,
   restoreCollapsedBeat,
   setChordAbove,
   setLyric,
} from "../../notation/notation.js?v=__BUILD__";
import { $, prefersTap, toast } from "../../core/dom.js?v=__BUILD__";
import { getState, findSection, getSelectedPaletteItem } from "../../core/store.js?v=__BUILD__";
import { hasClipboard } from "../../core/clipboard.js?v=__BUILD__";
import { isChordEditorOpen } from "../chordEditor.js?v=__BUILD__";
import { renderPreview } from "../../render/render.js?v=__BUILD__";

export function bindPreview({
   applyReadOnlyAffordances,
   beginBarSelection,
   blockedForEdit,
   cancelBarSelection,
   clearPaletteSelection,
   copyBar,
   copySection,
   copySelectedBars,
   flashDropTarget,
   getBarSelection,
   handleBarSelectionClick,
   insertSectionAfter,
   isSelectionActiveFor,
   memberReadOnly,
   openBeatEditor,
   openChordAboveEditor,
   openRhythmMenu,
   pasteBar,
   pasteSection,
   placePaletteItem,
   save,
   scoreUnit,
   syncEditor,
}) {
   const state = getState();
   document.querySelectorAll(".drop-target").forEach((beat) => {
      beat.addEventListener("dragover", (event) => {
         event.preventDefault();
         event.dataTransfer.dropEffect = "copy";
         beat.classList.add("dragover");
      });
      beat.addEventListener("dragleave", () => beat.classList.remove("dragover"));
      beat.addEventListener("drop", (event) => {
         event.preventDefault();
         // Dropping a chord onto a beat is an arrangement edit.
         if (blockedForEdit()) {
            event.stopPropagation();
            beat.classList.remove("dragover");
            document.body.classList.remove("is-dragging");
            return;
         }
         event.stopPropagation();
         let item;
         try {
            item = JSON.parse(event.dataTransfer.getData("application/chord-sheet"));
         } catch {}
         const section = findSection(beat.dataset.section),
            slot = beat.dataset.slot;
         beat.classList.remove("dragover");
         document.body.classList.remove("is-dragging");
         if (!placePaletteItem(section, beat, item)) return;
         syncEditor();
         renderPreview();
         save();
         flashDropTarget(section.id, slot);
      });
      // Long-press bookkeeping (declared before the click handler so it can honor
      // the suppression window a just-fired long-press sets up).
      let pressTimer = null;
      let pressPoint = null;
      let suppressClickUntil = 0;
      const cancelPress = () => {
         if (pressTimer) clearTimeout(pressTimer);
         pressTimer = null;
      };
      beat.addEventListener("click", (event) => {
         if (event.target.closest(".placed-chord,.duration-line,.nested-duration-line,.lyric-input")) return;
         // On touch, lifting the finger after a long-press emits a synthetic
         // click on the beat. Without this guard it would open the chord editor
         // right on top of the rhythm menu the long-press just opened.
         if (Date.now() < suppressClickUntil) {
            suppressClickUntil = 0;
            event.stopPropagation();
            return;
         }
         // Multi-bar selection mode intercept.
         if (isSelectionActiveFor(beat.dataset.section)) {
            const barEl = beat.closest(".bar");
            const bar = Number(barEl?.dataset.bar);
            if (!Number.isNaN(bar)) {
               handleBarSelectionClick(beat.dataset.section, bar);
            }
            event.stopPropagation();
            return;
         }
         // Members cannot place/replace chords from the palette nor type them.
         if (blockedForEdit()) {
            event.stopPropagation();
            return;
         }
         // Normal beat click flow.
         const selectedItem = getSelectedPaletteItem();
         // Legacy palette flow (arrangement tools) still works when an item is
         // selected. Otherwise, clicking an empty beat opens the inline editor.
         if (selectedItem) {
            event.stopPropagation();
            const section = findSection(beat.dataset.section),
               slot = beat.dataset.slot;
            if (!placePaletteItem(section, beat, selectedItem)) return;
            if (prefersTap()) clearPaletteSelection();
            syncEditor();
            renderPreview();
            save();
            flashDropTarget(section.id, slot);
            return;
         }
         event.stopPropagation();
         openBeatEditor(beat, { selectQuery: false });
      });

      // Rhythm context menu: right-click (desktop) + long-press (touch).
      beat.addEventListener("contextmenu", (event) => {
         event.preventDefault();
         event.stopPropagation();
         openRhythmMenu(beat, event.clientX, event.clientY);
      });
      beat.addEventListener(
         "touchstart",
         (event) => {
            if (event.touches.length !== 1) return;
            const touch = event.touches[0];
            pressPoint = { x: touch.clientX, y: touch.clientY };
            cancelPress();
            pressTimer = setTimeout(() => {
               pressTimer = null;
               // Arm the guard so the trailing synthetic click (on finger lift)
               // is swallowed and doesn't open the chord editor over the menu.
               suppressClickUntil = Date.now() + 900;
               openRhythmMenu(beat, pressPoint.x, pressPoint.y);
            }, 500);
         },
         { passive: true },
      );
      beat.addEventListener(
         "touchmove",
         (event) => {
            if (!pressPoint || !event.touches.length) return;
            const touch = event.touches[0];
            if (Math.hypot(touch.clientX - pressPoint.x, touch.clientY - pressPoint.y) > 10) cancelPress();
         },
         { passive: true },
      );
      // If the long-press already fired, keep the click-suppression window alive
      // (touchend arrives right before the synthetic click). A normal short tap
      // clears nothing — its click proceeds and opens the chord editor.
      beat.addEventListener("touchend", cancelPress, { passive: true });
      beat.addEventListener("touchcancel", cancelPress, { passive: true });
   });
   document.querySelectorAll(".placed-chord").forEach((chord) => {
      const removeOrReplace = (event) => {
         event.stopPropagation();
         // Members in an album cannot modify placed chords (the toast explains
         // which controls are still available to them).
         if (blockedForEdit()) return;
         // Block all editing while in bar-selection mode.
         if (isSelectionActiveFor(chord.closest(".drop-target")?.dataset.section)) return;
         const beat = chord.closest(".drop-target"),
            section = findSection(beat.dataset.section);
         const viaRemoveBadge = event.target?.closest?.(".chord-remove");
         const selectedItem = viaRemoveBadge ? null : getSelectedPaletteItem();
         if (selectedItem) {
            if (!placePaletteItem(section, beat, selectedItem)) return;
            if (prefersTap()) clearPaletteSelection();
            syncEditor();
            renderPreview();
            save();
            flashDropTarget(section.id, beat.dataset.slot);
            return;
         }
         // Clicking the chord body (not the × badge) re-opens the editor so the
         // user can change it; the × badge removes the chord.
         if (!viaRemoveBadge) {
            openBeatEditor(beat, { selectQuery: true });
            return;
         }
         // Animate the chord out before removing
         chord.classList.add("chord-leaving");
         const animEnd = async () => {
            chord.removeEventListener("transitionend", animEnd);
            delete section.beats[beat.dataset.slot];
            renderPreview();
            save();
            toast("Chord removed");
         };
         chord.addEventListener("transitionend", animEnd);
         // Safety net: if transitionend doesn't fire
         setTimeout(() => {
            chord.removeEventListener("transitionend", animEnd);
            if (section.beats[beat.dataset.slot]) {
               delete section.beats[beat.dataset.slot];
               renderPreview();
               save();
               toast("Chord removed");
            }
         }, 200);
      };
      chord.addEventListener("click", removeOrReplace);
      chord.addEventListener("keydown", (event) => {
         if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            removeOrReplace(event);
         }
      });
   });
   document.querySelectorAll(".nested-duration-line").forEach((line) =>
      line.addEventListener("click", (event) => {
         event.stopPropagation();
         // Removing a nested subdivision is an arrangement edit.
         if (blockedForEdit()) return;
         // Block all editing while in bar-selection mode.
         if (isSelectionActiveFor(line.dataset.section)) return;
         const section = findSection(line.dataset.section),
            splitSlots = (line.dataset.splitSlots || "").split("|").filter(Boolean);
         if (!section) return;
         splitSlots.forEach((splitSlot) => {
            const childSlots = Object.keys(section.beats)
               .filter((slot) => slot.startsWith(`${splitSlot}.`))
               .sort();
            const firstChord = childSlots.map((slot) => beatValue(section, slot).chord).find(Boolean) || null;
            const splitHold = Math.max(
               fermataValue(section, splitSlot),
               0,
               ...childSlots.map((slot) => fermataValue(section, slot)),
            );
            const lyricSlots = Object.keys(section.lyricBeats || {})
               .filter((slot) => slot.startsWith(`${splitSlot}.`))
               .sort();
            const mergedLyrics = lyricSlots
               .map((slot) => lyricValue(section, slot))
               .filter(Boolean)
               .join(" ");
            childSlots.forEach((slot) => delete section.beats[slot]);
            lyricSlots.forEach((slot) => delete section.lyricBeats[slot]);
            restoreCollapsedBeat(section, splitSlot, firstChord, splitHold);
            setLyric(section, splitSlot, mergedLyrics);
            // Same rule for the chord row of the nested split's children.
            collapseChordAbove(section, splitSlot);
         });
         state.activeId = section.id;
         renderPreview();
         save();
         toast("Nested half-beat subdivision removed");
      }),
   );
   document.querySelectorAll(".duration-line").forEach((line) =>
      line.addEventListener("click", (event) => {
         event.stopPropagation();
         // Removing a rhythm subdivision is an arrangement edit.
         if (blockedForEdit()) return;
         const group = line.closest(".beat-group"),
            section = findSection(group.dataset.section),
            baseSlot = group.dataset.baseSlot;
         if (!section) return;
         // Block all editing while in bar-selection mode.
         if (isSelectionActiveFor(group.dataset.section)) return;
         const descendantSlots = Object.keys(section.beats)
            .filter((slot) => slot.startsWith(`${baseSlot}:`))
            .sort();
         const firstChord = descendantSlots.map((slot) => beatValue(section, slot).chord).find(Boolean) || null;
         const baseHold = Math.max(
            fermataValue(section, baseSlot),
            0,
            ...descendantSlots.map((slot) => fermataValue(section, slot)),
         );
         const lyricSlots = Object.keys(section.lyricBeats || {})
            .filter((slot) => slot.startsWith(`${baseSlot}:`))
            .sort();
         const mergedLyrics = lyricSlots
            .map((slot) => lyricValue(section, slot))
            .filter(Boolean)
            .join(" ");
         descendantSlots.forEach((slot) => delete section.beats[slot]);
         lyricSlots.forEach((slot) => delete section.lyricBeats[slot]);
         restoreCollapsedBeat(section, baseSlot, firstChord, baseHold);
         setLyric(section, baseSlot, mergedLyrics);
         // ...and for the chord row of the subdivisions being merged away.
         collapseChordAbove(section, baseSlot);
         state.activeId = section.id;
         renderPreview();
         save();
         toast("Rhythm marker removed");
      }),
   );
   document.querySelectorAll(".lyric-input").forEach((input) => {
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("input", () => {
         // Lyrics are part of the arrangement → read-only for members. The
         // re-render restores the committed value instead of the typed text.
         if (blockedForEdit()) {
            renderPreview();
            return;
         }
         const section = findSection(input.dataset.section);
         if (!section) return;
         // Block lyric edits while in bar-selection mode.
         if (isSelectionActiveFor(input.dataset.section)) {
            renderPreview();
            return;
         }
         setLyric(section, input.dataset.slot, input.value);
         state.activeId = section.id;
         save();
      });
      input.addEventListener("blur", () => {
         // Silent guard (no toast): nothing was typed, so don't re-commit the
         // value just to mark the document dirty.
         if (memberReadOnly()) return;
         const section = findSection(input.dataset.section);
         if (!section) return;
         input.value = input.value.trim();
         setLyric(section, input.dataset.slot, input.value);
         save();
      });
      input.addEventListener("keydown", (event) => {
         if (event.key === "Escape") {
            input.blur();
            return;
         }
         if (event.key !== "Enter") return;
         event.preventDefault();
         const inputs = [...document.querySelectorAll(".lyric-input")],
            index = inputs.indexOf(input),
            target = inputs[index + (event.shiftKey ? -1 : 1)];
         target?.focus();
         target?.select();
      });
      input.addEventListener("paste", (event) => {
         if (memberReadOnly()) {
            event.preventDefault();
            return;
         }
         const pasted = event.clipboardData?.getData("text") || "",
            words = pasted.trim().split(/\s+/).filter(Boolean);
         if (words.length < 2) return;
         event.preventDefault();
         const inputs = [...document.querySelectorAll(".lyric-input")],
            start = inputs.indexOf(input),
            available = inputs.slice(start);
         available.forEach((field, index) => {
            if (index >= words.length) return;
            const section = findSection(field.dataset.section);
            const value =
               index === available.length - 1 && words.length > available.length
                  ? words.slice(index).join(" ")
                  : words[index];
            field.value = value;
            if (section) setLyric(section, field.dataset.slot, value);
         });
         save();
         const next = available[Math.min(words.length, available.length) - 1];
         next?.focus();
         next?.select();
         toast(`${words.length} words distributed across beats`);
      });
   });
   // Chord-above inputs (Chord Chart mode): the chord row above the numbers.
   // Focusing a cell hands over to the "type → pick a suggestion" popover (the
   // same one the beats use), so stored chords are always normalized; the plain
   // input/blur handlers stay as a paste-friendly fallback.
   document.querySelectorAll(".chord-above-input").forEach((input) => {
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("focus", () => openChordAboveEditor(input));
      input.addEventListener("input", () => {
         // Chord-above letters are part of the arrangement → read-only for members.
         if (blockedForEdit()) {
            renderPreview();
            return;
         }
         const section = findSection(input.dataset.section);
         if (!section) return;
         if (isSelectionActiveFor(input.dataset.section)) {
            renderPreview();
            return;
         }
         setChordAbove(section, input.dataset.slot, input.value);
         state.activeId = section.id;
         save();
      });
      input.addEventListener("blur", () => {
         // Silent guard — see the lyric-input blur guard above.
         if (memberReadOnly()) return;
         // The suggestion popover just took focus. Re-rendering here would destroy
         // the element the popover is anchored to, so wait until it closes.
         if (isChordEditorOpen()) return;
         const section = findSection(input.dataset.section);
         if (!section) return;
         input.value = input.value.trim();
         setChordAbove(section, input.dataset.slot, input.value);
         renderPreview();
         save();
      });
      input.addEventListener("keydown", (event) => {
         if (event.key === "Escape") {
            input.blur();
            return;
         }
         if (event.key !== "Enter") return;
         event.preventDefault();
         const inputs = [...document.querySelectorAll(".chord-above-input")],
            index = inputs.indexOf(input),
            target = inputs[index + (event.shiftKey ? -1 : 1)];
         target?.focus();
         target?.select();
      });
   });
   document.querySelectorAll(".section-lyrics-toggle").forEach((button) =>
      button.addEventListener("click", (event) => {
         event.stopPropagation();
         // Per-section display/edit toggles are arrangement edits.
         if (blockedForEdit()) return;
         const section = findSection(button.dataset.section);
         if (!section) return;
         section.lyricsEnabled = section.lyricsEnabled === false;
         state.activeId = section.id;
         renderPreview();
         save();
         toast(`Lyrics ${section.lyricsEnabled ? "enabled" : "hidden"} for ${section.name}`);
      }),
   );
   document.querySelectorAll(".section-chord-above-toggle").forEach((button) =>
      button.addEventListener("click", (event) => {
         event.stopPropagation();
         // Per-section display/edit toggles are arrangement edits.
         if (blockedForEdit()) return;
         const section = findSection(button.dataset.section);
         if (!section) return;
         // The section's own default: ON/OFF for every bar of this section.
         section.chordAboveEnabled = section.chordAboveEnabled !== true;
         state.activeId = section.id;
         renderPreview();
         save();
         toast(`Chords above ${section.chordAboveEnabled ? "enabled" : "hidden"} for ${section.name}`);
      }),
   );
   document.querySelectorAll(".add-bar").forEach((button) =>
      button.addEventListener("click", () => {
         // Adding bars changes the arrangement — refused for members.
         if (blockedForEdit()) return;
         const section = findSection(button.dataset.section);
         if (!section) return;
         section.bars += 1;
         state.activeId = section.id;
         syncEditor();
         renderPreview();
         save();
         toast(`1 ${scoreUnit().unit} added to ${section.name}`);
      }),
   );
   document.querySelectorAll(".add-section").forEach((button) =>
      button.addEventListener("click", (event) => {
         event.stopPropagation();
         insertSectionAfter(button.dataset.section);
      }),
   );
   document.querySelectorAll(".delete-bar").forEach((button) =>
      button.addEventListener("click", (event) => {
         event.stopPropagation();
         // Deleting a bar changes the arrangement — refused for members.
         if (blockedForEdit()) return;
         const section = findSection(button.dataset.section),
            bar = Number(button.dataset.bar);
         if (!section) return;
         const { unit, Unit } = scoreUnit();
         if (section.bars <= 1) {
            toast(`At least one ${unit} must remain`);
            return;
         }
         if (
            barHasContent(section, bar) &&
            !window.confirm(`${Unit} ${bar + 1} contains chords or lyrics. Delete this ${unit}?`)
         )
            return;
         removeBar(section, bar);
         state.activeId = section.id;
         renderPreview();
         save();
         toast(`${Unit} ${bar + 1} deleted`);
      }),
   );
   // Long-press on mobile must not trigger selection/callout or accidental hover reflow around the bar.
   document.querySelectorAll(".bar").forEach((bar) => {
      bar.addEventListener("contextmenu", (event) => {
         if (event.target.closest(".lyric-input,.section-title-input,input,textarea,select")) return;
         event.preventDefault();
      });
      // While bar-selection mode is active, the ENTIRE bar becomes one big clickable target.
      // A capture-phase listener runs before any inner editing handler (chords, rhythm lines,
      // lyric inputs, tool buttons), so it both (a) widens the hit area to the whole bar and
      // (b) blocks all content edits — clicking anywhere inside the bar only (de)selects it.
      bar.addEventListener(
         "click",
         (event) => {
            const sel = getBarSelection();
            const sectionId = bar.closest(".preview-section")?.dataset.section;
            if (!sel || !sel.active || sel.sectionId !== sectionId) return;
            event.stopPropagation();
            event.preventDefault();
            const barIndex = Number(bar.dataset.bar);
            if (Number.isNaN(barIndex)) return;
            handleBarSelectionClick(sel.sectionId, barIndex);
         },
         true, // capture phase: intercept before inner beat/chord/lyric handlers
      );
   });
   document.querySelectorAll(".delete-section").forEach((button) =>
      button.addEventListener("click", (event) => {
         event.stopPropagation();
         // Deleting a section changes the arrangement — refused for members.
         if (blockedForEdit()) return;
         if (state.sections.length <= 1) {
            toast("At least one section must remain");
            return;
         }
         const index = state.sections.findIndex((item) => item.id === button.dataset.section),
            section = state.sections[index];
         if (!section) return;
         const hasContent =
            Object.keys(section.beats || {}).length ||
            Object.values(section.lyricBeats || {}).some((text) => String(text).trim());
         if (hasContent && !window.confirm(`Section “${section.name}” contains chords or lyrics. Delete this section?`))
            return;
         state.sections.splice(index, 1);
         state.activeId = state.sections[Math.min(index, state.sections.length - 1)].id;
         state.editingId = null;
         syncEditor();
         renderPreview();
         save();
         toast(`Section “${section.name}” deleted`);
      }),
   );
   document.querySelectorAll(".copy-section").forEach((button) =>
      button.addEventListener("click", (event) => {
         event.stopPropagation();
         // Copy/paste of sections & bars is an arrangement edit tool.
         if (blockedForEdit()) return;
         copySection(button.dataset.section);
      }),
   );
   document.querySelectorAll(".paste-section").forEach((button) => {
      button.disabled = !hasClipboard("section") || memberReadOnly();
      button.addEventListener("click", (event) => {
         event.stopPropagation();
         if (blockedForEdit()) return;
         pasteSection(button.dataset.section);
      });
   });
   document.querySelectorAll(".copy-bar").forEach((button) =>
      button.addEventListener("click", (event) => {
         event.stopPropagation();
         // Copy/paste of sections & bars is an arrangement edit tool.
         if (blockedForEdit()) return;
         copyBar(button.dataset.section, Number(button.dataset.bar));
      }),
   );
   document.querySelectorAll(".paste-bar").forEach((button) => {
      button.disabled = (!hasClipboard("bar") && !hasClipboard("bars")) || memberReadOnly();
      button.addEventListener("click", (event) => {
         event.stopPropagation();
         if (blockedForEdit()) return;
         pasteBar(button.dataset.section, Number(button.dataset.bar));
      });
   });
   document.querySelectorAll(".select-bars").forEach((button) =>
      button.addEventListener("click", (event) => {
         event.stopPropagation();
         // "Copy bars" (range selection) is an arrangement edit tool.
         if (blockedForEdit()) return;
         // Close the ••• menu, then enter selection mode for this section.
         button.closest(".section-menu")?.removeAttribute("open");
         beginBarSelection(button.dataset.section);
      }),
   );
   document.querySelectorAll(".bar-selection-copy").forEach((button) =>
      button.addEventListener("click", (event) => {
         event.stopPropagation();
         if (blockedForEdit()) return;
         copySelectedBars();
      }),
   );
   document.querySelectorAll(".bar-selection-cancel").forEach((button) =>
      button.addEventListener("click", (event) => {
         event.stopPropagation();
         cancelBarSelection();
      }),
   );
   document
      .querySelectorAll(".section-menu")
      .forEach((menu) => menu.addEventListener("click", (event) => event.stopPropagation()));
   document.querySelectorAll(".section-title").forEach((button) =>
      button.addEventListener("click", (event) => {
         event.stopPropagation();
         // Renaming a section is an arrangement edit — refused for members.
         if (blockedForEdit()) return;
         state.activeId = button.dataset.section;
         state.editingId = button.dataset.section;
         syncEditor();
         renderPreview();
         requestAnimationFrame(() => $(".section-title-input")?.focus());
      }),
   );
   document.querySelectorAll(".section-title-input").forEach((input) => {
      const commit = () => {
         // Silent guard: members can't reach the rename input (the button is
         // disabled), so never commit a change on their behalf.
         if (memberReadOnly()) return;
         const section = findSection(input.dataset.section);
         if (!section) return; // bug fix: guard against section removed during blur
         section.name = input.value.trim() || "Untitled section";
         state.activeId = section.id;
         state.editingId = null;
         syncEditor();
         renderPreview();
         save();
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (event) => {
         if (event.key === "Enter") {
            event.preventDefault();
            input.blur();
         }
         if (event.key === "Escape") {
            state.editingId = null;
            renderPreview();
         }
      });
      input.addEventListener("click", (event) => event.stopPropagation());
   });
   document.querySelectorAll(".preview-section").forEach((el) =>
      el.addEventListener("click", () => {
         state.activeId = el.dataset.section;
         syncEditor();
         renderPreview();
      }),
   );
   // Re-apply the member read-only affordances: renderPreview() just rebuilt the
   // section/bar controls, so disabled states have to be restored with them.
   applyReadOnlyAffordances();
}
