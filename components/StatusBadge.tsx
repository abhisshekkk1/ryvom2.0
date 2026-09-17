import type { CheckInStatus } from "@/lib/types";

const STATUS_STYLES: Record<CheckInStatus, string> = {
  pending: "bg-amber-500/10 text-amber-400",
  reviewed: "bg-emerald-500/10 text-emerald-400",
  follow_up: "bg-red-500/10 text-red-400",
};

const STATUS_LABELS: Record<CheckInStatus, string> = {
  pending: "Pending",
  reviewed: "Reviewed",
  follow_up: "Follow-up",
};

export default function StatusBadge({ status }: { status: CheckInStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function StatusDot({ status }: { status: CheckInStatus }) {
  const colors: Record<CheckInStatus, string> = {
    pending: "bg-amber-400",
    reviewed: "bg-emerald-400",
    follow_up: "bg-red-400",
  };
  return <span className={`h-2 w-2 rounded-full ${colors[status]}`} />;
}
