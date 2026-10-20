import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Auth } from "firebase/auth";
import { clearFiguresCache } from "./figures";
import { getFirebaseAuth, sendResetLink } from "./firebase";
import { isFirebaseConfigured } from "../lib/firebaseConfig";

/*
  Dashboard sign-in, on Firebase Authentication (email and password).

  - One login per person, created by an owner. Nobody can sign themselves up.
  - The role is the custom claim "role" ("owner" or "staff") on the person's
    ID token. Only the AWS dashboard function can set it, and the order API
    reads the role live from Firebase on every request, so the browser can
    never grant itself anything. Here it only decides which screens to show.
  - A person who signs in without a role is signed out at once and told that
    their account has no access yet.
  - The session lives in session storage, so closing the tab ends it, and an
    idle session is signed out after IDLE_LIMIT with a warning first.
  - Messages never say whether an address has an account.
*/

const IDLE_LIMIT_MS = 20 * 60 * 1000;
const IDLE_WARNING_MS = 2 * 60 * 1000;

export type AdminRole = "owner" | "staff";
export type AdminSection = "overview" | "calendar" | "orders" | "carts" | "products" | "faqs" | "settings" | "team" | "audit";

/* What each role can open. The server and the Firestore rules enforce the same split; this only decides what is worth showing. */
export const ROLE_ACCESS: Record<AdminRole, AdminSection[]> = {
  owner: ["overview", "calendar", "orders", "carts", "products", "faqs", "settings", "team", "audit"],
  staff: ["overview", "calendar", "orders", "carts", "products", "faqs"],
};

export const canOpen = (role: AdminRole, section: string) => (ROLE_ACCESS[role] as string[]).includes(section);

export interface AdminSession {
  id: string;
  email: string;
  role: AdminRole;
}

interface AuthState {
  ready: boolean;
  configured: boolean;
  session: AdminSession | null;
  /* Signed in to Firebase, but with no role yet. The login is dropped at once. */
  pendingApproval: boolean;
  idleWarning: boolean;
  signedOutReason: string;
  signIn: (email: string, password: string) => Promise<"signed-in" | "no-access">;
  requestReset: (email: string) => Promise<void>;
  signOutNow: (reason?: string) => Promise<void>;
  getToken: () => Promise<string | null>;
  keepAwake: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/* Plain sentences. None of them says whether an account exists. */
const PLAIN: Record<string, string> = {
  "auth/invalid-credential": "That email address and password did not match.",
  "auth/wrong-password": "That email address and password did not match.",
  "auth/user-not-found": "That email address and password did not match.",
  "auth/invalid-login-credentials": "That email address and password did not match.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/missing-password": "Please enter your password.",
  "auth/user-disabled": "This sign-in is not available. Ask an owner for help.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "The sign-in service could not be reached. Check the connection and try again.",
  "auth/timeout": "The sign-in service could not be reached. Check the connection and try again.",
  "auth/user-token-expired": "Your session ended. Please sign in again.",
  "auth/requires-recent-login": "Your session ended. Please sign in again.",
  "auth/operation-not-allowed": "Sign-in is not available right now. Please try again later.",
  "auth/invalid-api-key": "Sign-in is not set up correctly in this build. Tell the person who runs the website.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "Sign-in is not set up correctly in this build. Tell the person who runs the website.",
  "auth/app-not-authorized": "Sign-in is not set up correctly in this build. Tell the person who runs the website.",
  "auth/unauthorized-domain": "Sign-in is not set up for this address. Tell the person who runs the website.",
};

export class SignInError extends Error {}

function plain(problem: unknown, fallback: string) {
  const code = typeof (problem as { code?: unknown })?.code === "string" ? (problem as { code: string }).code : "";
  return new SignInError(PLAIN[code] ?? (/network|fetch|Failed to load/i.test(String((problem as Error)?.message ?? "")) ? PLAIN["auth/network-request-failed"] : fallback));
}

const roleOf = (claim: unknown): AdminRole | null => (claim === "owner" || claim === "staff" ? claim : null);

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isFirebaseConfigured();
  const [ready, setReady] = useState(!configured);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [idleWarning, setIdleWarning] = useState(false);
  const [signedOutReason, setSignedOutReason] = useState("");
  const auth = useRef<Auth | null>(null);
  const lastActivity = useRef(Date.now());
  /* Set while this page ends the session itself, so the listener does not report it as a surprise. */
  const leaving = useRef(false);
  const hadSession = useRef(false);
  const generation = useRef(0);

