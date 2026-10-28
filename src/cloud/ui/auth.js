import { $, toast } from "../../core/dom.js?v=__BUILD__";
import {
   friendlyAuthError,
   signInWithEmail,
   signInWithGoogle,
   signUpWithEmail,
} from "../../cloud.js?v=__BUILD__";

// Login page (full-screen auth gate) — login + register modes on one page
function showAuthError(message) {
   showFormError("#authError", message);
}

// Generalized error setter so login and register share one code path.
function showFormError(boxId, message) {
   const box = $(boxId);
   if (!box) return;
   if (!message) {
      box.hidden = true;
      box.textContent = "";
      return;
   }
   box.textContent = message;
   box.hidden = false;
}

// Switch the auth card between its two sub-views ("login" / "register").
// The sub-views are `.auth-view[data-auth-view]` containers inside the card;
// the brand lockups live outside them, so switching never duplicates them.
function setAuthMode(mode) {
   const page = $("#loginPage");
   if (!page) return;
   page.dataset.authMode = mode === "register" ? "register" : "login";
   page.querySelectorAll(".auth-view").forEach((view) => {
      view.hidden = view.dataset.authView !== page.dataset.authMode;
   });
   showAuthError("");
   showFormError("#registerError", "");
   // Hand focus to the new view's first field — but only when the page is
   // actually visible (showLoginPage focuses #authEmail itself once open).
   if (!page.hidden) {
      page.querySelector(`[data-auth-view="${page.dataset.authMode}"] input`)?.focus();
   }
}

// Busy state for the auth buttons: disabled + aria-busy + a working label.
function setAuthBusy(button, busy, busyLabel) {
   if (!button) return;
   if (busy) {
      // innerHTML, not textContent: the Google buttons carry the mark as an
      // inline SVG — swapping via textContent would destroy it, and the
      // text-only restore would leave the button without its logo.
      button.dataset.idleHTML = button.innerHTML;
      button.textContent = busyLabel || button.textContent;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
   } else {
      if (button.dataset.idleHTML) button.innerHTML = button.dataset.idleHTML;
      button.disabled = false;
      button.removeAttribute("aria-busy");
   }
}

// Password visibility toggle: one helper shared by both forms.
function wirePasswordToggle(inputId, buttonId) {
   const input = $(inputId);
   const button = $(buttonId);
   if (!input || !button) return;
   button.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-pressed", show ? "true" : "false");
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
      input.focus({ preventScroll: true });
   });
}

// Show the full-screen login page (used when signed out / after sign-out).
export function showLoginPage() {
   const page = $("#loginPage");
   if (!page) return;
   setAuthMode("login");
   showAuthError("");
   document.documentElement.dataset.authGate = "login";
   page.hidden = false;
   void page.offsetHeight;
   setTimeout(() => page.classList.add("is-open"), 20);
   setTimeout(() => $("#authEmail")?.focus(), 160);
}

// Hide the login page and reveal the app (used once authenticated).
export function hideLoginPage() {
   const page = $("#loginPage");
   document.documentElement.dataset.authGate = "app";
   if (!page) return;
   page.classList.remove("is-open");
   setTimeout(() => {
      page.hidden = true;
   }, 320);
}

export function initLogin() {
   const page = $("#loginPage");
   if (!page) return;

   // Google sign-in is offered from both the login and the register view.
   const googleFlow = async (button) => {
      try {
         showAuthError("");
         setAuthBusy(button, true, "Signing in…");
         await signInWithGoogle();
         toast("Signed in");
      } catch (error) {
         showAuthError(friendlyAuthError(error));
      } finally {
         setAuthBusy(button, false);
      }
   };
   $("#googleSignInBtn")?.addEventListener("click", () => googleFlow($("#googleSignInBtn")));
   $("#googleSignUpBtn")?.addEventListener("click", () => googleFlow($("#googleSignUpBtn")));

   // Sign-in view.
   $("#emailAuthForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const button = $("#emailSignInBtn");
      const email = $("#authEmail")?.value.trim();
      const password = $("#authPassword")?.value;
      if (!email || !password) {
         showAuthError("Enter your email and password.");
         return;
      }
      try {
         showAuthError("");
         setAuthBusy(button, true, "Signing in…");
         await signInWithEmail(email, password);
         toast("Signed in");
      } catch (error) {
         showAuthError(friendlyAuthError(error));
      } finally {
         setAuthBusy(button, false);
      }
   });

   // The "Create an account" link switches the card to the register view
   // (it no longer signs up in place).
   $("#emailSignUpBtn")?.addEventListener("click", () => setAuthMode("register"));
   $("#backToLoginBtn")?.addEventListener("click", () => setAuthMode("login"));

   // Register view.
   $("#registerForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const button = $("#registerSubmitBtn");
      const email = $("#registerEmail")?.value.trim();
      const password = $("#registerPassword")?.value;
      const confirm = $("#registerPassword2")?.value;
      if (!email || !password) {
         showFormError("#registerError", "Enter your email and password.");
         return;
      }
      if (password !== confirm) {
         showFormError("#registerError", "Passwords don't match.");
         return;
      }
      try {
         showFormError("#registerError", "");
         setAuthBusy(button, true, "Creating…");
         await signUpWithEmail(email, password);
         toast("Account created — welcome to Spartio");
      } catch (error) {
         const message = friendlyAuthError(error);
         // The most common register failure is an existing account — route
         // the user straight to the fix with an inline "Sign in instead".
         if (/already in use/i.test(message)) {
            showFormError("#registerError", "");
            const box = $("#registerError");
            if (box) {
               const text = document.createElement("span");
               text.textContent = message;
               const link = document.createElement("button");
               link.type = "button";
               link.className = "auth-error-link";
               link.textContent = "Sign in instead";
               link.addEventListener("click", () => {
                  setAuthMode("login");
                  const authEmail = $("#authEmail");
                  if (authEmail && !authEmail.value) authEmail.value = email;
               });
               box.append(text, " ", link);
               box.hidden = false;
            }
         } else {
            showFormError("#registerError", message);
         }
      } finally {
         setAuthBusy(button, false);
      }
   });

   wirePasswordToggle("#authPassword", "#authPassToggle");
   wirePasswordToggle("#registerPassword", "#registerPassToggle");
   wirePasswordToggle("#registerPassword2", "#registerPassToggle2");
}
