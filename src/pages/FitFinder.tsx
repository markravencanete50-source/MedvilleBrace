import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import Container from "../components/Container";
import PageHero from "../components/PageHero";
import ProductCard from "../components/ProductCard";
import Button from "../components/Button";
import Photo from "../components/Photo";
import { PRODUCTS, featuredScore, regionFacets, slugifyCondition, type Product } from "../data/catalog";
import { REGIONS, regionBySlug } from "../data/taxonomy";
import { usePageMeta } from "../lib/usePageMeta";

/*
  Fit Finder: four questions to a short list. It ranks; it does not
  prescribe. The result screen says so and points to the clinician.
*/
const STAGES = [
  {
    id: "acute",
    label: "Just injured, or after surgery",
    hint: "Protect and hold still",
    cats: ["walker-boot", "immobilizer", "hinged-knee-brace", "cervical-collar", "arm-sling", "tlso", "back-brace", "post-op-shoe", "splint", "hip-brace", "afo", "thumb-spica"],
  },
  {
    id: "active",
    label: "Recovering and getting active again",
    hint: "Stability while you move",
    cats: ["ankle-brace", "hinged-knee-brace", "unloader-brace", "patellar-strap", "counterforce-strap", "wrist-brace", "thumb-spica", "knee-support", "compression-sleeve", "si-belt", "elbow-brace", "shoulder-brace"],
  },
  {
    id: "everyday",
    label: "Everyday aches, strain or arthritis",
    hint: "Comfort for daily life",
    cats: ["compression-sleeve", "knee-support", "back-brace", "wrap", "insole", "night-splint", "unloader-brace", "wrist-brace", "abdominal-binder", "si-belt", "counterforce-strap"],
  },
  {
    id: "relief",
    label: "Pain and swelling relief",
    hint: "Cold, heat or TENS",
    cats: ["cold-therapy", "hot-cold-therapy", "tens-ems", "traction-device", "wrap"],
  },
];
const BUDGETS = [
  { id: "any", label: "Any budget", min: 0, max: Infinity },
  { id: "low", label: "Under $50", min: 0, max: 50 },
  { id: "mid", label: "$50 to $150", min: 50, max: 150 },
  { id: "high", label: "$150 and up", min: 150, max: Infinity },
];

