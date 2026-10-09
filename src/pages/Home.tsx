import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardCheck, MailCheck, PackageCheck, Stethoscope } from "lucide-react";
import Container from "../components/Container";
import Button from "../components/Button";
import Photo from "../components/Photo";
import ProductCard from "../components/ProductCard";
import TrustStrip from "../components/TrustStrip";
import { BRANDS, CATEGORIES, PRODUCTS, pluralCategory, regionFacets, sortProducts } from "../data/catalog";
import { REGIONS } from "../data/taxonomy";
import { GUIDES } from "../data/guides";
import { FAQS } from "../data/policies";
import { usePageMeta } from "../lib/usePageMeta";

const PICK_TABS = [
  { id: "all", label: "All" },
  { id: "knee", label: "Knee" },
  { id: "foot-ankle", label: "Foot and Ankle" },
  { id: "back-hip", label: "Back" },
  { id: "therapy", label: "Cold therapy" },
];

const STEPS = [
  { icon: ClipboardCheck, title: "Choose and send", text: "Pick the product, size and side, then send an order request. It takes two minutes and asks for no card details." },
  { icon: MailCheck, title: "We check and confirm", text: "A person checks your size against the manufacturer's chart, confirms stock and emails you the final total within one business day." },
  { icon: PackageCheck, title: "Approve and receive", text: "Pay through the secure link in our email. We ship with tracking, and most swaps for size are free." },
];

const counts = Object.fromEntries(REGIONS.map((r) => [r.slug, regionFacets(r.slug).count]));

