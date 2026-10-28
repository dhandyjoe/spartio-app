import { $ } from "../../core/dom.js?v=__BUILD__";

// Small DOM helpers.
const modalTimers = new WeakMap();

export function openModal(el) {
   if (!el) return;
   const timers = modalTimers.get(el);
   clearTimeout(timers?.open);
   clearTimeout(timers?.hide);
   el.hidden = false;
   // Force a reflow so the hidden→visible start state (opacity:0) is committed
   // before we add .is-open to fade in. A short timeout is a robust fallback to
   // rAF, which can be throttled in background tabs (matches device-hint).
   void el.offsetHeight;
   const open = setTimeout(() => {
      el.classList.add("is-open");
      modalTimers.delete(el);
   }, 20);
   modalTimers.set(el, { open });
}
export function closeModal(el) {
   if (!el) return;
   const timers = modalTimers.get(el);
   clearTimeout(timers?.open);
   clearTimeout(timers?.hide);
   el.classList.remove("is-open");
   // A reopen during this fade-out must cancel this timer (openModal does).
   const hide = setTimeout(() => {
      el.hidden = true;
      modalTimers.delete(el);
   }, 300);
   modalTimers.set(el, { hide });
}

// Themed replacement for window.confirm(). Resolves to true when the user
// confirms and false when they cancel / dismiss (backdrop, Cancel button or
// Escape). One dialog element is reused; its copy, icon and confirm-button
// accent are set per call. Only one confirm can be open at a time — opening a
// second resolves the first as cancelled.
let activeConfirmCleanup = null;
// Inline stroke icons for the shared confirm dialog. Keyed by the text glyphs
// callers already pass, so no call site has to change.
const CONFIRM_ICON_SVG = {
   "question": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.2 1.8c-1.1 1-1.8 1.5-1.8 3"/><path d="M12 17h.01"/></svg>`,
   "playback-stop": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
   "delete": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
   "warning": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
   "link": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
   "copy": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
   "leave": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>`,
   "refresh": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>`,
   "music": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
   "person": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
};

export function openConfirmDialog({
   title = "Are you sure?",
   message = "",
   confirmLabel = "Confirm",
   cancelLabel = "Cancel",
   icon = "question",
   danger = false,
} = {}) {
   const dialog = $("#confirmDialog");
   // No markup (e.g. old tests) → fall back to the native confirm.
   if (!dialog) return Promise.resolve(window.confirm(message || title));
   // Tear down any dialog already on screen (resolves it as cancelled).
   if (activeConfirmCleanup) activeConfirmCleanup(false);

   const confirmBtn = $("#confirmDialogConfirm");
   const cancelBtn = $("#confirmDialogCancel");
   $("#confirmDialogTitle").textContent = title;
   $("#confirmDialogDesc").textContent = message;
   // Named keys keep dialog icons inside the app's SVG icon set.
   const iconEl = $("#confirmDialogIcon");
   if (iconEl) iconEl.innerHTML = CONFIRM_ICON_SVG[icon] || CONFIRM_ICON_SVG.question;
   confirmBtn.textContent = confirmLabel;
   cancelBtn.textContent = cancelLabel;
   confirmBtn.classList.toggle("is-danger", !!danger);
   dialog.classList.toggle("is-danger", !!danger);

   const previouslyFocused = document.activeElement;

   return new Promise((resolve) => {
      const finish = (result) => {
         if (activeConfirmCleanup !== cleanup) return;
         cleanup(result);
      };
      const onConfirm = () => finish(true);
      const onDismiss = () => finish(false);
      const onKey = (e) => {
         if (e.key === "Escape") finish(false);
      };
      const onBackdrop = (e) => {
         if (e.target.closest("[data-confirm-dismiss]")) finish(false);
      };

      function cleanup(result) {
         activeConfirmCleanup = null;
         confirmBtn.removeEventListener("click", onConfirm);
         cancelBtn.removeEventListener("click", onDismiss);
         dialog.removeEventListener("click", onBackdrop);
         document.removeEventListener("keydown", onKey);
         closeModal(dialog);
         if (previouslyFocused && typeof previouslyFocused.focus === "function") {
            previouslyFocused.focus();
         }
         resolve(result);
      }

      activeConfirmCleanup = cleanup;
      confirmBtn.addEventListener("click", onConfirm);
      cancelBtn.addEventListener("click", onDismiss);
      dialog.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKey);
      openModal(dialog);
      // Focus the confirm button so the dialog is keyboard-operable at once.
      setTimeout(() => confirmBtn.focus(), 40);
   });
}

