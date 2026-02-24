interface StatusBadgeProps {
  status: "active" | "inactive" | "error" | "warning";
}

const statusConfig: Record<
  StatusBadgeProps["status"],
  { label: string; dotClass: string; bgClass: string; textClass: string }
> = {
  active: {
    label: "Active",
    dotClass: "bg-emerald-400",
    bgClass: "bg-emerald-400/10",
    textClass: "text-emerald-400",
  },
  inactive: {
    label: "Inactive",
    dotClass: "bg-zinc-500",
    bgClass: "bg-zinc-500/10",
    textClass: "text-zinc-400",
  },
  error: {
    label: "Error",
    dotClass: "bg-red-400",
    bgClass: "bg-red-400/10",
    textClass: "text-red-400",
  },
  warning: {
    label: "Warning",
    dotClass: "bg-amber-400",
    bgClass: "bg-amber-400/10",
    textClass: "text-amber-400",
  },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgClass} ${config.textClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`} />
      {config.label}
    </span>
  );
}
