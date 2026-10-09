import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Copy, Mail } from "lucide-react";
import Container from "../components/Container";
import PageHero from "../components/PageHero";
import Button from "../components/Button";
import { money, productBySlug } from "../data/catalog";
import { COMPANY, ORDER_ENDPOINT } from "../data/site";
import { useStore } from "../lib/store";
import { usePageMeta } from "../lib/usePageMeta";

/*
  The order request. Two honest paths, decided by VITE_ORDER_ENDPOINT:
  - set: the request is posted as JSON, and only a successful response shows
    the "received" screen;
  - empty: the request is written into an email the visitor sends from their
    own mail app, and the screen says exactly that. There is no path to a
    "received" message unless something was actually received.
  No card details are collected here, ever.
*/
const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" ");

type Fields = { name: string; email: string; phone: string; address1: string; address2: string; city: string; state: string; zip: string; notes: string; agree: boolean };
const EMPTY: Fields = { name: "", email: "", phone: "", address1: "", address2: "", city: "", state: "", zip: "", notes: "", agree: false };

function validate(f: Fields) {
  const e: Partial<Record<keyof Fields, string>> = {};
  if (f.name.trim().length < 2) e.name = "Enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Enter an email address we can reply to.";
  if (f.phone && f.phone.replace(/\D/g, "").length < 10) e.phone = "Enter a 10-digit phone number, or leave it empty.";
  if (f.address1.trim().length < 4) e.address1 = "Enter the street address.";
  if (f.city.trim().length < 2) e.city = "Enter the city.";
  if (!f.state) e.state = "Choose the state.";
  if (!/^\d{5}(-\d{4})?$/.test(f.zip.trim())) e.zip = "Enter a 5-digit ZIP code.";
  if (!f.agree) e.agree = "Please confirm before sending.";
  return e;
}

