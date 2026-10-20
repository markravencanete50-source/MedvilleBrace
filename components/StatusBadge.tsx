import { ORDER_STATUSES, PRODUCT_STATUSES } from "@/lib/types";

const LABELS: Record<string, string> = {
  ...Object.fromEntries(PRODUCT_STATUSES.map((s) => [s.value, s.label])),
  ...Object.fromEntries(ORDER_STATUSES.map((s) => [s.value, s.label])),
  active: "Active",
  abandoned: "Abandoned",
  converted: "Converted",
};

export default function StatusBadge({ status }: { status: string }) {
  return <span className={`badge b-${status}`}>{LABELS[status] ?? status}</span>;
}
