/*
  Client-side search over the catalog index. Built once, on first use, so the
  index costs nothing on pages that never search.
*/
import MiniSearch from "minisearch";
import { PRODUCTS, categoryName, type Product } from "../data/catalog";
import { regionBySlug } from "../data/taxonomy";

let index: MiniSearch<Product & { id: string; categoryLabel: string; regionLabel: string; conditionText: string; codes: string }> | null = null;

function build() {
  const ms = new MiniSearch({
    idField: "id",
    fields: ["title", "subtitle", "brand", "categoryLabel", "regionLabel", "conditionText", "codes"],
    storeFields: ["slug"],
    searchOptions: {
      boost: { title: 3, brand: 2, categoryLabel: 2, codes: 2 },
      prefix: true,
      fuzzy: 0.18,
      combineWith: "AND",
    },
  });
  ms.addAll(
    PRODUCTS.map((p) => ({
      ...p,
      id: p.slug,
      categoryLabel: categoryName(p.category),
      regionLabel: regionBySlug(p.region)?.name ?? "",
      conditionText: p.conditions.join(" "),
      codes: p.hcpcs.join(" "),
    })),
  );
  return ms;
}

/* Returns product slugs, best match first. Falls back to OR when AND finds nothing. */
export function searchSlugs(query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  index ??= build();
  let hits = index.search(q);
  if (!hits.length) hits = index.search(q, { combineWith: "OR" });
  return hits.map((h) => String(h.id));
}
