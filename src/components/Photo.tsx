import photos from "../data/photos.json";

type Entry = { alt: string; w: number; h: number };
const PHOTOS = photos as Record<string, Entry>;

/* A lifestyle photograph from public/photography, with its real size and alt text. */
export default function Photo({
  name,
  className = "",
  priority = false,
  decorative = false,
}: {
  name: string;
  className?: string;
  priority?: boolean;
  decorative?: boolean;
}) {
  const p = PHOTOS[name];
  return (
    <img
      src={`/photography/${name}.webp`}
      alt={decorative ? "" : (p?.alt ?? "")}
      width={p?.w}
      height={p?.h}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={className}
    />
  );
}
