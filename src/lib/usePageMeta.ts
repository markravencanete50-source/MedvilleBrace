/*
  Keeps the document head in step with the page. React Router changes the
  address without a reload, so every tag is rewritten on every page, including
  back to the default; a tag left holding the last page's value is worse than
  none. scripts/prerender.mjs writes the same values into static HTML for
  crawlers that do not run JavaScript.
*/
import { useEffect } from "react";
import { SITE_NAME, SITE_ORIGIN } from "../data/site";

const DEFAULT_DESC =
  "Orthopedic braces, supports and recovery products from trusted manufacturers, chosen by body region and condition, with sizing help from a real person.";

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

export function pageTitle(title?: string) {
  return title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | Orthopedic Braces and Supports`;
}

export function usePageMeta({
  title,
  description,
  image,
  noindex,
}: {
  title?: string;
  description?: string;
  image?: string;
  noindex?: boolean;
}) {
  useEffect(() => {
    const full = pageTitle(title);
    const desc = description || DEFAULT_DESC;
    const url = `${SITE_ORIGIN}${window.location.pathname}`;
    const pic = image ? (image.startsWith("http") ? image : `${SITE_ORIGIN}${image}`) : `${SITE_ORIGIN}/og-image.jpg`;
    document.title = full;
    setMeta("name", "description", desc);
    setMeta("property", "og:title", full);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", pic);
    setMeta("name", "twitter:title", full);
    setMeta("name", "twitter:description", desc);
    setMeta("name", "twitter:image", pic);
    setMeta("name", "robots", noindex ? "noindex, follow" : "index, follow");
    let canon = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canon) {
      canon = document.createElement("link");
      canon.rel = "canonical";
      document.head.appendChild(canon);
    }
    canon.href = url;
  }, [title, description, image, noindex]);
}