  const signOutNow = useCallback(async (reason = "") => {
    leaving.current = true;
    clearFiguresCache();
    setSession(null);
    hadSession.current = false;
    setIdleWarning(false);
    setSignedOutReason(reason);
    try {
      const instance = auth.current ?? (configured ? await getFirebaseAuth() : null);
      const sdk = await import("firebase/auth");
      if (instance) await sdk.signOut(instance);
    } catch {
      /* Nothing more to end: the page no longer holds a session. */
    } finally {
      leaving.current = false;
    }
  }, [configured]);

  /* One listener keeps the session, and the role on it, in step with Firebase, including after a token refresh. */
  useEffect(() => {
    if (!configured) return;
    let off: (() => void) | undefined;
    let dead = false;
    void (async () => {
      try {
        const [instance, sdk] = await Promise.all([getFirebaseAuth(), import("firebase/auth")]);
        if (dead) return;
        auth.current = instance;
        off = sdk.onIdTokenChanged(instance, async (user) => {
          const mine = ++generation.current;
          if (!user) {
            clearFiguresCache();
            setSession(null);
            if (hadSession.current && !leaving.current) setSignedOutReason("Your session ended. Please sign in again.");
            hadSession.current = false;
            setReady(true);
            return;
          }
          let role: AdminRole | null = null;
          try {
            role = roleOf((await user.getIdTokenResult()).claims.role);
          } catch {
            role = null;
          }
          if (mine !== generation.current) return;
          if (!role) {
            /* Signed in but with no role: keep nothing. */
            clearFiguresCache();
            setSession(null);
            setPendingApproval(true);
            hadSession.current = false;
            setReady(true);
            leaving.current = true;
            await sdk.signOut(instance).catch(() => undefined);
            leaving.current = false;
            return;
          }
          setPendingApproval(false);
          hadSession.current = true;
          setSession({ id: user.uid, email: user.email ?? "", role });
          setReady(true);
        });
      } catch {
        if (!dead) setReady(true);
      }
    })();
    return () => {
      dead = true;
      off?.();
    };
  }, [configured]);

  /* The idle timer watches real input, so a dashboard left open on a shared desk closes itself. */
  useEffect(() => {
    if (!session) return;
    lastActivity.current = Date.now();
    const markActive = () => {
      lastActivity.current = Date.now();
      setIdleWarning(false);
    };
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, markActive, { passive: true }));
    const tick = window.setInterval(() => {
      const idleFor = Date.now() - lastActivity.current;
      if (idleFor >= IDLE_LIMIT_MS) void signOutNow("You were signed out because the dashboard was idle.");
      else if (idleFor >= IDLE_LIMIT_MS - IDLE_WARNING_MS) setIdleWarning(true);
    }, 15000);
    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, markActive));
      window.clearInterval(tick);
    };
  }, [session, signOutNow]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      configured,
      session,
      pendingApproval,
      idleWarning,
      signedOutReason,
      keepAwake: () => {
        lastActivity.current = Date.now();
        setIdleWarning(false);
      },
      signIn: async (email, password) => {
        setSignedOutReason("");
        setPendingApproval(false);
        try {
          const [instance, sdk] = await Promise.all([getFirebaseAuth(), import("firebase/auth")]);
          auth.current = instance;
          const { user } = await sdk.signInWithEmailAndPassword(instance, email.trim(), password);
          /* A fresh sign-in carries fresh claims, so the role is known here. */
          if (!roleOf((await user.getIdTokenResult()).claims.role)) {
            setPendingApproval(true);
            leaving.current = true;
            await sdk.signOut(instance).catch(() => undefined);
            leaving.current = false;
            return "no-access";
          }
          lastActivity.current = Date.now();
          return "signed-in";
        } catch (problem) {
          throw plain(problem, "Sign-in did not work. Please try again.");
        }
      },
      requestReset: async (email) => {
        try {
          await sendResetLink(email);
        } catch (problem) {
          /* An address with no account must look exactly like one with an account. */
          const code = typeof (problem as { code?: unknown })?.code === "string" ? (problem as { code: string }).code : "";
          if (code === "auth/user-not-found") return;
          throw plain(problem, "The email could not be sent. Please try again.");
        }
      },
      signOutNow,
      getToken: async () => {
        const user = auth.current?.currentUser;
        if (!user) return null;
        try {
          return await user.getIdToken();
        } catch {
          return null;
        }
      },
    }),
    [ready, configured, session, pendingApproval, idleWarning, signedOutReason, signOutNow],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAdminAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return value;
}