export default function RequestOrder() {
  usePageMeta({ title: "Send an order request", noindex: true });
  const { cart, cartTotal, clearCart } = useStore();
  const [f, setF] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [state, setState] = useState<"form" | "sending" | "sent" | "email" | "failed">("form");
  const [copied, setCopied] = useState(false);

  /* A result screen replaces the form; start it at the top, not where the button was. */
  useEffect(() => {
    if (state === "sent" || state === "email") window.scrollTo(0, 0);
  }, [state]);

  const lines = cart
    .map((l) => {
      const p = productBySlug(l.slug);
      return p ? { ...l, title: `${p.brand} ${p.title}` } : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const summaryText = () =>
    [
      "Order request",
      "",
      ...lines.map((l, i) => `${i + 1}. ${l.title}${l.options.length ? ` (${l.options.map((o, j) => `${l.optionNames[j] ?? "Option"}: ${o}`).join(", ")})` : ""}${l.sku ? `, SKU ${l.sku}` : ""}, qty ${l.qty}, ${money(l.price * l.qty)}`),
      "",
      `Estimated subtotal: ${money(cartTotal)}`,
      "",
      `Name: ${f.name}`,
      `Email: ${f.email}`,
      f.phone ? `Phone: ${f.phone}` : "",
      `Ship to: ${f.address1}${f.address2 ? `, ${f.address2}` : ""}, ${f.city}, ${f.state} ${f.zip}`,
      f.notes ? `Notes: ${f.notes}` : "",
    ]
      .filter((x) => x !== "")
      .join("\n");

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value;
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(f);
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`f-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    if (!ORDER_ENDPOINT) {
      const href = `mailto:${COMPANY.email}?subject=${encodeURIComponent(`Order request from ${f.name}`)}&body=${encodeURIComponent(summaryText())}`;
      window.location.href = href;
      setState("email");
      return;
    }
    setState("sending");
    try {
      const res = await fetch(ORDER_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name: f.name, email: f.email, phone: f.phone, address: { line1: f.address1, line2: f.address2, city: f.city, state: f.state, zip: f.zip } },
          notes: f.notes,
          items: lines.map((l) => ({ slug: l.slug, title: l.title, sku: l.sku, options: l.options, optionNames: l.optionNames, qty: l.qty, unitPrice: l.price })),
          estimatedSubtotal: cartTotal,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      clearCart();
      setState("sent");
    } catch {
      setState("failed");
    }
  };

  const field = "mt-1.5 min-h-[48px] w-full rounded-md border bg-surface-raised px-3.5 text-small focus:border-brand focus:outline-none";
  const err = (k: keyof Fields) =>
    errors[k] && (
      <p id={`e-${k}`} className="mt-1.5 flex items-center gap-1.5 text-caption text-danger">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        {errors[k]}
      </p>
    );
  const input = (k: keyof Fields, label: string, opts: { type?: string; auto?: string; optional?: boolean } = {}) => (
    <div>
      <label htmlFor={`f-${k}`} className="text-small font-semibold">
        {label} {opts.optional && <span className="font-normal text-ink-subtle">(optional)</span>}
      </label>
      <input id={`f-${k}`} type={opts.type ?? "text"} autoComplete={opts.auto} value={f[k] as string} onChange={set(k)} aria-invalid={Boolean(errors[k])} aria-describedby={errors[k] ? `e-${k}` : undefined} className={`${field} ${errors[k] ? "border-danger" : "border-line-strong"}`} />
      {err(k)}
    </div>
  );

  if (state === "sent")
    return (
      <>
        <PageHero title="Request received" crumbs={[{ label: "Order request" }]} />
        <Container className="py-12">
          <div className="max-w-xl rounded-card border border-line bg-surface-raised p-8">
            <CheckCircle2 className="h-10 w-10 text-brand" aria-hidden="true" />
            <p className="mt-4 font-display text-h3 font-semibold">Thank you, {f.name.split(" ")[0]}.</p>
            <p className="mt-2 text-ink-muted">We have your request. A member of our team will check your sizes and email {f.email} with the confirmed total within one business day. Nothing has been charged.</p>
            <Button to="/shop" variant="ghost" className="mt-6">
              Continue browsing
            </Button>
          </div>
        </Container>
      </>
    );

  if (state === "email")
    return (
      <>
        <PageHero title="Send the email to finish" crumbs={[{ label: "Order request" }]} />
        <Container className="py-12">
          <div className="max-w-2xl rounded-card border border-line bg-surface-raised p-8">
            <Mail className="h-10 w-10 text-brand" aria-hidden="true" />
            <p className="mt-4 font-display text-h3 font-semibold">Your email app should now be open.</p>
            <p className="mt-2 text-ink-muted">
              It holds your order request, addressed to {COMPANY.email}. Press send in your email app to finish. We have not received anything until that email arrives.
            </p>
            <p className="mt-4 text-small text-ink-muted">If no email app opened, copy the text below and email it to {COMPANY.email}.</p>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-brand-tint p-4 text-caption">{summaryText()}</pre>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                variant="primary"
                onClick={() => {
                  navigator.clipboard?.writeText(summaryText()).then(() => setCopied(true), () => setCopied(false));
                }}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                {copied ? "Copied" : "Copy the text"}
              </Button>
              <Button variant="ghost" onClick={() => setState("form")}>
                Back to the form
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  clearCart();
                  setState("form");
                }}
              >
                I sent it, clear my cart
              </Button>
            </div>
          </div>
        </Container>
      </>
    );

  return (
    <>
      <PageHero title="Send an order request" intro="No payment is taken here. We check your sizes and stock, then email you the final total and a secure payment link." crumbs={[{ label: "Cart", to: "/cart" }, { label: "Order request" }]} />
      <Container className="py-10">
        {lines.length === 0 ? (
          <div className="rounded-card border border-line bg-surface-raised p-10 text-center">
            <p className="font-display text-h3 font-semibold">Your cart is empty.</p>
            <Button to="/shop" className="mt-6">
              Browse products
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-[1fr_380px]">
            <div className="space-y-8">
              {state === "failed" && (
                <div role="alert" className="flex gap-3 rounded-md border border-danger bg-surface-raised p-4 text-small">
                  <AlertCircle className="h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
                  <p>
                    Your request could not be sent. Please try again in a moment, or email it to{" "}
                    <a className="underline" href={`mailto:${COMPANY.email}?subject=${encodeURIComponent("Order request")}&body=${encodeURIComponent(summaryText())}`}>
                      {COMPANY.email}
                    </a>
                    .
                  </p>
                </div>
              )}
              <fieldset className="rounded-card border border-line bg-surface-raised p-6">
                <legend className="px-2 font-display font-semibold">Contact</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">{input("name", "Full name", { auto: "name" })}</div>
                  {input("email", "Email", { type: "email", auto: "email" })}
                  {input("phone", "Phone", { type: "tel", auto: "tel", optional: true })}
                </div>
              </fieldset>
              <fieldset className="rounded-card border border-line bg-surface-raised p-6">
                <legend className="px-2 font-display font-semibold">Ship to</legend>
                <div className="grid gap-4 sm:grid-cols-6">
                  <div className="sm:col-span-6">{input("address1", "Street address", { auto: "address-line1" })}</div>
                  <div className="sm:col-span-6">{input("address2", "Apartment, suite or unit", { auto: "address-line2", optional: true })}</div>
                  <div className="sm:col-span-3">{input("city", "City", { auto: "address-level2" })}</div>
                  <div className="sm:col-span-1">
                    <label htmlFor="f-state" className="text-small font-semibold">
                      State
                    </label>
                    <select id="f-state" value={f.state} onChange={set("state")} autoComplete="address-level1" aria-invalid={Boolean(errors.state)} className={`${field} ${errors.state ? "border-danger" : "border-line-strong"}`}>
                      <option value="">-</option>
                      {STATES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    {err("state")}
                  </div>
                  <div className="sm:col-span-2">{input("zip", "ZIP code", { auto: "postal-code" })}</div>
                </div>
              </fieldset>
              <fieldset className="rounded-card border border-line bg-surface-raised p-6">
                <legend className="px-2 font-display font-semibold">Sizing notes</legend>
                <label htmlFor="f-notes" className="text-small text-ink-muted">
                  Add your measurements or a question about size. Please do not include medical records.
                </label>
                <textarea id="f-notes" rows={4} value={f.notes} onChange={set("notes")} className="mt-2 w-full rounded-md border border-line-strong bg-surface-raised p-3.5 text-small focus:border-brand focus:outline-none" />
              </fieldset>
              <div>
                <label className="flex items-start gap-3 text-small">
                  <input id="f-agree" type="checkbox" checked={f.agree} onChange={set("agree")} className="mt-0.5 h-5 w-5 accent-[#00293b]" aria-invalid={Boolean(errors.agree)} />
                  <span>
                    I understand this is a request, not a payment, and I have read the{" "}
                    <Link to="/policies/medical-disclaimer" className="text-brand underline">
                      medical disclaimer
                    </Link>{" "}
                    and{" "}
                    <Link to="/policies/privacy" className="text-brand underline">
                      privacy policy
                    </Link>
                    .
                  </span>
                </label>
                {err("agree")}
              </div>
            </div>

            <aside className="h-fit rounded-card border border-line bg-surface-raised p-6 lg:sticky lg:top-[180px]">
              <h2 className="font-display text-h3 font-bold">Your request</h2>
              <ul className="mt-4 divide-y divide-line text-small">
                {lines.map((l) => (
                  <li key={l.key} className="flex justify-between gap-3 py-3">
                    <span>
                      <span className="block font-semibold">{l.title}</span>
                      {l.options.length > 0 && <span className="block text-caption text-ink-subtle">{l.options.join(" · ")}</span>}
                      <span className="text-caption text-ink-subtle">Qty {l.qty}</span>
                    </span>
                    <span className="font-semibold">{money(l.price * l.qty)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-line pt-3">
                <span className="text-small text-ink-muted">Estimated subtotal</span>
                <span className="font-display font-bold">{money(cartTotal)}</span>
              </div>
              <Button type="submit" className="mt-5 w-full" disabled={state === "sending"}>
                {state === "sending" ? "Sending..." : ORDER_ENDPOINT ? "Send order request" : "Write the request email"}
              </Button>
              {!ORDER_ENDPOINT && <p className="mt-3 text-caption text-ink-subtle">Your email app will open with the request filled in, ready to send to {COMPANY.email}.</p>}
            </aside>
          </form>
        )}
      </Container>
    </>
  );
}
