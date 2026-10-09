import { Link } from "react-router-dom";
import { Mail, Clock } from "lucide-react";
import Container from "./Container";
import Logo from "./Logo";
import { REGIONS } from "../data/taxonomy";
import { COMPANY, SITE_TAGLINE } from "../data/site";

const COLUMNS: { title: string; links: [string, string][] }[] = [
  { title: "Shop", links: [...REGIONS.map((r) => [`/shop/${r.slug}`, r.name] as [string, string]), ["/brands", "All brands"]] },
  {
    title: "Help",
    links: [
      ["/fit-finder", "Fit Finder"],
      ["/size-guide", "Size guide"],
      ["/guides", "Recovery guides"],
      ["/faq", "Questions and answers"],
      ["/contact", "Contact us"],
    ],
  },
  {
    title: "Company",
    links: [
      ["/about", "About Medville Brace"],
      ["/clinicians", "Clinician Partner Program"],
      ["/policies/how-ordering-works", "How ordering works"],
      ["/policies/insurance", "Insurance information"],
    ],
  },
  {
    title: "Policies",
    links: [
      ["/policies/shipping", "Shipping"],
      ["/policies/returns", "Returns and exchanges"],
      ["/policies/warranty", "Warranty"],
      ["/policies/medical-disclaimer", "Medical disclaimer"],
      ["/policies/privacy", "Privacy policy"],
      ["/policies/terms", "Terms of use"],
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-band text-on-dark-brand">
      <Container className="grid gap-10 py-14 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div className="max-w-xs">
          <Logo onDark />
          <p className="mt-4 text-small">{SITE_TAGLINE} Braces, supports and recovery products from the manufacturers clinicians already use.</p>
          <ul className="mt-6 space-y-3 text-small">
            <li className="flex items-start gap-2.5">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-on-dark-accent" aria-hidden="true" />
              <a href={`mailto:${COMPANY.email}`} className="break-all hover:text-on-dark">
                {COMPANY.email}
              </a>
            </li>
            {COMPANY.phone && (
              <li>
                <a href={`tel:${COMPANY.phone.replace(/[^\d+]/g, "")}`} className="hover:text-on-dark">
                  {COMPANY.phone}
                </a>
              </li>
            )}
            <li className="flex items-start gap-2.5">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-on-dark-accent" aria-hidden="true" />
              <span>{COMPANY.hours}</span>
            </li>
          </ul>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="font-display text-small font-semibold text-on-dark">{col.title}</p>
            <ul className="mt-4 space-y-2.5 text-small">
              {col.links.map(([to, label]) => (
                <li key={to}>
                  <Link to={to} className="hover:text-on-dark">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <div className="border-t border-on-dark/15">
        <Container className="flex flex-col gap-3 py-6 text-caption text-on-dark-muted md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Medville Brace. All rights reserved.</p>
          <p className="max-w-2xl md:text-right">
            Information on this site is general and is not medical advice. Brand names belong to their owners and do not imply endorsement.
          </p>
        </Container>
      </div>
    </footer>
  );
}