export default function FitFinder() {
  usePageMeta({ title: "Fit Finder", description: "Answer four short questions about where you need support and why, and get a short list of braces and recovery products to discuss with your clinician." });
  const [sp] = useSearchParams();
  const initial = regionBySlug(sp.get("region") ?? "")?.slug ?? "";
  const [region, setRegion] = useState<string>(initial);
  const [condition, setCondition] = useState<string>("");
  const [stage, setStage] = useState<string>("");
  const [budget, setBudget] = useState<string>("");
  const [step, setStep] = useState(initial ? 1 : 0);

  const conditions = useMemo(() => (region ? regionFacets(region).conditions.slice(0, 10) : []), [region]);

  const results = useMemo(() => {
    if (step < 4) return [];
    const st = STAGES.find((s) => s.id === stage);
    const b = BUDGETS.find((x) => x.id === budget) ?? BUDGETS[0];
    const score = (p: Product) =>
      (st && st.cats.includes(p.category) ? 6 : 0) +
      (condition && p.conditions.some((c) => slugifyCondition(c) === condition) ? 5 : 0) +
      (p.available ? 1 : 0) +
      (p.images > 0 ? 1 : 0);
    return PRODUCTS.filter((p) => p.region === region && p.category !== "parts-accessories" && p.priceMin >= b.min && p.priceMin < b.max)
      .map((p) => ({ p, s: score(p) }))
      .filter((x) => x.s >= 6 || (!st && x.s > 0))
      .sort((a, b2) => b2.s - a.s || featuredScore(b2.p) - featuredScore(a.p))
      .slice(0, 12)
      .map((x) => x.p);
  }, [step, region, condition, stage, budget]);

  const reset = () => {
    setRegion("");
    setCondition("");
    setStage("");
    setBudget("");
    setStep(0);
  };

  const Choice = ({ on, onClick, title, hint }: { on: boolean; onClick: () => void; title: string; hint?: string }) => (
    <button type="button" onClick={onClick} aria-pressed={on} className={`flex min-h-[64px] w-full flex-col justify-center rounded-lg border px-4 py-3 text-left transition-colors ${on ? "border-ink bg-ink text-on-dark" : "border-line-strong bg-surface-raised hover:border-ink"}`}>
      <span className="font-display font-semibold">{title}</span>
      {hint && <span className={`text-caption ${on ? "text-on-dark-muted" : "text-ink-subtle"}`}>{hint}</span>}
    </button>
  );

  const QUESTIONS = ["Where do you need support?", "What is it for?", "Where are you in your recovery?", "What budget suits you?"];
  const r = regionBySlug(region);

  return (
    <>
      <PageHero eyebrow="Fit Finder" title="Four questions to a short list." intro="Tell us where you need support and why. We rank the catalog for you. Your clinician has the final word." crumbs={[{ label: "Fit Finder" }]} />
      <Container className="py-10">
        {step < 4 ? (
          <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
            <section aria-live="polite">
              <div className="flex items-center gap-2" aria-hidden="true">
                {QUESTIONS.map((_, i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand-bright" : "bg-surface"}`} />
                ))}
              </div>
              <p className="mt-6 text-caption font-semibold text-ink-subtle">
                Question {step + 1} of 4
              </p>
              <h2 className="mt-1 text-h2 font-bold">{QUESTIONS[step]}</h2>

              {step === 0 && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {REGIONS.map((x) => (
                    <Choice
                      key={x.slug}
                      title={x.name}
                      hint={x.short}
                      on={region === x.slug}
                      onClick={() => {
                        setRegion(x.slug);
                        setCondition("");
                        setStep(1);
                      }}
                    />
                  ))}
                </div>
              )}
              {step === 1 && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {conditions.map((c) => (
                    <Choice
                      key={c.slug}
                      title={c.name}
                      on={condition === c.slug}
                      onClick={() => {
                        setCondition(c.slug);
                        setStep(2);
                      }}
                    />
                  ))}
                  <Choice
                    title="Not sure, or something else"
                    hint="We will rank by recovery stage instead"
                    on={condition === "" && step > 1}
                    onClick={() => {
                      setCondition("");
                      setStep(2);
                    }}
                  />
                </div>
              )}
              {step === 2 && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {STAGES.map((s) => (
                    <Choice
                      key={s.id}
                      title={s.label}
                      hint={s.hint}
                      on={stage === s.id}
                      onClick={() => {
                        setStage(s.id);
                        setStep(3);
                      }}
                    />
                  ))}
                </div>
              )}
              {step === 3 && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {BUDGETS.map((b) => (
                    <Choice
                      key={b.id}
                      title={b.label}
                      on={budget === b.id}
                      onClick={() => {
                        setBudget(b.id);
                        setStep(4);
                      }}
                    />
                  ))}
                </div>
              )}

              {step > 0 && (
                <button type="button" onClick={() => setStep(step - 1)} className="mt-8 inline-flex min-h-[44px] items-center gap-2 text-small font-semibold text-brand">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </button>
              )}
            </section>
            <aside className="hidden lg:block">
              <div className="overflow-hidden rounded-card">
                <Photo name={r ? r.photo : "fitting-afo"} className="aspect-[4/5] w-full object-cover" />
              </div>
              <p className="mt-3 text-caption text-ink-subtle">The Fit Finder suggests. It does not diagnose. If you are unsure what your injury needs, ask the clinician treating you.</p>
            </aside>
          </div>
        ) : (
          <section>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-h2 font-bold">
                  {results.length ? `${results.length} suggestions for the ${r?.name.toLowerCase()}` : "Nothing matched every answer"}
                </h2>
                <p className="mt-2 max-w-2xl text-ink-muted">Ranked by how well each product matches your answers. Typical uses are not a recommendation for you; check with your clinician before you order.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="ghost" onClick={reset}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Start again
                </Button>
                <Button to={`/shop/${region}${condition ? `?condition=${condition}` : ""}`} variant="primary">
                  See every match <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
            {results.length ? (
              <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
                {results.map((p) => (
                  <li key={p.slug}>
                    <ProductCard product={p} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-8 rounded-card border border-line bg-surface-raised p-8">
                <p className="text-ink-muted">
                  Try a different budget, or{" "}
                  <Link to={`/shop/${region}`} className="text-brand underline">
                    browse every {r?.name.toLowerCase()} product
                  </Link>
                  .
                </p>
              </div>
            )}
          </section>
        )}
      </Container>
    </>
  );
}