export default function Home() {
  usePageMeta({});
  const [tab, setTab] = useState("all");
  const picks = useMemo(() => {
    const list = PRODUCTS.filter((p) => p.images > 0 && p.available && p.category !== "parts-accessories" && (tab === "all" || p.region === tab));
    return sortProducts(list, "featured").slice(0, 8);
  }, [tab]);
  const coldPicks = useMemo(
    () => sortProducts(PRODUCTS.filter((p) => p.region === "therapy" && p.images > 0 && /unit|system|machine|polar care|cold rush|cube|kodiak/i.test(p.title) && !/pad|tubing|cord|cable|replacement/i.test(p.title)), "featured").slice(0, 3),
    [],
  );
  const topTypes = CATEGORIES.filter((c) => c.slug !== "parts-accessories").slice(0, 10);

  return (
    <>
      {/* Hero: a short way in by body region, before any product grid. */}
      <section className="relative overflow-hidden bg-wash text-on-dark">
        <div className="absolute inset-y-0 right-0 hidden w-[58%] lg:block">
          <Photo name="hero-physio-knee" priority className="h-full w-full object-cover" />
          <div className="bg-hero-fade absolute inset-0" />
        </div>
        <Container className="relative py-14 sm:py-20 lg:py-24">
          <div className="max-w-xl">
            <p className="font-display text-caption font-semibold uppercase tracking-[0.2em] text-on-dark-accent">Braces, supports and recovery</p>
            <h1 className="mt-4 text-display font-bold leading-[1.05]">
              Support that fits <span className="text-brand-bright">your recovery.</span>
            </h1>
            <p className="mt-5 text-body-lg text-on-dark-brand">
              Over {Math.floor(PRODUCTS.length / 50) * 50} braces and recovery products from the brands clinicians already prescribe. Tell us where you need support, and a real person checks your size before you pay.
            </p>
            <div className="mt-8 rounded-card border border-on-dark/15 bg-navy-raised/70 p-5 backdrop-blur">
              <p className="font-display text-small font-semibold">Where do you need support?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {REGIONS.map((r) => (
                  <Link key={r.slug} to={`/fit-finder?region=${r.slug}`} className="rounded-full border border-on-dark/30 px-3.5 py-2 text-small text-on-dark hover:border-brand-bright hover:bg-brand-bright hover:text-ink">
                    {r.name}
                  </Link>
                ))}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button to="/fit-finder">Start the Fit Finder</Button>
              <Button to="/shop" variant="ghost-dark">
                Browse everything
              </Button>
            </div>
          </div>
        </Container>
        <div className="lg:hidden">
          <Photo name="hero-physio-knee" priority className="h-56 w-full object-cover sm:h-72" />
        </div>
      </section>

      <TrustStrip />

      {/* Body regions */}
      <section className="py-16">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-h2 font-bold">Shop by body region</h2>
              <p className="mt-2 max-w-xl text-ink-muted">Start where it hurts. Each region lists its device types and the conditions they are most often used for.</p>
            </div>
            <Link to="/shop" className="inline-flex items-center gap-1.5 font-display text-small font-semibold text-brand hover:underline">
              All products <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {REGIONS.map((r, i) => (
              <li key={r.slug}>
                <Link to={`/shop/${r.slug}`} className="group relative block aspect-[4/5] overflow-hidden rounded-card sm:aspect-[4/3.6]">
                  <Photo name={r.photo} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" priority={i < 2} />
                  <div className="bg-photo-fade absolute inset-0" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="font-display text-[1.05rem] font-semibold text-on-dark sm:text-h3">{r.name}</p>
                    <p className="text-caption text-on-dark-brand">{counts[r.slug]} products</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Device types */}
      <section className="border-y border-line bg-surface-raised py-12">
        <Container>
          <h2 className="text-h3 font-bold">Or go straight to a device type</h2>
          <ul className="mt-5 flex flex-wrap gap-2.5">
            {topTypes.map((c) => (
              <li key={c.slug}>
                <Link to={`/category/${c.slug}`} className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-canvas px-4 py-2.5 text-small font-semibold hover:border-ink hover:bg-ink hover:text-on-dark">
                  {pluralCategory(c.name)}
                  <span className="font-normal opacity-70">{c.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Picks */}
      <section className="py-16">
        <Container>
          <h2 className="text-h2 font-bold">Most-chosen for recovery</h2>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1 no-scrollbar" role="tablist" aria-label="Filter picks by region">
            {PICK_TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`shrink-0 rounded-full px-4 py-2 text-small font-semibold ${tab === t.id ? "bg-ink text-on-dark" : "border border-line-strong hover:border-ink"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4" role="tabpanel">
            {picks.map((p) => (
              <li key={p.slug}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* How ordering works */}
      <section className="bg-band py-16 text-on-dark">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.4fr] lg:items-center">
            <div>
              <p className="font-display text-caption font-semibold uppercase tracking-[0.2em] text-on-dark-accent">How ordering works</p>
              <h2 className="mt-3 text-h2 font-bold">The right size, before you pay.</h2>
              <p className="mt-4 text-on-dark-brand">Most brace returns come down to size. So we check yours first. No card details are ever taken on this website.</p>
              <Button to="/policies/how-ordering-works" variant="ghost-dark" className="mt-6">
                Read the details
              </Button>
            </div>
            <ol className="grid gap-4 sm:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="rounded-card border border-on-dark/15 bg-navy-raised/60 p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-bright text-ink">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="font-display text-caption font-semibold text-on-dark-muted">Step {i + 1}</span>
                  </div>
                  <p className="mt-4 font-display font-semibold">{title}</p>
                  <p className="mt-2 text-small text-on-dark-brand">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </section>

      {/* Cold therapy spotlight */}
      <section className="py-16">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.25fr] lg:items-center">
          <div className="relative overflow-hidden rounded-card">
            <Photo name="region-therapy" className="aspect-[4/3] w-full object-cover" />
          </div>
          <div>
            <p className="font-display text-caption font-semibold uppercase tracking-[0.2em] text-brand">Cold and recovery</p>
            <h2 className="mt-3 text-h2 font-bold">Cold therapy that keeps going while you rest.</h2>
            <p className="mt-4 text-ink-muted">A circulating unit keeps a pad cold for hours, with no ice packs to swap. Pads are shaped for the knee, shoulder, back and ankle.</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              {coldPicks.map((p) => (
                <li key={p.slug}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
            <Link to="/guides/cold-therapy-at-home" className="mt-6 inline-flex items-center gap-1.5 font-display text-small font-semibold text-brand hover:underline">
              How to use cold therapy safely <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </Container>
      </section>

      {/* Guides */}
      <section className="bg-soft-band py-16">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-h2 font-bold">Recovery guides</h2>
            <Link to="/guides" className="inline-flex items-center gap-1.5 font-display text-small font-semibold text-brand hover:underline">
              All guides <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <ul className="mt-8 grid gap-5 md:grid-cols-3">
            {GUIDES.slice(0, 3).map((g) => (
              <li key={g.slug}>
                <Link to={`/guides/${g.slug}`} className="group block h-full overflow-hidden rounded-card border border-line bg-surface-raised shadow-raised hover:shadow-raised-hover">
                  <Photo name={g.photo} className="aspect-[16/9] w-full object-cover" />
                  <div className="p-5">
                    <p className="text-caption text-ink-subtle">{g.minutes} minute read</p>
                    <p className="mt-1 font-display text-h3 font-semibold group-hover:underline">{g.title}</p>
                    <p className="mt-2 text-small text-ink-muted">{g.description}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Brands */}
      <section className="py-16">
        <Container>
          <h2 className="text-h2 font-bold">Brands we carry</h2>
          <p className="mt-2 max-w-xl text-ink-muted">Genuine devices from established orthopedic manufacturers.</p>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {BRANDS.slice(0, 10).map((b) => (
              <li key={b.slug}>
                <Link to={`/brands/${b.slug}`} className="flex h-20 flex-col items-center justify-center rounded-lg border border-line bg-surface-raised px-3 text-center hover:border-ink">
                  <span className="font-display text-[1.05rem] font-bold tracking-tight">{b.name}</span>
                  <span className="text-caption text-ink-subtle">{b.count} products</span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Clinicians */}
      <section className="pb-16">
        <Container>
          <div className="grid overflow-hidden rounded-sheet bg-wash text-on-dark lg:grid-cols-2">
            <div className="p-8 sm:p-12">
              <Stethoscope className="h-8 w-8 text-brand-bright" aria-hidden="true" />
              <h2 className="mt-4 text-h2 font-bold">For clinics and care teams</h2>
              <p className="mt-4 text-on-dark-brand">Volume pricing, one contact for every brand, and orders shipped to your clinic or straight to your patient.</p>
              <Button to="/clinicians" className="mt-6">
                Join the Clinician Partner Program
              </Button>
            </div>
            {/* The photograph is portrait; positioned absolutely so it fills the
                cell instead of setting the band's height. */}
            <div className="relative min-h-64">
              <Photo name="clinic-session" className="absolute inset-0 h-full w-full object-cover object-[50%_35%]" />
            </div>
          </div>
        </Container>
      </section>

      {/* Questions */}
      <section className="border-t border-line bg-surface-raised py-16">
        <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-h2 font-bold">Common questions</h2>
            <p className="mt-3 text-ink-muted">Short answers about paying, sizing and returns.</p>
            <Button to="/faq" variant="ghost" className="mt-6">
              All questions
            </Button>
          </div>
          <div className="divide-y divide-line rounded-card border border-line bg-canvas">
            {FAQS.slice(0, 4).map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="cursor-pointer list-none font-display font-semibold marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span className="text-h3 text-brand transition-transform group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-small text-ink-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
