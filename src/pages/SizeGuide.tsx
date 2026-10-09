import { Link } from "react-router-dom";
import Container from "../components/Container";
import PageHero from "../components/PageHero";
import Photo from "../components/Photo";
import { usePageMeta } from "../lib/usePageMeta";

/*
  General measuring help by body region. Every product page still shows the
  manufacturer's own method, which always wins over this page.
*/
const SECTIONS = [
  { id: "knee", title: "Knee", photo: "region-knee", steps: ["Stand with the knee slightly bent.", "Measure around the thigh 6 inches above the middle of the kneecap.", "Measure around the calf 6 inches below it.", "Some sleeves use the circumference at the middle of the kneecap instead."] },
  { id: "foot-ankle", title: "Foot and ankle", photo: "ankle-strap", steps: ["Walker boots and post-op shoes are sized by shoe size. Use your usual size, not a size up.", "Ankle braces often use the circumference around the ankle bones, or shoe size.", "Night splints and AFOs usually use shoe size, and some add calf circumference."] },
  { id: "back-hip", title: "Back and hip", photo: "region-back-hip", steps: ["Measure around the waist at the level of the belly button, not at your trouser size.", "SI belts measure around the hips, across the widest part of the buttocks.", "Rigid braces often come in universal sizes with trim-to-fit panels."] },
  { id: "neck", title: "Neck", photo: "region-neck", steps: ["Soft collars use neck circumference, measured just below the Adam's apple.", "Rigid collars also use the distance from the chin to the top of the shoulder. These are best fitted by a clinician."] },
  { id: "shoulder", title: "Shoulder and arm", photo: "region-shoulder", steps: ["Slings are sized from the elbow to the base of the little finger, measured along the forearm.", "Immobilizers often use chest circumference as well."] },
  { id: "elbow", title: "Elbow", photo: "region-elbow", steps: ["Counterforce straps measure around the forearm, 1 inch below the elbow crease.", "Sleeves measure around the elbow with the arm straight."] },
  { id: "hand-wrist", title: "Hand and wrist", photo: "region-hand-wrist", steps: ["Measure around the wrist, just above the wrist bone.", "Thumb spicas may also use the circumference at the base of the thumb.", "Choose left or right for the hand you will wear it on."] },
];

export default function SizeGuide() {
  usePageMeta({ title: "Size guide", description: "How to measure for knee, ankle, back, neck, shoulder, elbow and wrist braces with a soft tape, and how to read a manufacturer's size chart." });
  return (
    <>
      <PageHero eyebrow="Help" title="How to measure for a brace" intro="A soft tape measure and five minutes. Measure bare skin, write the numbers in inches, and compare them with the chart on the product page." crumbs={[{ label: "Size guide" }]}>
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Jump to a body region">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full border border-on-dark/30 px-3.5 py-1.5 text-caption text-on-dark-brand hover:border-brand-bright hover:text-on-dark">
              {s.title}
            </a>
          ))}
        </nav>
      </PageHero>
      <Container className="space-y-6 py-12">
        <div className="rounded-card bg-brand-tint p-5 text-small">
          <strong>Between two sizes?</strong> Choose the smaller size for a sleeve and the larger size for a brace with adjustable straps. Or add your numbers to your order request and we will check them before you pay.
        </div>
        {SECTIONS.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-[190px] grid gap-6 overflow-hidden rounded-card border border-line bg-surface-raised md:grid-cols-[280px_1fr]">
            <Photo name={s.photo} className={`h-48 w-full object-cover md:h-full ${i % 2 ? "md:order-2" : ""}`} />
            <div className="p-6">
              <h2 className="text-h3 font-bold">{s.title}</h2>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-ink-muted">
                {s.steps.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ol>
              <Link to={`/shop/${s.id === "shoulder" ? "shoulder" : s.id}`} className="mt-4 inline-block text-small font-semibold text-brand underline">
                Shop {s.title.toLowerCase()} products
              </Link>
            </div>
          </section>
        ))}
      </Container>
    </>
  );
}
