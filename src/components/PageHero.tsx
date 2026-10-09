import Container from "./Container";
import Breadcrumbs, { type Crumb } from "./Breadcrumbs";

/* Every inner page opens on the navy wash, as on the family site. */
export default function PageHero({
  eyebrow,
  title,
  intro,
  crumbs,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  crumbs?: Crumb[];
  children?: React.ReactNode;
}) {
  return (
    <section className="bg-wash text-on-dark">
      <Container className="py-10 sm:py-14">
        {crumbs && <Breadcrumbs items={crumbs} onDark />}
        {eyebrow && <p className="mt-6 font-display text-caption font-semibold uppercase tracking-[0.18em] text-on-dark-accent">{eyebrow}</p>}
        <h1 className={`${eyebrow ? "mt-2" : "mt-6"} max-w-3xl text-h1 font-bold`}>{title}</h1>
        {intro && <p className="mt-4 max-w-2xl text-body-lg text-on-dark-brand">{intro}</p>}
        {children}
      </Container>
    </section>
  );
}
