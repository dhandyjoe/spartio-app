import {
   isSingleBeatMeter,
   normalizeEditorMode,
   newSection,
   nextSectionName,
   MAX_SECTIONS,
} from "../../notation/notation.js?v=__BUILD__";
import { $, toast } from "../../core/dom.js?v=__BUILD__";
import { getState, getSelectedPaletteItem, resetState } from "../../core/store.js?v=__BUILD__";
import { renderControls, renderCustomChord, renderPreview } from "../../render/render.js?v=__BUILD__";
import { exportToPdf, initPrintListeners } from "../../pdf/pdf.js?v=__BUILD__";
import { initPdfOptions } from "../../pdf/pdfOptions.js?v=__BUILD__";

let pdfOptionsControl = null;

export function bindControlListeners({
   activateRibbon,
   applyProject,
   applyTheme,
   beginMetaEdit,
   bindAutoSyllable,
   blockedForEdit,
   cancelBarSelection,
   clearPaletteSelection,
   downloadProject,
   getActiveTheme,
   isPrintLayoutPreview,
   memberReadOnly,
   phoneViewOnly,
   redoSheet,
   save,
   setDirty,
   setPrintLayoutPreview,
   syncEditor,
   toastPhoneViewOnly,
   togglePlayback,
   toggleRibbon,
   transposeSheet,
   undoSheet,
   updatePlayButton,
   updateViewportOverflow,
}) {
   const state = getState();
   $("#keySelect").addEventListener("change", (event) => {
      state.key = event.target.value;
      renderPreview();
      save();
   });
   $("#chordRootPicker").addEventListener("click", (event) => {
      if (!event.target.dataset.root) return;
      // Palette tools exist to write chords — not available to members.
      if (blockedForEdit()) return;
      clearPaletteSelection();
      getState().chordRoot = event.target.dataset.root;
      renderControls();
      save();
   });
   $("#customChordInput").addEventListener("input", (event) => {
      if (blockedForEdit()) {
         renderControls();
         return;
      }
      clearPaletteSelection();
      getState().customChord = event.target.value;
      renderCustomChord();
      save();
   });
   $("#addSlashBtn").addEventListener("click", () => {
      if (blockedForEdit()) return;
      const chord = `${$("#slashRoot").value}${$("#slashQuality").value}/${$("#slashBass").value}`;
      const slashChords = getState().slashChords;
      if (!slashChords.includes(chord)) slashChords.push(chord);
      renderControls();
      save();
      toast(`${chord} is ready to drag`);
   });
   $("#nashvilleRootPicker").addEventListener("click", (event) => {
      const button = event.target.closest(".nashville-key");
      if (!button) return;
      if (blockedForEdit()) return;
      clearPaletteSelection();
      getState().nashvilleNumber = button.dataset.number;
      renderControls();
      save();
   });
   $("#nashvilleAccidentalPicker").addEventListener("click", (event) => {
      if (event.target.dataset.accidental === undefined) return;
      if (blockedForEdit()) return;
      clearPaletteSelection();
      getState().nashvilleAccidental = event.target.dataset.accidental;
      renderControls();
      save();
   });
   // Transpose stays available to members (matched by the album role rules).
   $("#transposeDown").addEventListener("click", () => transposeSheet(-1));
   $("#transposeUp").addEventListener("click", () => transposeSheet(1));

   // Playback controls: the topbar transport starts from the ACTIVE section;
   // section play buttons start at their own section. Both share playPending.
   const bpmInput = $("#bpmInput");
   $("#playBtn")?.addEventListener("click", () => {
      void togglePlayback();
   });

   bpmInput?.addEventListener("input", (event) => {
      const bpm = Math.min(240, Math.max(40, Number(event.target.value)));
      getState().bpm = bpm || 120;
      // Persist to the song (history + dirty flag) and re-sync the control so
      // it reflects the new tempo (each song keeps its own BPM, not a static 120).
      save();
      renderControls();
   });
   // The BPM input sits in the sticky header now, so a wheel gesture meant for
   // the page must never nudge the tempo. Blur first; the wheel then scrolls.
   bpmInput?.addEventListener(
      "wheel",
      () => {
         if (document.activeElement === bpmInput) bpmInput.blur();
      },
      { passive: true },
   );
   updatePlayButton();


   // Undo/Redo stay available to members: the history stack is cleared whenever a
   // project is loaded (applyProject → clearHistory), so undo can only move
   // between the album document as loaded and the edits a member is allowed to
   // make (Key / Time / BPM / Transpose). It can never introduce bars, sections
   // or chords the member couldn't create in the first place.
   // Undo/Redo are editor history — refused in a view-only phone (members keep them).
   $("#undoBtn")?.addEventListener("click", () => {
      if (phoneViewOnly()) return;
      undoSheet();
   });
   $("#redoBtn")?.addEventListener("click", () => {
      if (phoneViewOnly()) return;
      redoSheet();
   });
   $("#lyricsEnabled").addEventListener("change", (event) => {
      // The lyrics switch changes the document — owner-only.
      if (blockedForEdit()) {
         event.target.checked = getState().lyricsEnabled;
         return;
      }
      getState().lyricsEnabled = event.target.checked;
      renderControls();
      renderPreview();
      save();
      toast(getState().lyricsEnabled ? "Lyrics mode enabled" : "Lyrics hidden from score");
   });
   // Global lyrics toggle in the topbar (mirrors the hidden ribbon switch, which
   // remains the source of truth so renderControls keeps both in sync).
   $("#lyricsEnabledTop")?.addEventListener("change", (event) => {
      if (blockedForEdit()) {
         event.target.checked = getState().lyricsEnabled;
         return;
      }
      const ribbonToggle = $("#lyricsEnabled");
      ribbonToggle.checked = event.target.checked;
      ribbonToggle.dispatchEvent(new Event("change"));
   });
   bindAutoSyllable();
   document.querySelectorAll(".ribbon-tab").forEach((tab) => {
      tab.addEventListener("click", () => activateRibbon(tab));
      tab.addEventListener("keydown", (event) => {
         if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
         event.preventDefault();
         const tabs = [...document.querySelectorAll(".ribbon-tab:not([hidden])")],
            index = tabs.indexOf(tab);
         const next =
            event.key === "Home"
               ? tabs[0]
               : event.key === "End"
                 ? tabs.at(-1)
                 : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
         activateRibbon(next, { focus: true });
      });
   });
   $("#ribbonToggle").addEventListener("click", () => toggleRibbon());
   $("#themeToggle").addEventListener("click", () =>
       applyTheme(getActiveTheme() === "dark" ? "light" : "dark", { announce: true }),
   );
   $("#previewViewport").addEventListener("scroll", updateViewportOverflow, { passive: true });
   $("#previewTitle").addEventListener("click", (event) => {
      if (event.target.matches("input")) return;
      // Title / artist are part of the sheet — read-only for members. A phone is
      // view-only too, but its metadata stays editable (see the allowed list).
      if (memberReadOnly()) return;
      beginMetaEdit("title");
   });
   $("#previewArtist").addEventListener("click", (event) => {
      if (event.target.matches("input")) return;
      if (memberReadOnly()) return;
      beginMetaEdit("artist");
   });
   // Key & time signature remain editable for members (see the album role rules).
   $("#previewKey").addEventListener("click", (event) => {
      if (!event.target.matches("select")) beginMetaEdit("key");
   });
   $("#previewMeter").addEventListener("click", (event) => {
      if (!event.target.matches("select")) beginMetaEdit("meter");
   });
   // Time signature & BPM stay editable for members. On a PHONE, though, the time
   // signature is locked (only Key / Transpose / BPM stay live there).
   $("#timeSignature").addEventListener("change", (event) => {
      if (phoneViewOnly()) {
         event.target.value = getState().meter;
         toastPhoneViewOnly();
         return;
      }
      getState().meter = event.target.value;
      renderPreview();
      save();
      toast(`Preview updated to ${getState().meter}`);
   });
   $("#songTitle").addEventListener("input", () => {
      if (memberReadOnly()) {
         renderPreview();
         return;
      }
      renderPreview();
      save();
   });
   $("#artist").addEventListener("input", () => {
      if (memberReadOnly()) {
         renderPreview();
         return;
      }
      renderPreview();
      save();
   });
   $("#placingCancel")?.addEventListener("click", () => {
      clearPaletteSelection();
      toast("Selection cleared");
   });
   $("#addSectionBtn").addEventListener("click", () => {
      // Adding a section is an arrangement edit — refused for members.
      if (blockedForEdit()) return;
      const currentState = getState();
      if (currentState.sections.length >= MAX_SECTIONS) {
         toast(`Maximum of ${MAX_SECTIONS} sections reached`);
         return;
      }
      const section = newSection(nextSectionName(currentState.sections));
      currentState.sections.push(section);
      currentState.activeId = section.id;
      syncEditor();
      renderPreview();
      save();
      toast("Section added at the end");
   });
   $("#resetSheetBtn").addEventListener("click", () => {
      // Wiping the whole score is never available to a member.
      if (blockedForEdit()) return;
      if (!window.confirm("Reset the entire score to its default state?")) return;
      resetState();
      clearPaletteSelection();
      $("#songTitle").value = "Song Title";
      $("#artist").value = "Artist / Composer";
      $("#timeSignature").value = "4/4";
      syncEditor();
      renderControls();
      renderPreview();
      $("#previewViewport")?.scrollTo(0, 0);
      save();
      toast("Score reset to default");
   });
   // "How to use this score app?" help dialog (single source of truth for what
   // the app can do: cloud library + versions, shared albums, editing, export).
   // Explains the click-to-type / right-click-for-rhythm live-editing model.
   {
      const howToDialog = $("#howToDialog");
      const openBtn = $("#howToUseBtn");
      let lastFocused = null;
      const openHowTo = () => {
         if (!howToDialog) return;
         lastFocused = document.activeElement;
         const topics = $("#howtoTopicList");
         if (topics) topics.scrollTop = 0;
         howToDialog.hidden = false;
         void howToDialog.offsetHeight; // commit start state before fade-in
         setTimeout(() => howToDialog.classList.add("is-open"), 20);
         setTimeout(() => $("#howToCloseBtn")?.focus(), 60);
         document.addEventListener("keydown", onKey);
      };
      const closeHowTo = () => {
         if (!howToDialog) return;
         howToDialog.classList.remove("is-open");
         document.removeEventListener("keydown", onKey);
         setTimeout(() => {
            howToDialog.hidden = true;
         }, 260);
         if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
      };
      function onKey(event) {
         if (event.key === "Escape") closeHowTo();
      }
      openBtn?.addEventListener("click", openHowTo);
      // Backdrop and any element flagged data-howto-dismiss (Got it button) close.
      howToDialog?.addEventListener("click", (event) => {
         if (event.target.closest("[data-howto-dismiss]")) closeHowTo();
      });
   }
   $("#saveBtn")?.addEventListener("click", downloadProject);
   $("#projectFileInput")?.addEventListener("change", async (event) => {
      // Loading a project file REPLACES the open document — not a member action.
      if (blockedForEdit()) {
         event.target.value = "";
         return;
      }
      const file = event.target.files[0];
      if (!file) return;
      try {
         applyProject(JSON.parse(await file.text()));
         toast("Score loaded and ready to edit");
      } catch (error) {
         toast("Invalid file or not a Spartio.app project");
      } finally {
         event.target.value = "";
      }
   });
   $("#exportBtn").addEventListener("click", () => {
      renderPreview();
      // The Export .pdf button now opens the PDF options dialog (initPdfOptions
      // wires the actual click→open). renderPreview() first so the adopted
      // #previewCard shows the current score. The real export runs from the
      // dialog's own "Export PDF" button via the onExport callback below.
   });
   // PDF options dialog: tweaks --print-* tokens live (mirrors into the on-screen
   // PDF layout preview) without touching the live editor. Opened by #exportBtn.
   pdfOptionsControl = initPdfOptions({
      setPreview: (on, opts) => setPrintLayoutPreview(on, opts),
       isPreviewOn: () => isPrintLayoutPreview(),
      // Bar numbers only make sense on the Chord Chart beat grid: Numbers mode prints
      // the numbers as the notation itself and ChordPro has no bars, so the option is
      // taken out of the dialog there (the print CSS enforces the same rule). A `1/4`
      // score has no bars either — it is ONE growing bar without a bar line — so the
      // stamp is taken out there too (the print CSS hides it in 1/4 as well).
      barNumbersAvailable: () =>
         normalizeEditorMode(getState().editorMode) === "chords" && !isSingleBeatMeter(getState().meter),
      // ChordPro mode prints its own card; every other mode keeps using the original
      // #previewCard (the default), so existing behaviour is untouched.
      getCard: () =>
         normalizeEditorMode(getState().editorMode) === "chordpro" ? $("#cpPreviewCard") : $("#previewCard"),
      onExport: () => {
         // Multi-bar selection ("Copy bars") is transient EDITOR state: its green
         // ring/tint/✓ badge must never reach the PDF. Clearing it here (and the
         // print CSS neutralising it) is what keeps the exported score clean even
         // when the user exports mid-selection.
         cancelBarSelection();
         renderPreview();
          exportToPdf({ printLayoutPreview: isPrintLayoutPreview(), onAfterFrame: updateViewportOverflow });
      },
   });
   // PDF options are part of each song's document (per-song PDF options), so
   // tweaking them marks the song as having unsaved changes. For a MEMBER they
   // are export-only (nothing can be written back to the album), so skip the
   // flag — otherwise adjusting an export layout would light the unsaved badge
   // and trigger the "Save a copy?" prompt when leaving.
   window.addEventListener("chordsheet:pdfoptionschange", () => {
      if (memberReadOnly()) return;
      setDirty(true);
   });
   window.addEventListener(
      "scroll",
      () => {
         const editor = document.querySelector(".editor-card");
         editor.classList.toggle("is-scrolled", editor.getBoundingClientRect().top <= 80);
      },
      { passive: true },
   );
   window.addEventListener("resize", updateViewportOverflow, { passive: true });

   // Register beforeprint/afterprint so the `is-print-layout` geometry is the
   // single source of truth for printed output (see src/pdf/pdf.js).
   // Registered BEFORE initPrintListeners() on purpose: beforeprint handlers run
   // in registration order, so the transient bar selection is dropped (and the
   // DOM re-rendered without its green ring) before pdf.js measures mid-row bars.
   window.addEventListener("beforeprint", () => cancelBarSelection());
   initPrintListeners();

   document.addEventListener("keydown", (event) => {
      const editing = event.target?.matches?.('input,textarea,select,[contenteditable="true"]') ?? false;

      // Undo/Redo shortcuts: Ctrl+Z / Ctrl+Shift+Z (standard modern shortcut for redo)
      if (!editing && (event.ctrlKey || event.metaKey)) {
         if (event.key.toLowerCase() === "z" && !event.shiftKey) {
            event.preventDefault();
            undoSheet();
            return;
         }
         if (event.key.toLowerCase() === "z" && event.shiftKey) {
            event.preventDefault();
            redoSheet();
            return;
         }
      }

      if (event.altKey && !editing && /^[1-5]$/.test(event.key)) {
         event.preventDefault();
         const tab = document.querySelectorAll(".ribbon-tab:not([hidden])")[Number(event.key) - 1];
         if (tab) activateRibbon(tab, { focus: true });
         return;
      }
       if (event.key === "Escape" && !editing && isPrintLayoutPreview()) {
         event.preventDefault();
         setPrintLayoutPreview(false);
         return;
      }
      if (event.key === "Escape" && !editing && getSelectedPaletteItem()) {
         event.preventDefault();
         clearPaletteSelection();
         toast("Selection cleared · tap a placed chord to remove it");
         return;
      }
      if (event.key === "Escape" && !editing && $("#ribbonToggle").getAttribute("aria-expanded") === "true")
         toggleRibbon(false);
    });
    return pdfOptionsControl;
}
