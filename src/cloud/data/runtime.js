import { firebaseConfig } from "../../firebase-config.js?v=__BUILD__";

const SDK_VERSION = "11.6.1";
const CDN = (name) => `https://www.gstatic.com/firebasejs/${SDK_VERSION}/${name}`;

let appPromise = null;
export let sdk = null;
export let currentUser = null;
export const authListeners = new Set();

let resolveAuthReady;
let firstAuthEmitted = false;
export const authReadyPromise = new Promise((resolve) => {
   resolveAuthReady = resolve;
});

export function isConfigured() {
   return Boolean(firebaseConfig?.apiKey && firebaseConfig.apiKey.startsWith("AIza"));
}

export function resolveInitialAuth(user) {
   resolveAuthReady(user);
}

export function requireUser() {
   if (!currentUser) throw new Error("You must be signed in to use cloud storage.");
}

export async function ensureFirebase() {
   if (sdk) return sdk;
   if (!appPromise) {
      appPromise = (async () => {
         if (!isConfigured()) throw new Error("Firebase is not configured");
         const [appMod, authMod, dbMod] = await Promise.all([
            import(CDN("firebase-app.js")),
            import(CDN("firebase-auth.js")),
            import(CDN("firebase-firestore.js")),
         ]);
         const app = appMod.initializeApp(firebaseConfig);
         const auth = authMod.getAuth(app);
         const db = dbMod.getFirestore(app);
         sdk = { app, auth, db, authFns: authMod, dbFns: dbMod };
         authMod.onAuthStateChanged(auth, (user) => {
            currentUser = user
               ? { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL }
               : null;
            if (!firstAuthEmitted) {
               firstAuthEmitted = true;
               resolveAuthReady(currentUser);
            }
            authListeners.forEach((fn) => {
               try {
                  fn(currentUser);
               } catch {
                  /* listener errors must never break auth flow */
               }
            });
         });
         return sdk;
      })();
   }
   return appPromise;
}
