import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "../auth";
import type { StoreSettings } from "../../data/content";
import { isFirebaseConfigured } from "../../lib/firebaseConfig";
import PublishBar from "../PublishBar";
import { DEFAULT_SETTINGS, LIMITS, readSettings, readStoreDoc, StoreError, writeSettings, type StoreDoc } from "../storeContent";
import { Banner, Card, Empty, Field, PageHeader, Spinner, useToast } from "../ui";

/*
  Store details (owner only): the contact details, hours and shop terms the
  website shows, and an optional notice for the top of every page.

  Until something has been saved the form shows the built-in details from
  src/data/content-defaults.json, which is also what the website shows.
*/

interface Form {
  email: string;
  phone: string;
  hours: string;
  freeShippingFrom: string;
  returnDays: string;
  notice: string;
}

const toForm = (s: StoreSettings): Form => ({
  email: s.email,
  phone: s.phone,
  hours: s.hours,
  freeShippingFrom: String(s.freeShippingFrom),
  returnDays: String(s.returnDays),
  notice: s.notice,
});

type Errors = Partial<Record<keyof Form, string>>;

/* The same limits firestore.rules enforces. */
function check(form: Form): { errors: Errors; value: StoreSettings | null } {
  const errors: Errors = {};
  const email = form.email.trim();
  const phone = form.phone.trim();
  const hours = form.hours.trim();
  const notice = form.notice.trim();
  const shipping = form.freeShippingFrom.trim();
  const days = form.returnDays.trim();

  if (!email) errors.email = "Enter the email address that receives order requests.";
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > LIMITS.email) errors.email = "Enter a valid email address.";

  if (phone && (!/^[\d\s()+.\-xX]+$/.test(phone) || (phone.match(/\d/g) ?? []).length < 7 || phone.length > LIMITS.phone)) {
    errors.phone = "Enter a phone number with at least seven digits, or leave it empty to hide it.";
  }

  if (!hours) errors.hours = "Enter your opening hours.";
  else if (hours.length > LIMITS.hours) errors.hours = `Keep the hours under ${LIMITS.hours} characters.`;

  const shippingNumber = Number(shipping);
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(shipping) || shippingNumber > LIMITS.freeShippingFrom) errors.freeShippingFrom = "Enter dollars and cents, such as 75 or 75.50.";

  const daysNumber = Number(days);
  if (!/^\d{1,3}$/.test(days) || daysNumber > LIMITS.returnDays) errors.returnDays = `Enter a whole number of days, from 0 to ${LIMITS.returnDays}.`;

  if (notice.length > LIMITS.notice) errors.notice = `Keep the notice under ${LIMITS.notice} characters.`;

  if (Object.keys(errors).length) return { errors, value: null };
  return { errors, value: { email, phone, hours, freeShippingFrom: shippingNumber, returnDays: daysNumber, notice } };
}

