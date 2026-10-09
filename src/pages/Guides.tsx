import { Link, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Container from "../components/Container";
import PageHero from "../components/PageHero";
import Photo from "../components/Photo";
import ProductCard from "../components/ProductCard";
import Button from "../components/Button";
import NotFound from "./NotFound";
import { GUIDES, guideBySlug } from "../data/guides";
import { PRODUCTS, pluralCategory, categoryName, sortProducts } from "../data/catalog";
import { usePageMeta } from "../lib/usePageMeta";

export function GuidesIndex() {
  usePageMeta({ title: "Recovery guides", description: "Plain-English guides to measuring for a brace, choosing a walker boot or back brace, and using cold therapy and night splints safely." });
  return (
    <>
      <PageHero eyebrow="Learn" title="Recovery guides" intro="Short, plain guides to choosing and living with a brace. They support, and never replace, advice from your own clinician." crumbs={[{ label: "Guides" }]} />
      <Container className="py-12">
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link to={`/guides/${g.slug}`} className="group block h-full overflow-hidden rounded-card border border-line bg-surface-raised shadow-raised hover:shadow-raised-hover">
                <Photo name={g.photo} className="aspect-[16/9] w-full object-cover" />
                <div className="p-5">
                  <p className="text-caption text-ink-subtle">{g.minutes} minute read</p>
                  <h2 className="mt-1 font-display text-h3 font-semibold group-hover:underline">{g.title}</h2>
                  <p className="mt-2 text-small text-ink-muted">{g.description}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}

export function GuidePage() {
  const { slug = "" } = useParams();
  const g = guideBySlug(slug);
  usePageMeta({ title: g?.title ?? "Guide not found", description: g?.description, image: g ? `/photography/${g.photo}.webp` : undefined, noindex: !g });
  if (!g) return <NotFound />;
  const picks = g.category ? sortProducts(PRODUCTS.filter((p) => p.category === g.category && p.images > 0), "featured").slice(0, 4) : [];
  const more = GUIDES.filter((x) => x.slug !== g.slug).slice(0, 2);

  return (
    <>
      <PageHero eyebrow={`${g.minutes} minute read`} title={g.title} intro={g.description} crumbs={[{ label: "Guides", to: "/guides" }, { label: g.title }]} />
      <Container className="py-10">
        <div className="mx-auto max-w-3xl">
          <Photo name={g.photo} priority className="aspect-[16/8] w-full rounded-card object-cover" />
          <article className="prose-mb mt-8">
            {g.sections.map((s) => (
              <section key={s.heading}>
                <h2>{s.heading}</h2>
                {s.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
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
          <p className="mt-8 rounded-card bg-brand-tint p-5 text-small text-ink-muted">
            This guide is general information, not medical advice. Your doctor, therapist or orthotist knows your injury and should guide your choices.{" "}
            <Link to="/policies/medical-disclaimer" className="text-brand underline">
              Read the medical disclaimer
            </Link>
            .
          </p>
        </div>
      </Container>

      {picks.length > 0 && g.category && (
        <section className="border-t border-line bg-soft-band py-12">
          <Container>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-h2 font-bold">{pluralCategory(categoryName(g.category))} we carry</h2>
              <Button to={`/category/${g.category}`} variant="ghost" size="sm">
                See all <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">
              {picks.map((p) => (
                <li key={p.slug}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      <section className="py-12">
        <Container>
          <h2 className="text-h3 font-bold">Keep reading</h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {more.map((m) => (
              <li key={m.slug}>
                <Link to={`/guides/${m.slug}`} className="flex items-center gap-4 rounded-card border border-line bg-surface-raised p-4 hover:border-ink">
                  <Photo name={m.photo} className="h-20 w-28 shrink-0 rounded-md object-cover" />
                  <span>
                    <span className="block font-display font-semibold">{m.title}</span>
                    <span className="text-caption text-ink-subtle">{m.minutes} minute read</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}
