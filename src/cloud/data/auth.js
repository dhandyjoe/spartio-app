import {
   authListeners,
   authReadyPromise,
   currentUser,
   ensureFirebase,
   isConfigured,
   resolveInitialAuth,
   sdk,
} from "./runtime.js?v=__BUILD__";

export { isConfigured };

export function authReady() {
   if (!isConfigured()) return Promise.resolve(null);
   ensureFirebase().catch(() => resolveInitialAuth(null));
   return authReadyPromise;
}

export function onAuth(listener) {
   authListeners.add(listener);
   listener(currentUser);
   ensureFirebase().catch(() => {});
   return () => authListeners.delete(listener);
}

export function getCurrentUser() {
   return currentUser;
}

export async function signInWithGoogle() {
   const { auth, authFns } = await ensureFirebase();
   const provider = new authFns.GoogleAuthProvider();
   const credential = await authFns.signInWithPopup(auth, provider);
   return credential.user;
}

export async function signUpWithEmail(email, password) {
   const { auth, authFns } = await ensureFirebase();
   const credential = await authFns.createUserWithEmailAndPassword(auth, email, password);
   return credential.user;
}

export async function signInWithEmail(email, password) {
   const { auth, authFns } = await ensureFirebase();
   const credential = await authFns.signInWithEmailAndPassword(auth, email, password);
   return credential.user;
}

export async function signOutUser() {
   const { auth, authFns } = await ensureFirebase();
   await authFns.signOut(auth);
}

export function friendlyAuthError(error) {
   const code = error?.code || "";
   const map = {
      "auth/invalid-email": "Email address is not valid.",
      "auth/user-disabled": "This account has been disabled.",
      "auth/user-not-found": "No account found for that email.",
      "auth/wrong-password": "Incorrect email or password.",
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/email-already-in-use": "An account with that email already exists.",
      "auth/weak-password": "Password should be at least 6 characters.",
      "auth/popup-closed-by-user": "Sign-in popup was closed before completing.",
      "auth/popup-blocked": "Popup was blocked by the browser. Allow popups and retry.",
      "auth/network-request-failed": "Network error. Check your connection and retry.",
   };
   if (map[code]) return map[code];
   if (error?.message === "Firebase is not configured")
      return "Cloud is not configured yet. Add your Firebase config to enable sign-in.";
   return "Something went wrong. Please try again.";
}