export default function Settings() {
  const connected = isFirebaseConfigured();
  const { session } = useAdminAuth();
  const toast = useToast();
  const [doc, setDoc] = useState<StoreDoc | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Form>(() => toForm(DEFAULT_SETTINGS));
  const [baseline, setBaseline] = useState<Form>(() => toForm(DEFAULT_SETTINGS));
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await readStoreDoc("settings");
      const loaded = toForm(next.exists ? readSettings(next.data) : DEFAULT_SETTINGS);
      setDoc(next);
      setForm(loaded);
      setBaseline(loaded);
      setShown(false);
    } catch (problem) {
      setError(problem instanceof StoreError ? problem.message : "That did not work.");
    }
  }, []);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  const { errors, value } = useMemo(() => check(form), [form]);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  const header = <PageHeader title="Store details" lede="Contact details, hours and shop terms shown on the website. Only owners can change these." />;
  if (!connected) {
    return (
      <>
        {header}
        <Card>
          <Empty>Store details can be edited once Firebase is connected. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID, then rebuild.</Empty>
        </Card>
      </>
    );
  }

  const set = (key: keyof Form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const show = (key: keyof Form) => (shown ? errors[key] : undefined);

  const save = async () => {
    setShown(true);
    if (!value) return toast("Fix the fields marked below first.", "danger");
    setBusy(true);
    try {
      await writeSettings(value, session!.email);
      toast("Saved. Publish to put the change on the website.");
      await load();
    } catch (failure) {
      toast(failure instanceof StoreError ? failure.message : "That did not work.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const problem = (key: keyof Form) => {
    const text = show(key);
    return text ? (
      <p className="admin-help" role="alert" style={{ color: "var(--a-danger)" }}>
        {text}
      </p>
    ) : null;
  };

  return (
    <>
      {header}
      <PublishBar savedAt={doc?.updatedAt ?? null} />

      {error && (
        <div className="mb-4">
          <Banner tone="warn">{error}</Banner>
        </div>
      )}
      {doc && !doc.exists && (
        <div className="mb-4">
          <Banner tone="info">These are the website's built-in details. Nothing has been saved yet.</Banner>
        </div>
      )}

      {doc === null && !error ? (
        <Card>
          <Spinner label="Loading the details" />
        </Card>
      ) : (
        <Card>
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Field label="Order email" htmlFor="set-email" help="Order requests are sent here, and customers see it on the website.">
                  <input id="set-email" className="admin-input" type="email" inputMode="email" autoComplete="off" maxLength={LIMITS.email} aria-invalid={Boolean(show("email"))} value={form.email} onChange={set("email")} />
                </Field>
                {problem("email")}
              </div>
              <div>
                <Field label="Phone" htmlFor="set-phone" help="Leave empty to hide the phone number on the website.">
                  <input id="set-phone" className="admin-input" type="tel" inputMode="tel" autoComplete="off" maxLength={LIMITS.phone} aria-invalid={Boolean(show("phone"))} value={form.phone} onChange={set("phone")} />
                </Field>
                {problem("phone")}
              </div>
            </div>

            <div>
              <Field label="Hours" htmlFor="set-hours" help="For example: Monday to Friday, 9 am to 5 pm Eastern.">
                <input id="set-hours" className="admin-input" maxLength={LIMITS.hours} aria-invalid={Boolean(show("hours"))} value={form.hours} onChange={set("hours")} />
              </Field>
              {problem("hours")}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Field label="Free shipping from (US dollars)" htmlFor="set-ship" help="The order value from which shipping is free.">
                  <input id="set-ship" className="admin-input tabular-nums" inputMode="decimal" autoComplete="off" aria-invalid={Boolean(show("freeShippingFrom"))} value={form.freeShippingFrom} onChange={set("freeShippingFrom")} />
                </Field>
                {problem("freeShippingFrom")}
              </div>
              <div>
                <Field label="Return window (days)" htmlFor="set-days" help="How many days a customer has to ask for a return.">
                  <input id="set-days" className="admin-input tabular-nums" inputMode="numeric" autoComplete="off" aria-invalid={Boolean(show("returnDays"))} value={form.returnDays} onChange={set("returnDays")} />
                </Field>
                {problem("returnDays")}
              </div>
            </div>

            <div>
              <Field label="Notice" htmlFor="set-notice" help={`A short line shown at the top of every page. Leave empty to show nothing. ${form.notice.length} of ${LIMITS.notice} characters.`}>
                <textarea id="set-notice" className="admin-textarea" style={{ minHeight: 72 }} maxLength={LIMITS.notice} aria-invalid={Boolean(show("notice"))} value={form.notice} onChange={set("notice")} />
              </Field>
              {problem("notice")}
            </div>

            {doc?.updatedBy && doc.updatedAt && <p className="admin-help m-0">Last saved by {doc.updatedBy}.</p>}

            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="admin-btn admin-btn-quiet" disabled={busy || !dirty} onClick={() => { setForm(baseline); setShown(false); }}>
                Discard changes
              </button>
              <button type="submit" className="admin-btn admin-btn-primary" disabled={busy || !dirty}>
                {busy ? "Saving" : "Save changes"}
              </button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
