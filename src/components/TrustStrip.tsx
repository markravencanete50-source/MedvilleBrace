import { BadgeCheck, Ruler, Truck, Undo2 } from "lucide-react";
import Container from "./Container";
import { COMPANY } from "../data/site";

const ITEMS = [
  { icon: Ruler, title: "Size checked first", text: "A person reviews every size before you pay." },
  { icon: Truck, title: `Free over $${COMPANY.freeShippingFrom}`, text: "Standard shipping on confirmed orders." },
  { icon: Undo2, title: `${COMPANY.returnDays}-day returns`, text: "Wrong size? Most swaps are free." },
  { icon: BadgeCheck, title: "Genuine brands", text: "Devices clinicians already prescribe." },
];

export default function TrustStrip() {
  return (
    <section aria-label="Why order here" className="border-b border-line bg-surface-raised">
      <Container className="grid grid-cols-2 gap-x-4 gap-y-5 py-6 lg:grid-cols-4">
        {ITEMS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-ink">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-display text-small font-semibold">{title}</p>
              <p className="text-caption text-ink-muted">{text}</p>
            </div>
          </div>
        ))}
      </Container>
    </section>
  );
}
