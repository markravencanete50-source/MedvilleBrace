import { useEffect, useMemo, useState } from "react";
import type { ProductDetail } from "../data/catalog";

/*
  Choosing a size, side or colour for a product. Shared by the product page and
  the quick-add pop-up so both offer exactly the same choices.

  The first choice starts on the first option that is in stock. An option value
  is offered when some variant has it alongside the values already picked for
  the options before it; picking an earlier option keeps later picks that still
  exist and otherwise moves to the first one that does.
*/
export function useVariantPicker(detail: ProductDetail | null) {
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    const first = detail ? (detail.variants.find((v) => v.a) ?? detail.variants[0]) : undefined;
    setPicked(first ? [...first.o] : []);
  }, [detail]);

  const variant = useMemo(() => {
    if (!detail) return undefined;
    if (!detail.optionNames.length) return detail.variants[0];
    return detail.variants.find((v) => v.o.every((x, i) => x === picked[i]));
  }, [detail, picked]);

  /* The values to show for option i, each with whether any matching variant is in stock. */
  const valuesFor = (i: number) => {
    if (!detail) return [];
    const seen = new Map<string, boolean>();
    for (const v of detail.variants) {
      const fits = v.o.slice(0, i).every((x, j) => x === picked[j]);
      if (!fits) continue;
      seen.set(v.o[i], (seen.get(v.o[i]) ?? false) || v.a);
    }
    return [...seen.entries()];
  };

  const choose = (i: number, value: string) => {
    if (!detail) return;
    const next = [...picked];
    next[i] = value;
    /* Keep later choices when they still exist with this value; otherwise take the first that does. */
    for (let j = i + 1; j < detail.optionNames.length; j++) {
      const ok = detail.variants.some((v) => v.o.slice(0, j).every((x, k) => x === next[k]) && v.o[j] === next[j]);
      if (!ok) {
        const v = detail.variants.find((x) => x.o.slice(0, j).every((y, k) => y === next[k]));
        next[j] = v?.o[j] ?? next[j];
      }
    }
    setPicked(next);
  };

  return { picked, variant, valuesFor, choose };
}
