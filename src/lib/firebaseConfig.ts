/*
  Firebase web app configuration for the staff dashboard.

  These four values are public configuration, not secrets: they only say which
  Firebase project the page talks to. What a signed-in person may read or
  change is decided by firestore.rules and by the sign-in itself.

  This file imports nothing from Firebase, so reading it never pulls the SDK
  into a public page. The SDK is loaded only by src/admin/firebase.ts.
*/
const env = import.meta.env ?? {};

export const firebaseConfig = {
  apiKey: String(env.VITE_FIREBASE_API_KEY ?? ""),
  authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN ?? ""),
  projectId: String(env.VITE_FIREBASE_PROJECT_ID ?? ""),
  appId: String(env.VITE_FIREBASE_APP_ID ?? ""),
};

export const isFirebaseConfigured = () => Object.values(firebaseConfig).every(Boolean);
