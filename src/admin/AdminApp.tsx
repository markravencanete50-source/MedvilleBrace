import { lazy, Suspense, useEffect, useState } from "react";
import { BarChart3, CalendarDays, CircleHelp, ClipboardList, ExternalLink, ShoppingCart, LogOut, Menu, Moon, MoreHorizontal, Package, ScrollText, Store, Sun, Users, X } from "lucide-react";
import "./admin.css";
import { AdminAuthProvider, canOpen, useAdminAuth, type AdminRole, type AdminSection } from "./auth";
import { isAdminApiConfigured } from "./api";
import { Badge, Banner, Field, ToastProvider, useAdminTheme, useToast } from "./ui";
import { Mark } from "../components/Logo";
import { usePageMeta } from "../lib/usePageMeta";

/*
  The store dashboard, at /admin, built on the Medville Diabetes dashboard.

  It is one lazy chunk of the website's own app, so a shopper never downloads
  any of it, and each screen inside is its own chunk again. The address is not
  a secret and is not treated as one: access is decided by a sign-in and a
  role that is checked again, on the server, for every request.

  Three services have a part, and none holds more than it needs:

  - Vercel serves this page's files. It never sees an order, a sign-in or a
    figure; it only hands out the prerendered site and this app.
  - Firebase handles staff sign-in and the data that holds no customer details:
    the role on each login, the editable store content (products, questions,
    store details) and the daily order figures. It loads only after a person
    opens this page.
  - AWS, in the account with the BAA, holds the orders. Customer data travels
    only between this page and the order API there.

  The shell is built for a phone first. Under 1024px the navy sidebar becomes
  a drawer, a navy bar at the top names the screen, and a bar at the foot
  holds the first screens the person's role allows plus More.
*/

const RELOADED_KEY = "medville-brace:admin-reloaded";

/* A dashboard left open across a deploy asks for chunk names that no longer exist; one reload picks up the new ones. */
function screen<P>(load: () => Promise<{ default: React.ComponentType<P> }>) {
  return lazy(() =>
    load().catch((problem) => {
      if (sessionStorage.getItem(RELOADED_KEY) !== "1") {
        sessionStorage.setItem(RELOADED_KEY, "1");
        window.location.reload();
      }
      throw problem;
    }),
  );
}

const LOADERS = {
  overview: () => import("./pages/Overview"),
  calendar: () => import("./pages/Calendar"),
  orders: () => import("./pages/Orders"),
  carts: () => import("./pages/Carts"),
  products: () => import("./pages/Products"),
  faqs: () => import("./pages/Faqs"),
  settings: () => import("./pages/Settings"),
  team: () => import("./pages/Team"),
  audit: () => import("./pages/Audit"),
};
const Overview = screen(LOADERS.overview);
const Calendar = screen(LOADERS.calendar);
const Orders = screen(LOADERS.orders);
const Carts = screen(LOADERS.carts);
const Products = screen(LOADERS.products);
const Faqs = screen(LOADERS.faqs);
const Settings = screen(LOADERS.settings);
const Team = screen(LOADERS.team);
const Audit = screen(LOADERS.audit);

const preload = (section: AdminSection) => void LOADERS[section]().catch(() => undefined);

const NAV: { id: AdminSection; label: string; icon: typeof BarChart3; group: string }[] = [
  { id: "overview", label: "Overview", icon: BarChart3, group: "Orders" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, group: "Orders" },
  { id: "orders", label: "Orders", icon: ClipboardList, group: "Orders" },
  { id: "carts", label: "Carts", icon: ShoppingCart, group: "Orders" },
  { id: "products", label: "Products", icon: Package, group: "Store" },
  { id: "faqs", label: "Questions", icon: CircleHelp, group: "Store" },
  { id: "settings", label: "Store details", icon: Store, group: "Store" },
  { id: "team", label: "Team", icon: Users, group: "Account" },
  { id: "audit", label: "Access log", icon: ScrollText, group: "Account" },
];

const ROLE_LABEL: Record<AdminRole, string> = { owner: "Owner", staff: "Staff" };

