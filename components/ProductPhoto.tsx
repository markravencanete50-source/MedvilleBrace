import type { Product } from "@/lib/types";

/** Shows the product image when one is set; otherwise an honest "no photo yet" panel. */
export default function ProductPhoto({ product }: { product: Product }) {
  return (
    <div className="photo">
      {product.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.image} alt={product.name} loading="lazy" />
      ) : (
        <span>Product photo coming soon</span>
      )}
    </div>
  );
}
