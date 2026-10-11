/*
  Lazy access to Firebase for the dashboard.

  Nothing here is imported at the top of a module, so the sign-in screen
  loads only the app and Auth parts of the SDK. Firestore (the "lite" build,
  which is plain requests with no live listeners and so much smaller) loads
  the first time a screen needs store content or figures.

  Auth is started with session storage and with no popup or redirect
  resolver. Closing the tab ends the session, and no sign-in step ever needs a
  frame, so the page's content security policy allows none.

  The order is deliberate: Auth is created before Firestore, so Firestore
  finds the signed-in person and sends their token with every request.
*/
import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore/lite";
import { firebaseConfig, isFirebaseConfigured } from "../lib/firebaseConfig";

let appPromise: Promise<FirebaseApp> | null = null;
let authPromise: Promise<Auth> | null = null;
let dbPromise: Promise<Firestore> | null = null;

/* A failed download must not stick: the next call tries again. */
function once<T>(slot: () => Promise<T> | null, set: (p: Promise<T> | null) => void, make: () => Promise<T>): Promise<T> {
  const existing = slot();
  if (existing) return existing;
  const next = make().catch((problem) => {
    set(null);
    throw problem;
  });
  set(next);
  return next;
}

export function getFirebaseApp(): Promise<FirebaseApp> {
  if (!isFirebaseConfigured()) return Promise.reject(new Error("Firebase is not configured."));
  return once(
    () => appPromise,
    (p) => (appPromise = p),
    async () => {
      const { initializeApp, getApps, getApp } = await import("firebase/app");
      return getApps().length ? getApp() : initializeApp(firebaseConfig);
    },
  );
}

export function getFirebaseAuth(): Promise<Auth> {
  return once(
    () => authPromise,
    (p) => (authPromise = p),
    async () => {
      const [app, auth] = await Promise.all([getFirebaseApp(), import("firebase/auth")]);
      try {
        return auth.initializeAuth(app, { persistence: auth.browserSessionPersistence });
      } catch {
        /* Already started (a hot reload while developing). */
        return auth.getAuth(app);
      }
    },
  );
}

export function getFirestoreLite(): Promise<Firestore> {
  return once(
    () => dbPromise,
    (p) => (dbPromise = p),
    async () => {
      const app = await getFirebaseApp();
      await getFirebaseAuth();
      const { getFirestore } = await import("firebase/firestore/lite");
      return getFirestore(app);
    },
  );
}

/* Emails the person a link to choose a password. Used for "Forgot password" and for new invitations. */
export async function sendResetLink(email: string) {
  const [auth, sdk] = await Promise.all([getFirebaseAuth(), import("firebase/auth")]);
  await sdk.sendPasswordResetEmail(auth, email.trim());
}