/* The section lives in the hash, so no dashboard screen ever has a shareable path and no order can end up in a link. */
function useSection(role: AdminRole) {
  const read = (): AdminSection => {
    const raw = window.location.hash.replace("#", "");
    return NAV.some((item) => item.id === raw) && canOpen(role, raw) ? (raw as AdminSection) : "overview";
  };
  const [section, setSection] = useState<AdminSection>(read);
  useEffect(() => {
    const onHash = () => setSection(read());
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [role]);
  const go = (next: AdminSection) => {
    window.location.hash = next;
    setSection(next);
  };
  return { section, go };
}

function Brand() {
  return (
    <div className="admin-brand">
      <Mark className="admin-brand-logo" />
      <span>
        Medville Brace
        <small>Order dashboard</small>
      </span>
    </div>
  );
}

type SignInStep = "sign-in" | "forgot";

function SignIn() {
  const { signIn, requestReset, pendingApproval, signedOutReason, configured } = useAdminAuth();
  const toast = useToast();
  const [step, setStep] = useState<SignInStep>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That did not work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (step === "sign-in") {
      void run(async () => {
        setNotice("");
        const result = await signIn(email, password);
        setPassword("");
        if (result === "signed-in") toast("Signed in.");
      });
    } else {
      void run(async () => {
        await requestReset(email);
        /* The same words whether or not the address has an account. */
        setNotice("If that address has an account, an email with a link to choose a new password is on its way. Check your spam folder too.");
        setStep("sign-in");
      });
    }
  };

  const titles: Record<SignInStep, [string, string]> = {
    "sign-in": ["Sign in", "Use the email address you were invited with."],
    forgot: ["Reset your password", "Enter your email address and we will send you a link to choose a new password."],
  };
  const action: Record<SignInStep, [string, string]> = {
    "sign-in": ["Sign in", "Signing in"],
    forgot: ["Send the link", "Sending"],
  };

  return (
    <div className="admin-signin">
      <div className="w-full max-w-[420px]">
        <Brand />
        <div className="admin-signin-card">
          {!configured && (
            <div className="mb-4">
              <Banner tone="warn">
                Sign-in is not connected yet. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID, then rebuild. See README.md, Order dashboard.
              </Banner>
            </div>
          )}
          {signedOutReason && step === "sign-in" && (
            <div className="mb-4">
              <Banner tone="warn">{signedOutReason}</Banner>
            </div>
          )}
          {pendingApproval && (
            <div className="mb-4">
              <Banner tone="warn">Your account exists but has no access yet. Ask an owner to give you a role.</Banner>
            </div>
          )}
          {notice && (
            <div className="mb-4">
              <Banner tone="info">{notice}</Banner>
            </div>
          )}

          <h1 className="admin-page-title m-0 mb-1">{titles[step][0]}</h1>
          <p className="admin-help m-0 mb-5">{titles[step][1]}</p>

          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <Field label="Email address" htmlFor="admin-email">
              <input id="admin-email" className="admin-input" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            {step === "sign-in" && (
              <Field label="Password" htmlFor="admin-password">
                <input id="admin-password" className="admin-input" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
              </Field>
            )}

            {error && <Banner tone="danger">{error}</Banner>}

            <button type="submit" className="admin-btn admin-btn-primary mt-1 min-h-12 w-full" disabled={busy || !configured}>
              {busy ? action[step][1] : action[step][0]}
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            {step === "sign-in" ? (
              <button type="button" className="admin-link" onClick={() => { setError(""); setNotice(""); setStep("forgot"); }}>
                Forgot password
              </button>
            ) : (
              <button type="button" className="admin-link" onClick={() => { setError(""); setNotice(""); setStep("sign-in"); }}>
                Back to sign in
              </button>
            )}
          </div>

          <p className="admin-help mt-4">This dashboard holds customer orders. Do not share your login, and sign out when you leave the screen.</p>
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const { session, signOutNow, idleWarning, keepAwake } = useAdminAuth();
  const toast = useToast();
  const { theme, toggle } = useAdminTheme();
  const [navOpen, setNavOpen] = useState(false);
  const [calendarDay, setCalendarDay] = useState<string | null>(null);
  const role = session!.role;
  const { section, go } = useSection(role);

  usePageMeta({ title: "Order dashboard", description: "Medville Brace order dashboard.", noindex: true });

  useEffect(() => setNavOpen(false), [section]);
  useEffect(() => sessionStorage.removeItem(RELOADED_KEY), []);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setNavOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  const visible = NAV.filter((item) => canOpen(role, item.id));
  const groups = [...new Set(visible.map((item) => item.group))];
  const current = NAV.find((item) => item.id === section);

  /* Fetch the other screens once the shell is up, so the first switch is instant. */
  useEffect(() => {
    const all = () => void Promise.allSettled(visible.map((item) => LOADERS[item.id]()));
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(all, { timeout: 1500 });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = window.setTimeout(all, 1000);
    return () => window.clearTimeout(timer);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [role]);

  const tabs = visible.slice(0, 3);
  const inTabs = tabs.some((item) => item.id === section);
  const themeLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const openDay = (day: string) => {
    setCalendarDay(day);
    go("calendar");
  };

  return (
    <div className="admin" data-admin-theme={theme}>
      <div className="admin-topbar">
        <Mark className="admin-brand-logo admin-brand-logo-sm" />
        <p className="admin-topbar-title m-0">{current?.label ?? "Dashboard"}</p>
        <button type="button" className="admin-icon-btn" onClick={toggle} aria-label={themeLabel}>
          {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <button type="button" className="admin-icon-btn" aria-expanded={navOpen} aria-label={navOpen ? "Close the menu" : "Open the menu"} onClick={() => setNavOpen((open) => !open)}>
          {navOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <div className="admin-shell">
        {navOpen && <button type="button" className="admin-scrim" aria-label="Close the menu" onClick={() => setNavOpen(false)} />}
        <aside className="admin-side" data-open={navOpen} {...(navOpen ? { role: "dialog", "aria-modal": true, "aria-label": "Menu" } : {})}>
          <button type="button" className="admin-icon-btn admin-side-close" aria-label="Close the menu" onClick={() => setNavOpen(false)}>
            <X size={20} />
          </button>
          <Brand />
          {groups.map((group) => (
            <div key={group}>
              <p className="admin-nav-group">{group}</p>
              {visible
                .filter((item) => item.group === group)
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="admin-nav-link w-full"
                      aria-current={section === item.id ? "page" : undefined}
                      onPointerEnter={() => preload(item.id)}
                      onFocus={() => preload(item.id)}
                      onClick={() => go(item.id)}
                    >
                      <Icon size={17} aria-hidden="true" />
                      {item.label}
                    </button>
                  );
                })}
            </div>
          ))}
          <div className="admin-nav-foot">
            <p className="admin-help mb-2 truncate px-3" title={session!.email}>
              {session!.email}
            </p>
            <div className="mb-2 px-3">
              <Badge tone="new">{ROLE_LABEL[role]}</Badge>
            </div>
            <a className="admin-nav-link w-full" href="/" target="_blank" rel="noreferrer">
              <ExternalLink size={17} aria-hidden="true" />
              View the website
            </a>
            <button type="button" className="admin-nav-link w-full" onClick={toggle} aria-label={themeLabel}>
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <button
              type="button"
              className="admin-nav-link w-full"
              onClick={() => void signOutNow("You signed out.").then(() => toast("Signed out."))}
            >
              <LogOut size={17} /> Sign out
            </button>
          </div>
        </aside>

        <main className="admin-main">
          {!isAdminApiConfigured() && (
            <div className="mb-4">
              <Banner tone="warn">The order service is not connected to this build yet. Set VITE_ORDER_ENDPOINT (or VITE_ADMIN_ENDPOINT) and rebuild. See README.md, Order dashboard.</Banner>
            </div>
          )}
          {idleWarning && (
            <div className="mb-4">
              <Banner tone="warn">
                You will be signed out shortly because this screen has been idle.{" "}
                <button type="button" className="font-semibold underline underline-offset-2" onClick={keepAwake}>
                  Stay signed in
                </button>
              </Banner>
            </div>
          )}
          <Suspense fallback={<p className="py-16 text-center text-[14px]" style={{ color: "var(--a-text-faint)" }}>Loading</p>}>
            {section === "overview" && <Overview openDay={openDay} />}
            {section === "calendar" && <Calendar initialDay={calendarDay} />}
            {section === "orders" && <Orders />}
            {section === "carts" && <Carts />}
            {section === "products" && <Products />}
            {section === "faqs" && <Faqs />}
            {section === "settings" && <Settings />}
            {section === "team" && <Team />}
            {section === "audit" && <Audit />}
          </Suspense>
        </main>
      </div>

      <nav className="admin-tabbar" aria-label="Sections" style={{ "--tabs": tabs.length + 1 } as React.CSSProperties}>
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" className="admin-tab" aria-current={section === item.id ? "page" : undefined} onClick={() => go(item.id)}>
              <Icon size={22} strokeWidth={1.9} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button type="button" className="admin-tab" aria-expanded={navOpen} aria-current={!inTabs && !navOpen ? "page" : undefined} onClick={() => setNavOpen((open) => !open)}>
          <MoreHorizontal size={22} strokeWidth={1.9} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}

function Gate() {
  const { ready, session } = useAdminAuth();
  const { theme } = useAdminTheme();
  if (!ready) {
    return (
      <div className="admin" data-admin-theme={theme}>
        <div className="admin-signin">
          <p className="text-[14px]" style={{ color: "var(--a-nav-muted)" }}>
            Checking your session
          </p>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="admin" data-admin-theme={theme}>
        <SignIn />
      </div>
    );
  }
  return <Shell />;
}

export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </AdminAuthProvider>
  );
}
