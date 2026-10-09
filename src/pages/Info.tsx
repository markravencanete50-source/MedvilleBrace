/*
  The smaller content pages: brands index, clinicians, about, contact,
  questions, policies and the unknown-address page.
*/
import { Link, useParams } from "react-router-dom";
import { Building2, Clock, HeartHandshake, Mail, PackageCheck, Ruler, Stethoscope, Truck } from "lucide-react";
import Container from "../components/Container";
import PageHero from "../components/PageHero";
import Photo from "../components/Photo";
import Button from "../components/Button";
import NotFound from "./NotFound";
import { BRANDS, PRODUCTS } from "../data/catalog";
import { COMPANY } from "../data/site";
import { FAQS, POLICIES, policyBySlug } from "../data/policies";
import { usePageMeta } from "../lib/usePageMeta";

export function Brands() {
  usePageMeta({ title: "Brands", description: "Orthopedic brands carried by Medville Brace, with the number of products from each." });
  return (
    <>
      <PageHero eyebrow="Shop" title="Brands we carry" intro="Genuine devices from established orthopedic manufacturers. Brand names belong to their owners." crumbs={[{ label: "Brands" }]} />
      <Container className="py-12">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {BRANDS.map((b) => (
            <li key={b.slug}>
              <Link to={`/brands/${b.slug}`} className="flex h-28 flex-col items-center justify-center rounded-card border border-line bg-surface-raised px-3 text-center shadow-raised hover:border-ink">
                <span className="font-display text-h3 font-bold tracking-tight">{b.name}</span>
                <span className="mt-1 text-caption text-ink-subtle">{b.count} products</span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}

export function Clinicians() {
  usePageMeta({ title: "Clinician Partner Program", description: "Volume pricing, one contact for every brand, and orders shipped to your clinic or to your patient." });
  const subject = encodeURIComponent("Clinician Partner Program");
  const body = encodeURIComponent("Clinic or practice name:\nYour name and role:\nState:\nDevices you order most often:\nRoughly how many a month:\n");
  return (
    <>
      <PageHero eyebrow="For clinics and care teams" title="Clinician Partner Program" intro="For physical therapists, orthopedic clinics, orthotists, home health teams and surgery centers that order braces regularly." crumbs={[{ label: "Clinicians" }]} />
      <Container className="grid gap-10 py-12 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Building2, t: "Volume pricing", d: "Account pricing on the devices you order most, agreed once and applied to every order." },
              { icon: Truck, t: "Ship where it is needed", d: "To your clinic for stock, or straight to your patient's home with your clinic's details on the paperwork." },
              { icon: Ruler, t: "Sizing support", d: "Send measurements with an order and we check them against the manufacturer's chart before anything ships." },
              { icon: PackageCheck, t: "One contact, many brands", d: `${BRANDS.length} manufacturers and ${Math.floor(PRODUCTS.length / 50) * 50}+ products through one account and one invoice.` },
            ].map(({ icon: Icon, t, d }) => (
              <li key={t} className="rounded-card border border-line bg-surface-raised p-5">
                <Icon className="h-6 w-6 text-brand" aria-hidden="true" />
                <p className="mt-3 font-display font-semibold">{t}</p>
                <p className="mt-1 text-small text-ink-muted">{d}</p>
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-card bg-wash p-6 text-on-dark sm:p-8">
            <Stethoscope className="h-7 w-7 text-brand-bright" aria-hidden="true" />
            <p className="mt-3 font-display text-h3 font-semibold">Apply in one email</p>
            <p className="mt-2 text-on-dark-brand">Tell us about your practice and the devices you order. We reply within two business days with account pricing.</p>
            <Button href={`mailto:${COMPANY.email}?subject=${subject}&body=${body}`} className="mt-5">
              <Mail className="h-4 w-4" aria-hidden="true" />
              Email the partner team
            </Button>
          </div>
        </div>
        <div className="space-y-4">
          <Photo name="rehab-gym" className="aspect-[4/3] w-full rounded-card object-cover" />
          <Photo name="fitting-afo" className="aspect-[4/3] w-full rounded-card object-cover" />
        </div>
      </Container>
    </>
  );
}

export function About() {
  usePageMeta({ title: "About us", description: "Medville Brace helps people find the right brace, in the right size, from the brands clinicians already trust." });
  return (
    <>
      <PageHero eyebrow="About" title="The right brace, in the right size." intro="Medville Brace brings together braces, supports and recovery products from established orthopedic manufacturers, with a person checking every size." crumbs={[{ label: "About" }]} />
      <Container className="grid gap-12 py-12 lg:grid-cols-2 lg:items-center">
        <div className="prose-mb">
          <h2>Why we started</h2>
          <p>Choosing a brace is confusing. Product names are long, size charts differ from brand to brand, and many devices are made for one side of the body. A wrong guess means a return, a delay and a recovery that waits.</p>
          <p>So we built the store around two ideas. First, start from the body, not the catalog: you pick where you need support, and we show what fits that region and that stage of recovery. Second, check the size before anyone pays. Every order begins as a request, and a person on our team reads it.</p>
          <h2>What we promise</h2>
          <ul>
            <li>Genuine devices from the manufacturers clinicians already prescribe.</li>
            <li>Plain information, with no promises about outcomes.</li>
            <li>Your size checked against the manufacturer's chart before you pay.</li>
            <li>No advertising trackers on this website.</li>
          </ul>
        </div>
        <Photo name="physio-leg" className="aspect-[4/3] w-full rounded-card object-cover" />
      </Container>
      <section className="bg-soft-band py-12">
        <Container className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: HeartHandshake, t: "People first", d: "Real replies from a small team, not a bot." },
            { icon: Ruler, t: "Fit first", d: "Sizing help before, during and after your order." },
            { icon: Stethoscope, t: "Clinician aligned", d: "We support your care plan. We never replace it." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-card border border-line bg-surface-raised p-6">
              <Icon className="h-6 w-6 text-brand" aria-hidden="true" />
              <p className="mt-3 font-display font-semibold">{t}</p>
              <p className="mt-1 text-small text-ink-muted">{d}</p>
            </div>
          ))}
        </Container>
      </section>
    </>
  );
}

export function Contact() {
  usePageMeta({ title: "Contact", description: "Email Medville Brace with a sizing question, an order question or a return." });
  return (
    <>
      <PageHero eyebrow="Help" title="Contact us" intro="Questions about a size, an order or a return. A person reads every message." crumbs={[{ label: "Contact" }]} />
      <Container className="grid gap-8 py-12 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <a href={`mailto:${COMPANY.email}`} className="flex items-start gap-4 rounded-card border border-line bg-surface-raised p-6 hover:border-ink">
            <Mail className="h-6 w-6 text-brand" aria-hidden="true" />
            <span>
              <span className="block font-display font-semibold">Email</span>
              <span className="break-all text-ink-muted">{COMPANY.email}</span>
            </span>
          </a>
          {COMPANY.phone && (
            <a href={`tel:${COMPANY.phone.replace(/[^\d+]/g, "")}`} className="flex items-start gap-4 rounded-card border border-line bg-surface-raised p-6 hover:border-ink">
              <span>
                <span className="block font-display font-semibold">Phone</span>
                <span className="text-ink-muted">{COMPANY.phone}</span>
              </span>
            </a>
          )}
          <div className="flex items-start gap-4 rounded-card border border-line bg-surface-raised p-6">
            <Clock className="h-6 w-6 text-brand" aria-hidden="true" />
            <span>
              <span className="block font-display font-semibold">Hours</span>
              <span className="text-ink-muted">{COMPANY.hours}. We reply within one business day.</span>
            </span>
          </div>
          <div className="rounded-card bg-brand-tint p-6 text-small">
            <p className="font-semibold">Sending a sizing question?</p>
            <p className="mt-1 text-ink-muted">Include the product name, the side you need and your measurements in inches. Please do not send medical records.</p>
          </div>
        </div>
        <Photo name="clinic-session" className="aspect-[4/3] w-full rounded-card object-cover" />
      </Container>
    </>
  );
}

export function Faq() {
  usePageMeta({ title: "Questions and answers", description: "How paying, sizing, insurance, returns and renewed items work at Medville Brace." });
  return (
    <>
      <PageHero eyebrow="Help" title="Questions and answers" crumbs={[{ label: "Questions" }]} />
      <Container className="py-12">
        <div className="mx-auto max-w-3xl divide-y divide-line rounded-card border border-line bg-surface-raised">
          {FAQS.map((f) => (
            <details key={f.q} className="group p-6">
              <summary className="cursor-pointer list-none font-display font-semibold">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <span className="text-h3 text-brand transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-ink-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </>
  );
}

export function PolicyPage() {
  const { slug = "" } = useParams();
  const p = policyBySlug(slug);
  usePageMeta({ title: p?.title ?? "Page not found", description: p?.description, noindex: !p });
  if (!p) return <NotFound />;
  return (
    <>
      <PageHero eyebrow="Policies" title={p.title} intro={p.description} crumbs={[{ label: "Policies" }, { label: p.title }]} />
      <Container className="grid gap-10 py-12 lg:grid-cols-[1fr_260px]">
        <article className="prose-mb max-w-3xl">
          {p.sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              {s.paragraphs.map((x, i) => (
                <p key={i}>{x}</p>
              ))}
              {s.list && (
                <ul>
                  {s.list.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>
        <nav aria-label="Other policies" className="h-fit rounded-card border border-line bg-surface-raised p-5 lg:sticky lg:top-[180px]">
          <p className="font-display text-small font-semibold">Policies</p>
          <ul className="mt-3 space-y-1 text-small">
            {POLICIES.map((x) => (
              <li key={x.slug}>
                <Link to={`/policies/${x.slug}`} aria-current={x.slug === p.slug ? "page" : undefined} className={`block rounded-md px-2.5 py-1.5 ${x.slug === p.slug ? "bg-ink text-on-dark" : "hover:bg-surface"}`}>
                  {x.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </>
  );
}
