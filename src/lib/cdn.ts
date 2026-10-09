/*
  Image delivery.

  Photographs are uploaded once to Cloudinary by scripts/upload-cloudinary.mjs,
  which records each upload in src/data/cloudinary.json. A photo listed there
  is served from Cloudinary at the width the layout needs, in the best format
  the browser accepts (f_auto) and quality (q_auto). A photo not listed yet is
  served from this site's own public folder, so the site works before, during
  and without an upload.

  The version number in each URL changes whenever a photo is replaced, so a
  long browser cache never shows an old picture.
*/
import map from "../data/cloudinary.json";

type CdnMap = { cloud: string; folder: string; assets: Record<string, { v: number; h: string }> };
const CDN = map as CdnMap;

/* key: a path under public/ without the extension, e.g. "products/<slug>/1" or "photography/hero" */
export function cdnUrl(key: string, width: number, localPath: string): string {
  const asset = CDN.cloud ? CDN.assets[key] : undefined;
  if (!asset) return localPath;
  return `https://res.cloudinary.com/${CDN.cloud}/image/upload/f_auto,q_auto,c_limit,w_${width}/v${asset.v}/${CDN.folder}/${key}`;
}

export const cdnEnabled = () => Boolean(CDN.cloud);
