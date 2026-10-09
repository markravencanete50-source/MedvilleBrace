import { Link } from "react-router-dom";

/*
  Buttons are cyan or navy, nothing else, and hovering swaps one for the
  other: the Medville family rule. Text on cyan is navy, text on navy is
  white; white on cyan fails contrast and is never paired.
*/
type Variant = "cta" | "primary" | "ghost" | "ghost-dark" | "soft";

const styles: Record<Variant, string> = {
  cta: "bg-brand-bright text-ink shadow-cta hover:bg-ink hover:text-on-dark",
  primary: "bg-ink text-on-dark shadow-raised hover:bg-brand-bright hover:text-ink",
  ghost: "border-[1.5px] border-ink/30 text-ink hover:border-ink hover:bg-ink hover:text-on-dark",
  "ghost-dark": "border-[1.5px] border-on-dark/50 text-on-dark hover:border-brand-bright hover:bg-brand-bright hover:text-ink",
  soft: "bg-brand-soft text-ink hover:bg-ink hover:text-on-dark",
};

type Props = {
  to?: string;
  href?: string;
  variant?: Variant;
  size?: "md" | "sm";
  children: React.ReactNode;
  className?: string;
  type?: "submit" | "button";
  disabled?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
};

export default function Button({ to, href, variant = "cta", size = "md", children, className = "", type, disabled, onClick, ariaLabel }: Props) {
  const sizing = size === "sm" ? "min-h-[40px] px-4 py-2 text-small" : "min-h-[48px] px-7 py-3 text-small";
  const cls = `inline-flex items-center justify-center gap-2 rounded-full font-display font-semibold transition-colors duration-(--duration-base) disabled:cursor-not-allowed disabled:opacity-55 ${sizing} ${styles[variant]} ${className}`;
  if (to)
    return (
      <Link to={to} className={cls} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  if (href)
    return (
      <a href={href} className={cls} aria-label={ariaLabel}>
        {children}
      </a>
    );
  return (
    <button type={type ?? "button"} disabled={disabled} onClick={onClick} className={cls} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
