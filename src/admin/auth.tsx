import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clearAdminApiCache } from "./api";
import {
  claims,
  confirmReset,
  isSignInConfigured,
  passwordSignIn,
  refresh,
  requestReset,
  revoke,
  setFirstPassword,
  type SignInResult,
  type Tokens,
} from "./cognito";

/*
  Dashboard sign-in, modelled on the Medville Diabetes dashboard.

  - One login per person, created by an owner. Nobody can sign themselves up.
  - The role is a Cognito group ("owner" or "staff"). It is shown here from
    the token, but the order API reads it live from Cognito on every request,
    so the browser can never grant itself anything.
  - Tokens live in session storage, so closing the tab ends the session, and an
    idle session is signed out after IDLE_LIMIT with a warning first.
*/

const IDLE_LIMIT_MS = 20 * 60 * 1000;
const IDLE_WARNING_MS = 2 * 60 * 1000;
const STORE_KEY = "medville-brace:admin-session";
const REFRESH_EARLY_MS = 2 * 60 * 1000;

export type AdminRole = "owner" | "staff";
export type AdminSection = "overview" | "calendar" | "orders" | "team" | "audit";

/* What each role can open. The server enforces the same split; this only decides what is worth showing. */
export const ROLE_ACCESS: Record<AdminRole, AdminSection[]> = {
  owner: ["overview", "calendar", "orders", "team", "audit"],
  staff: ["overview", "calendar", "orders"],
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
  /* Signed in to Cognito, but in no group yet. */
  pendingApproval: boolean;
  idleWarning: boolean;
  signedOutReason: string;
  signIn: (email: string, password: string) => Promise<SignInResult["kind"]>;
  completeNewPassword: (password: string) => Promise<void>;
  requestReset: (email: string) => Promise<void>;
  confirmReset: (email: string, code: string, password: string) => Promise<void>;
  signOutNow: (reason?: string) => Promise<void>;
  getToken: () => Promise<string | null>;
  keepAwake: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function readStored(): Tokens | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    const t = raw ? (JSON.parse(raw) as Tokens) : null;
    return t && typeof t.idToken === "string" && typeof t.refreshToken === "string" && typeof t.expiresAt === "number" ? t : null;
  } catch {
    return null;
  }
}

function store(tokens: Tokens | null) {
  try {
    if (tokens) sessionStorage.setItem(STORE_KEY, JSON.stringify(tokens));
    else sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* private window: the session lasts as long as this page */
  }
}

function sessionFrom(tokens: Tokens): AdminSession | null {
  const c = claims(tokens.idToken);
  const groups = Array.isArray(c["cognito:groups"]) ? (c["cognito:groups"] as string[]) : [];
  const role: AdminRole | null = groups.includes("owner") ? "owner" : groups.includes("staff") ? "staff" : null;
  if (!role) return null;
  return { id: String(c["cognito:username"] ?? c.sub ?? ""), email: String(c.email ?? ""), role };
}

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSignInConfigured();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [idleWarning, setIdleWarning] = useState(false);
  const [signedOutReason, setSignedOutReason] = useState("");
  const tokens = useRef<Tokens | null>(null);
  const challenge = useRef<{ session: string; username: string } | null>(null);
  const refreshing = useRef<Promise<Tokens | null> | null>(null);
  const lastActivity = useRef(Date.now());

  /* A login with no role keeps nothing: its tokens are dropped and revoked, and the sign-in page says why. */
  const adopt = useCallback((next: Tokens | null) => {
    clearAdminApiCache();
    const s = next ? sessionFrom(next) : null;
    tokens.current = s ? next : null;
    store(s ? next : null);
    setSession(s);
    setPendingApproval(Boolean(next && !s));
    if (next && !s && next.refreshToken) void revoke(next.refreshToken).catch(() => undefined);
  }, []);

  const signOutNow = useCallback(
    async (reason = "") => {
      const current = tokens.current;
      adopt(null);
      setIdleWarning(false);
      setSignedOutReason(reason);
      if (current?.refreshToken) await revoke(current.refreshToken).catch(() => undefined);
    },
    [adopt],
  );

  /* Fresh tokens when the current ID token is close to its end. One refresh at a time. */
  const fresh = useCallback(async (): Promise<Tokens | null> => {
    const current = tokens.current;
    if (!current) return null;
    if (current.expiresAt - Date.now() > REFRESH_EARLY_MS) return current;
    if (!refreshing.current) {
      refreshing.current = refresh(current.refreshToken)
        .then((next) => {
          adopt(next);
          return next;
        })
        .catch(() => {
          void signOutNow("Your session ended. Please sign in again.");
          return null;
        })
        .finally(() => {
          refreshing.current = null;
        });
    }
    return refreshing.current;
  }, [adopt, signOutNow]);

  /* Picks up a session from this tab's storage after a reload. */
  useEffect(() => {
    const saved = readStored();
    if (!saved) {
      setReady(true);
      return;
    }
    tokens.current = saved;
    fresh()
      .then((t) => t && adopt(t))
      .finally(() => setReady(true));
  }, [adopt, fresh]);

  /* The idle timer watches real input, so a dashboard left open on a shared desk closes itself. */
  useEffect(() => {
    if (!session) return;
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
        const result = await passwordSignIn(email, password);
        if (result.kind === "new-password") {
          challenge.current = { session: result.session, username: result.username };
        } else {
          lastActivity.current = Date.now();
          adopt(result.tokens);
        }
        return result.kind;
      },
      completeNewPassword: async (password) => {
        const c = challenge.current;
        if (!c) throw new Error("Please sign in again.");
        const result = await setFirstPassword(c.session, c.username, password);
        if (result.kind !== "signed-in") throw new Error("Please sign in again.");
        challenge.current = null;
        lastActivity.current = Date.now();
        adopt(result.tokens);
      },
      requestReset,
      confirmReset,
      signOutNow,
      getToken: async () => (await fresh())?.idToken ?? null,
    }),
    [ready, configured, session, pendingApproval, idleWarning, signedOutReason, adopt, fresh, signOutNow],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAdminAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return value;
}