// Themed replacement for prompt(): opens the Attach Link dialog with a textarea
// and resolves to the pasted text (trimmed) or null if cancelled/empty. Kept
// separate from openConfirmDialog because it needs a free-text field.
let activeAttachCleanup = null;
export function openAttachLinkDialog() {
   const dialog = $("#attachLinkDialog");
   // No markup (e.g. old tests) → degrade to the native prompt.
   if (!dialog) {
      const text = window.prompt("Paste a share link:");
      return Promise.resolve(text ? text.trim() : null);
   }
   if (activeAttachCleanup) activeAttachCleanup(null);

   const confirmBtn = $("#attachLinkConfirm");
   const cancelBtn = $("#attachLinkCancel");
   const input = $("#attachLinkInput");
   const previouslyFocused = document.activeElement;
   if (input) input.value = "";
   // Reset the header/labels in case showShareLinkFallback() repurposed them.
   const title = $("#attachLinkTitle");
   const desc = $("#attachLinkDesc");
   if (title) title.textContent = "Attach a shared song";
   if (desc)
      desc.textContent =
         "Paste a share link or payload. Preview it before importing.";
   if (confirmBtn) {
      confirmBtn.textContent = "Preview";
      confirmBtn.disabled = true;
   }

   return new Promise((resolve) => {
      const finish = (result) => {
         if (activeAttachCleanup !== cleanup) return;
         cleanup(result);
      };
      const onConfirm = () => {
         const val = input ? input.value.trim() : "";
         finish(val || null);
      };
      const onInput = () => {
         if (confirmBtn) confirmBtn.disabled = !(input?.value || "").trim();
      };
      const onDismiss = () => finish(null);
      const onKey = (e) => {
         if (e.key === "Escape") finish(null);
      };
      const onBackdrop = (e) => {
         if (e.target.closest("[data-attach-dismiss]")) finish(null);
      };

      function cleanup(result) {
         activeAttachCleanup = null;
         confirmBtn.removeEventListener("click", onConfirm);
         cancelBtn.removeEventListener("click", onDismiss);
         input?.removeEventListener("input", onInput);
         dialog.removeEventListener("click", onBackdrop);
         document.removeEventListener("keydown", onKey);
         closeModal(dialog);
         if (previouslyFocused && typeof previouslyFocused.focus === "function") {
            previouslyFocused.focus();
         }
         resolve(result);
      }

      activeAttachCleanup = cleanup;
      confirmBtn.addEventListener("click", onConfirm);
      cancelBtn.addEventListener("click", onDismiss);
      input?.addEventListener("input", onInput);
      dialog.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKey);
      openModal(dialog);
      setTimeout(() => input && input.focus(), 40);
   });
}

// Three-choice "unsaved changes" dialog, shown when leaving the editor with
// edits that haven't reached the cloud. Resolves to one of:
//   "save"    → user wants to save then leave  (recommended primary action)
//   "discard" → leave without saving
//   "cancel"  → stay in the editor (backdrop / Cancel / Escape)
let activeUnsavedCleanup = null;
export function openUnsavedChangesDialog() {
   const dialog = $("#unsavedDialog");
   // No markup (e.g. old tests) → degrade to the native confirm: OK = save.
   if (!dialog) {
      return Promise.resolve(
         window.confirm("You have unsaved changes. Save to cloud before leaving?") ? "save" : "discard",
      );
   }
   if (activeUnsavedCleanup) activeUnsavedCleanup("cancel");

   const saveBtn = $("#unsavedSaveBtn");
   const discardBtn = $("#unsavedDiscardBtn");
   const cancelBtn = $("#unsavedCancelBtn");
   const previouslyFocused = document.activeElement;

   return new Promise((resolve) => {
      const finish = (result) => {
         if (activeUnsavedCleanup !== cleanup) return;
         cleanup(result);
      };
      const onSave = () => finish("save");
      const onDiscard = () => finish("discard");
      const onCancel = () => finish("cancel");
      const onKey = (e) => {
         if (e.key === "Escape") finish("cancel");
      };
      const onBackdrop = (e) => {
         if (e.target.closest("[data-unsaved-dismiss]")) finish("cancel");
      };

      function cleanup(result) {
         activeUnsavedCleanup = null;
         saveBtn.removeEventListener("click", onSave);
         discardBtn.removeEventListener("click", onDiscard);
         cancelBtn.removeEventListener("click", onCancel);
         dialog.removeEventListener("click", onBackdrop);
         document.removeEventListener("keydown", onKey);
         closeModal(dialog);
         if (previouslyFocused && typeof previouslyFocused.focus === "function") {
            previouslyFocused.focus();
         }
         resolve(result);
      }

      activeUnsavedCleanup = cleanup;
      saveBtn.addEventListener("click", onSave);
      discardBtn.addEventListener("click", onDiscard);
      cancelBtn.addEventListener("click", onCancel);
      dialog.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKey);
      openModal(dialog);
      // Focus the recommended (Save) action so Enter keeps the user's work.
      setTimeout(() => saveBtn.focus(), 40);
   });
}
