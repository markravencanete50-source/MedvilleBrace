import { Mark } from "./Logo";
import { imageSrc, type Product } from "../data/catalog";

/*
  A product photograph on a white stage. A product with no photograph shows a
  plain branded tile that says so, never a stock or generated stand-in.
*/
export default function ProductImage({
  product,
  n = 1,
  size = "sm",
  eager = false,
  className = "",
}: {
  product: Product;
  n?: number;
  size?: "sm" | "lg";
  eager?: boolean;
  className?: string;
}) {
  if (product.images < n) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-brand-tint text-ink-subtle ${className}`}>
        <Mark className="h-9 w-9 opacity-70" />
        <span className="text-caption">Photo coming soon</span>
      </div>
    );
  }
  return (
    <div className={`bg-photo ${className}`}>
      <img
        src={imageSrc(product, n, size)}
        alt={n === 1 ? `${product.brand} ${product.title}` : `${product.title}, view ${n}`}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="h-full w-full object-contain p-3"
      />
    </div>
  );
}
